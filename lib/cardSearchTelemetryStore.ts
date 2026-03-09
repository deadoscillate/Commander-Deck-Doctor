import { Pool } from "pg";

export type CardSearchTelemetryRecord = {
  requestId: string;
  routeKind: "commander-search" | "commander-lookup" | "card-search" | "card-lookup";
  coldStart: boolean;
  totalMs: number;
  lookupMs?: number;
  serializeMs?: number;
  responseBytes?: number;
  queryLength?: number;
  namesCount?: number;
  colorsCount?: number;
  allowedColorsCount?: number;
  resultsCount: number;
  commanderOnly: boolean;
  includePairs: boolean;
  setFilter: boolean;
  typeFilter: boolean;
};

const DEFAULT_SAMPLE_RATE = 1;
const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;
const RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let pgPool: Pool | null = null;
let tableReady: Promise<void> | null = null;
let nextRetentionSweepAtMs = 0;

function parseClampedNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (typeof raw !== "string" || !raw.trim()) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function shouldUsePostgres(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL);
}

function isTelemetryEnabled(): boolean {
  const configured = process.env.CARD_SEARCH_TELEMETRY_ENABLED;
  if (configured === "0") {
    return false;
  }

  if (configured === "1") {
    return shouldUsePostgres();
  }

  return process.env.NODE_ENV === "production" && shouldUsePostgres();
}

function getSampleRate(): number {
  return parseClampedNumber(
    process.env.CARD_SEARCH_TELEMETRY_SAMPLE_RATE ?? process.env.ANALYZE_TELEMETRY_SAMPLE_RATE,
    DEFAULT_SAMPLE_RATE,
    0,
    1
  );
}

function shouldSample(): boolean {
  const sampleRate = getSampleRate();
  if (sampleRate <= 0) {
    return false;
  }

  if (sampleRate >= 1) {
    return true;
  }

  return Math.random() < sampleRate;
}

function getRetentionDays(): number {
  return parseClampedNumber(
    process.env.CARD_SEARCH_TELEMETRY_RETENTION_DAYS ?? process.env.ANALYZE_TELEMETRY_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
    MAX_RETENTION_DAYS
  );
}

function shouldRunRetentionSweep(nowMs: number): boolean {
  if (nowMs < nextRetentionSweepAtMs) {
    return false;
  }

  nextRetentionSweepAtMs = nowMs + RETENTION_SWEEP_INTERVAL_MS;
  return true;
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

function getConnectionString(): string {
  const raw = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("Missing Postgres connection string for card-search telemetry.");
  }

  return normalizePostgresConnectionString(raw);
}

function getPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: getConnectionString(),
      max: 1
    });
  }

  return pgPool;
}

async function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await getPool().query(
        `
        CREATE TABLE IF NOT EXISTS card_search_telemetry (
          id BIGSERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          request_id TEXT NOT NULL,
          route_kind TEXT NOT NULL,
          cold_start BOOLEAN NOT NULL DEFAULT FALSE,
          total_ms DOUBLE PRECISION NOT NULL,
          lookup_ms DOUBLE PRECISION,
          serialize_ms DOUBLE PRECISION,
          response_bytes INTEGER,
          query_length INTEGER,
          names_count INTEGER,
          colors_count INTEGER NOT NULL DEFAULT 0,
          allowed_colors_count INTEGER NOT NULL DEFAULT 0,
          results_count INTEGER NOT NULL,
          commander_only BOOLEAN NOT NULL DEFAULT FALSE,
          include_pairs BOOLEAN NOT NULL DEFAULT FALSE,
          set_filter BOOLEAN NOT NULL DEFAULT FALSE,
          type_filter BOOLEAN NOT NULL DEFAULT FALSE,
          sample_rate DOUBLE PRECISION NOT NULL
        )
      `
      );
      await getPool().query(
        `
        CREATE INDEX IF NOT EXISTS idx_card_search_telemetry_created_at
          ON card_search_telemetry (created_at DESC)
      `
      );
      await getPool().query(
        `
        CREATE INDEX IF NOT EXISTS idx_card_search_telemetry_route_kind
          ON card_search_telemetry (route_kind, created_at DESC)
      `
      );
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }

  await tableReady;
}

async function maybePruneExpiredRows(): Promise<void> {
  const nowMs = Date.now();
  if (!shouldRunRetentionSweep(nowMs)) {
    return;
  }

  const retentionDays = getRetentionDays();
  try {
    await getPool().query(
      `
      DELETE FROM card_search_telemetry
      WHERE created_at < NOW() - ($1::text || ' days')::interval
    `,
      [String(retentionDays)]
    );
  } catch (error) {
    console.error("Card-search telemetry retention sweep failed", {
      retentionDays,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function toFiniteNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toFiniteInteger(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

export async function recordCardSearchTelemetry(record: CardSearchTelemetryRecord): Promise<void> {
  if (!isTelemetryEnabled() || !shouldSample()) {
    return;
  }

  const sampleRate = getSampleRate();

  try {
    await ensureTable();
    await maybePruneExpiredRows();
    await getPool().query(
      `
      INSERT INTO card_search_telemetry (
        request_id,
        route_kind,
        cold_start,
        total_ms,
        lookup_ms,
        serialize_ms,
        response_bytes,
        query_length,
        names_count,
        colors_count,
        allowed_colors_count,
        results_count,
        commander_only,
        include_pairs,
        set_filter,
        type_filter,
        sample_rate
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17
      )
    `,
      [
        record.requestId,
        record.routeKind,
        record.coldStart,
        record.totalMs,
        toFiniteNumber(record.lookupMs),
        toFiniteNumber(record.serializeMs),
        toFiniteInteger(record.responseBytes),
        toFiniteInteger(record.queryLength),
        toFiniteInteger(record.namesCount),
        toFiniteInteger(record.colorsCount) ?? 0,
        toFiniteInteger(record.allowedColorsCount) ?? 0,
        Math.max(0, Math.floor(record.resultsCount)),
        record.commanderOnly,
        record.includePairs,
        record.setFilter,
        record.typeFilter,
        sampleRate
      ]
    );
  } catch (error) {
    console.error("Card-search telemetry write failed", {
      requestId: record.requestId,
      routeKind: record.routeKind,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
