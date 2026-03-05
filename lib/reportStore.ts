import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { AnalyzeResponse } from "./contracts";

type StoredRow = {
  hash: string;
  decklist: string;
  analysis_json: string;
  created_at: string;
  updated_at: string;
};

export type SavedReport = {
  hash: string;
  decklist: string;
  analysis: AnalyzeResponse;
  createdAt: string;
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "reports.sqlite");

type SqliteDatabase = import("node:sqlite").DatabaseSync;

let db: SqliteDatabase | null = null;
let pgPool: Pool | null = null;
let postgresReady: Promise<void> | null = null;

function shouldUsePostgres(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL);
}

function shouldAllowSqliteFallback(): boolean {
  return !process.env.VERCEL;
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
        CREATE TABLE IF NOT EXISTS shared_reports (
          hash TEXT PRIMARY KEY,
          decklist TEXT NOT NULL,
          analysis_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `
      );
    })().catch((error) => {
      postgresReady = null;
      throw error;
    });
  }

  await postgresReady;
}

async function ensureDb(): Promise<SqliteDatabase> {
  if (db) {
    return db;
  }

  const { DatabaseSync } = await import("node:sqlite");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_reports (
      hash TEXT PRIMARY KEY,
      decklist TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  return db;
}

function normalizeDecklist(decklist: string): string {
  return decklist.replace(/\r\n/g, "\n").trim();
}

export function createDeckHash(decklist: string): string {
  const normalized = normalizeDecklist(decklist);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 20);
}

export function isValidReportHash(hash: string): boolean {
  return /^[a-f0-9]{20}$/i.test(hash);
}

/**
 * Inserts or updates a saved report by deterministic deck hash.
 */
export async function saveReport(decklist: string, analysis: AnalyzeResponse): Promise<{ hash: string }> {
  const hash = createDeckHash(decklist);
  const now = new Date().toISOString();
  const normalizedDecklist = normalizeDecklist(decklist);

  if (shouldUsePostgres()) {
    await ensurePostgresTable();
    await getPostgresPool().query(
      `
      INSERT INTO shared_reports (hash, decklist, analysis_json, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (hash) DO UPDATE SET
        decklist = EXCLUDED.decklist,
        analysis_json = EXCLUDED.analysis_json,
        updated_at = EXCLUDED.updated_at
    `,
      [hash, normalizedDecklist, JSON.stringify(analysis), now, now]
    );
    return { hash };
  }

  if (!shouldAllowSqliteFallback()) {
    throw new Error("No Vercel Postgres connection string found (POSTGRES_URL or DATABASE_URL).");
  }

  const database = await ensureDb();
  const statement = database.prepare(
    `
      INSERT INTO shared_reports (hash, decklist, analysis_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(hash) DO UPDATE SET
        decklist = excluded.decklist,
        analysis_json = excluded.analysis_json,
        updated_at = excluded.updated_at
    `
  );
  statement.run(hash, normalizedDecklist, JSON.stringify(analysis), now, now);
  return { hash };
}

/**
 * Loads a previously saved report by hash.
 */
export async function getReport(hash: string): Promise<SavedReport | null> {
  if (!isValidReportHash(hash)) {
    return null;
  }

  if (shouldUsePostgres()) {
    await ensurePostgresTable();
    const result = await getPostgresPool().query<StoredRow>(
      `
      SELECT hash, decklist, analysis_json, created_at, updated_at
      FROM shared_reports
      WHERE hash = $1
      LIMIT 1
    `,
      [hash]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    try {
      const analysis = JSON.parse(row.analysis_json) as AnalyzeResponse;
      return {
        hash: row.hash,
        decklist: row.decklist,
        analysis,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch {
      return null;
    }
  }

  if (!shouldAllowSqliteFallback()) {
    throw new Error("No Vercel Postgres connection string found (POSTGRES_URL or DATABASE_URL).");
  }

  const database = await ensureDb();
  const statement = database.prepare(
    "SELECT hash, decklist, analysis_json, created_at, updated_at FROM shared_reports WHERE hash = ?"
  );
  const row = statement.get(hash) as StoredRow | undefined;
  if (!row) {
    return null;
  }

  try {
    const analysis = JSON.parse(row.analysis_json) as AnalyzeResponse;
    return {
      hash: row.hash,
      decklist: row.decklist,
      analysis,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch {
    return null;
  }
}
