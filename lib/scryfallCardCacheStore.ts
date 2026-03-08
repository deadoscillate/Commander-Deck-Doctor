import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { ScryfallCard } from "./types";

type StoredRow = {
  cache_key: string;
  card_json: string;
  updated_at: string;
};

type SqliteDatabase = import("node:sqlite").DatabaseSync;

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "scryfall-card-cache.sqlite");
const DEFAULT_RETENTION_DAYS = 45;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;
const RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const POSTGRES_BATCH_CHUNK = 250;
const SQLITE_BATCH_CHUNK = 250;

let db: SqliteDatabase | null = null;
let sqliteReady: Promise<SqliteDatabase | null> | null = null;
let pgPool: Pool | null = null;
let postgresReady: Promise<void> | null = null;
let nextRetentionSweepAtMs = 0;
let sqliteQueue: Promise<unknown> = Promise.resolve();

function shouldUsePostgres(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL);
}

function shouldAllowSqliteFallback(): boolean {
  return !process.env.VERCEL;
}

function isPersistentCardCacheEnabled(): boolean {
  if (process.env.NODE_ENV === "test") {
    return false;
  }

  const configured = process.env.SCRYFALL_CARD_CACHE_ENABLED;
  if (configured === "0") {
    return false;
  }

  if (configured === "1") {
    return shouldUsePostgres() || shouldAllowSqliteFallback();
  }

  return shouldUsePostgres() || shouldAllowSqliteFallback();
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getRetentionDays(): number {
  const parsed = parsePositiveInt(process.env.SCRYFALL_CARD_CACHE_RETENTION_DAYS);
  if (!parsed) {
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.min(Math.max(parsed, MIN_RETENTION_DAYS), MAX_RETENTION_DAYS);
}

function shouldRunRetentionSweep(nowMs: number): boolean {
  if (nowMs < nextRetentionSweepAtMs) {
    return false;
  }

  nextRetentionSweepAtMs = nowMs + RETENTION_SWEEP_INTERVAL_MS;
  return true;
}

function getRetentionCutoffIso(nowMs: number): string {
  const retentionDays = getRetentionDays();
  const cutoffMs = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  return new Date(cutoffMs).toISOString();
}

function normalizePostgresConnectionString(value: string): string {
  try {
    const parsed = new URL(value);
    const sslMode = parsed.searchParams.get("sslmode");
    const useLibpqCompat = parsed.searchParams.get("uselibpqcompat");
    if (!useLibpqCompat && (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca")) {
      parsed.searchParams.set("sslmode", "verify-full");
    }

    return parsed.toString();
  } catch {
    return value;
  }
}

function getPostgresConnectionString(): string {
  const value = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;
  if (!value) {
    throw new Error("No Postgres connection string found in environment.");
  }

  return normalizePostgresConnectionString(value);
}

function getPostgresPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: getPostgresConnectionString(),
      max: 1
    });
  }

  return pgPool;
}

async function ensurePostgresTable(): Promise<void> {
  if (!postgresReady) {
    postgresReady = (async () => {
      await getPostgresPool().query(
        `
        CREATE TABLE IF NOT EXISTS scryfall_card_cache (
          cache_key TEXT PRIMARY KEY,
          card_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `
      );
      await getPostgresPool().query(
        `
        CREATE INDEX IF NOT EXISTS idx_scryfall_card_cache_updated_at
          ON scryfall_card_cache (updated_at)
      `
      );
    })().catch((error) => {
      postgresReady = null;
      throw error;
    });
  }

  await postgresReady;
}

async function ensureDb(): Promise<SqliteDatabase | null> {
  if (db) {
    return db;
  }

  if (sqliteReady) {
    return sqliteReady;
  }

  if (!shouldAllowSqliteFallback()) {
    return null;
  }

  sqliteReady = (async () => {
    const { DatabaseSync } = await import("node:sqlite");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS scryfall_card_cache (
        cache_key TEXT PRIMARY KEY,
        card_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scryfall_card_cache_updated_at
        ON scryfall_card_cache (updated_at);
    `);

    return db;
  })().catch((error) => {
    sqliteReady = null;
    throw error;
  });

  return sqliteReady;
}

function chunkArray<T>(rows: T[], chunkSize: number): T[][] {
  if (rows.length === 0) {
    return [];
  }

  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

async function pruneExpiredRowsPostgres(cutoffIso: string): Promise<void> {
  await getPostgresPool().query("DELETE FROM scryfall_card_cache WHERE updated_at < $1", [cutoffIso]);
}

function pruneExpiredRowsSqlite(database: SqliteDatabase, cutoffIso: string): void {
  database.prepare("DELETE FROM scryfall_card_cache WHERE updated_at < ?").run(cutoffIso);
}

async function maybePruneExpiredRows(database: SqliteDatabase | null): Promise<void> {
  const nowMs = Date.now();
  if (!shouldRunRetentionSweep(nowMs)) {
    return;
  }

  const cutoffIso = getRetentionCutoffIso(nowMs);
  try {
    if (shouldUsePostgres()) {
      await pruneExpiredRowsPostgres(cutoffIso);
      return;
    }

    if (database) {
      pruneExpiredRowsSqlite(database, cutoffIso);
    }
  } catch (error) {
    console.error("Scryfall card cache retention sweep failed", {
      cutoffIso,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function safeParseCard(json: string): ScryfallCard | null {
  try {
    const parsed = JSON.parse(json) as ScryfallCard;
    return parsed && typeof parsed.name === "string" ? parsed : null;
  } catch {
    return null;
  }
}

async function runSqliteTask<T>(task: (database: SqliteDatabase) => Promise<T> | T): Promise<T | null> {
  const scheduled = sqliteQueue.then(async () => {
    const database = await ensureDb();
    if (!database) {
      return null;
    }

    return task(database);
  });
  sqliteQueue = scheduled.then(
    () => undefined,
    () => undefined
  );
  return scheduled;
}

export async function getCachedScryfallCards(keys: string[]): Promise<Map<string, ScryfallCard>> {
  const uniqueKeys = [...new Set(keys.filter((key) => typeof key === "string" && key.trim().length > 0))];
  if (!isPersistentCardCacheEnabled() || uniqueKeys.length === 0) {
    return new Map();
  }

  try {
    if (shouldUsePostgres()) {
      await ensurePostgresTable();
      await maybePruneExpiredRows(null);
      const results = new Map<string, ScryfallCard>();
      for (const chunk of chunkArray(uniqueKeys, POSTGRES_BATCH_CHUNK)) {
        const query = await getPostgresPool().query<StoredRow>(
          `
          SELECT cache_key, card_json, updated_at
          FROM scryfall_card_cache
          WHERE cache_key = ANY($1)
        `,
          [chunk]
        );
        for (const row of query.rows) {
          const card = safeParseCard(row.card_json);
          if (card) {
            results.set(row.cache_key, card);
          }
        }
      }
      return results;
    }

    const results = await runSqliteTask(async (database) => {
      await maybePruneExpiredRows(database);
      const found = new Map<string, ScryfallCard>();
      for (const chunk of chunkArray(uniqueKeys, SQLITE_BATCH_CHUNK)) {
        const placeholders = chunk.map(() => "?").join(",");
        const statement = database.prepare(
          `SELECT cache_key, card_json, updated_at FROM scryfall_card_cache WHERE cache_key IN (${placeholders})`
        );
        const rows = statement.all(...chunk) as StoredRow[];
        for (const row of rows) {
          const card = safeParseCard(row.card_json);
          if (card) {
            found.set(row.cache_key, card);
          }
        }
      }
      return found;
    });
    return results ?? new Map();
  } catch (error) {
    console.error("Scryfall card cache read failed", {
      count: uniqueKeys.length,
      error: error instanceof Error ? error.message : String(error)
    });
    return new Map();
  }
}

export async function saveCachedScryfallCards(entries: Array<{ key: string; card: ScryfallCard }>): Promise<void> {
  if (!isPersistentCardCacheEnabled() || entries.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const deduped = new Map<string, string>();
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) {
      continue;
    }

    deduped.set(key, JSON.stringify(entry.card));
  }

  if (deduped.size === 0) {
    return;
  }

  try {
    if (shouldUsePostgres()) {
      await ensurePostgresTable();
      await maybePruneExpiredRows(null);
      for (const chunk of chunkArray([...deduped.entries()], POSTGRES_BATCH_CHUNK)) {
        const values: string[] = [];
        const params: string[] = [];
        chunk.forEach(([key, cardJson], index) => {
          const base = index * 3;
          values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
          params.push(key, cardJson, now);
        });

        await getPostgresPool().query(
          `
          INSERT INTO scryfall_card_cache (cache_key, card_json, updated_at)
          VALUES ${values.join(", ")}
          ON CONFLICT (cache_key) DO UPDATE SET
            card_json = EXCLUDED.card_json,
            updated_at = EXCLUDED.updated_at
        `,
          params
        );
      }
      return;
    }

    await runSqliteTask(async (database) => {
      await maybePruneExpiredRows(database);
      const statement = database.prepare(
        `
        INSERT INTO scryfall_card_cache (cache_key, card_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          card_json = excluded.card_json,
          updated_at = excluded.updated_at
      `
      );
      for (const [key, cardJson] of deduped.entries()) {
        statement.run(key, cardJson, now);
      }
    });
  } catch (error) {
    console.error("Scryfall card cache write failed", {
      count: deduped.size,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
