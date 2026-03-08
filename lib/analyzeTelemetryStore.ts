import { Pool } from "pg";
import type { DeckPriceMode, ExpectedWinTurn } from "@/lib/contracts";

export type AnalyzeTelemetryRecord = {
  requestId: string;
  cache: "hit" | "miss";
  totalMs: number;
  parseMs?: number;
  lookupMs?: number;
  computeMs?: number;
  serializeMs?: number;
  responseBytes?: number;
  deckSize?: number;
  knownCards?: number;
  unknownCards?: number;
  deckPriceMode: DeckPriceMode;
  setOverrideCount: number;
  commanderSelected: boolean;
  commanderSource: "section" | "manual" | "none";
  targetBracket: number | null;
  expectedWinTurn: ExpectedWinTurn | null;
  userCedhFlag: boolean;
  userHighPowerNoGCFlag: boolean;
};

const DEFAULT_SAMPLE_RATE = 0.15;
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
  const configured = process.env.ANALYZE_TELEMETRY_ENABLED;
  if (configured === "0") {
    return false;
  }

  if (configured === "1") {
    return shouldUsePostgres();
  }

  return process.env.NODE_ENV === "production" && shouldUsePostgres();
}

function getSampleRate(): number {
  return parseClampedNumber(process.env.ANALYZE_TELEMETRY_SAMPLE_RATE, DEFAULT_SAMPLE_RATE, 0, 1);
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
    process.env.ANALYZE_TELEMETRY_RETENTION_DAYS,
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
    throw new Error("Missing Postgres connection string for analyze telemetry.");
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
        CREATE TABLE IF NOT EXISTS analyze_telemetry (
          id BIGSERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          request_id TEXT NOT NULL,
          cache_status TEXT NOT NULL,
          total_ms DOUBLE PRECISION NOT NULL,
          parse_ms DOUBLE PRECISION,
          lookup_ms DOUBLE PRECISION,
          compute_ms DOUBLE PRECISION,
          serialize_ms DOUBLE PRECISION,
          response_bytes INTEGER,
          deck_size INTEGER,
          known_cards INTEGER,
          unknown_cards INTEGER,
          deck_price_mode TEXT NOT NULL,
          set_override_count INTEGER NOT NULL,
          commander_selected BOOLEAN NOT NULL,
          commander_source TEXT NOT NULL,
          target_bracket INTEGER,
          expected_win_turn TEXT,
          user_cedh_flag BOOLEAN NOT NULL,
          user_high_power_no_gc_flag BOOLEAN NOT NULL,
          sample_rate DOUBLE PRECISION NOT NULL
        )
      `
      );
      await getPool().query(
        `
        CREATE INDEX IF NOT EXISTS idx_analyze_telemetry_created_at
          ON analyze_telemetry (created_at DESC)
      `
      );
      await getPool().query(
        `
        CREATE INDEX IF NOT EXISTS idx_analyze_telemetry_cache_status
          ON analyze_telemetry (cache_status, created_at DESC)
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
      DELETE FROM analyze_telemetry
      WHERE created_at < NOW() - ($1::text || ' days')::interval
    `,
      [String(retentionDays)]
    );
  } catch (error) {
    console.error("Analyze telemetry retention sweep failed", {
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

/**
 * Stores sampled analyzer timings and request-shape metadata for production profiling.
 * Raw decklists are intentionally excluded from this dataset.
 */
export async function recordAnalyzeTelemetry(record: AnalyzeTelemetryRecord): Promise<void> {
  if (!isTelemetryEnabled() || !shouldSample()) {
    return;
  }

  const sampleRate = getSampleRate();

  try {
    await ensureTable();
    await maybePruneExpiredRows();
    await getPool().query(
      `
      INSERT INTO analyze_telemetry (
        request_id,
        cache_status,
        total_ms,
        parse_ms,
        lookup_ms,
        compute_ms,
        serialize_ms,
        response_bytes,
        deck_size,
        known_cards,
        unknown_cards,
        deck_price_mode,
        set_override_count,
        commander_selected,
        commander_source,
        target_bracket,
        expected_win_turn,
        user_cedh_flag,
        user_high_power_no_gc_flag,
        sample_rate
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      )
    `,
      [
        record.requestId,
        record.cache,
        record.totalMs,
        toFiniteNumber(record.parseMs),
        toFiniteNumber(record.lookupMs),
        toFiniteNumber(record.computeMs),
        toFiniteNumber(record.serializeMs),
        toFiniteInteger(record.responseBytes),
        toFiniteInteger(record.deckSize),
        toFiniteInteger(record.knownCards),
        toFiniteInteger(record.unknownCards),
        record.deckPriceMode,
        Math.max(0, Math.floor(record.setOverrideCount)),
        record.commanderSelected,
        record.commanderSource,
        record.targetBracket,
        record.expectedWinTurn,
        record.userCedhFlag,
        record.userHighPowerNoGCFlag,
        sampleRate
      ]
    );
  } catch (error) {
    console.error("Analyze telemetry write failed", {
      cache: record.cache,
      requestId: record.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
