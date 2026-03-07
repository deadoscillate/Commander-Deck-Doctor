import { Pool } from "pg";
import { getClientAddress } from "./http";

type RateLimitRule = {
  scope: "analyze" | "import-url" | "share-report" | "simulate" | "card-printings";
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetUnixSeconds: number;
};

type MemoryCounter = {
  windowStartMs: number;
  count: number;
};

const memoryCounters = new Map<string, MemoryCounter>();
const memoryRetentionMs = 60 * 60 * 1000;

let pgPool: Pool | null = null;
let tableReady: Promise<void> | null = null;

function shouldUsePostgres(): boolean {
  if (process.env.NODE_ENV === "test") {
    return false;
  }

  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL);
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
    throw new Error("Missing Postgres connection string for rate limiter.");
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
        CREATE TABLE IF NOT EXISTS api_rate_limits (
          key TEXT PRIMARY KEY,
          window_start_ms BIGINT NOT NULL,
          hit_count INTEGER NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      );
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }

  await tableReady;
}

function getBucket(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

function buildKey(request: Request, rule: RateLimitRule): string {
  return `${rule.scope}:${getClientAddress(request)}`;
}

function sweepMemoryCounters(nowMs: number): void {
  for (const [key, value] of memoryCounters.entries()) {
    if (nowMs - value.windowStartMs > memoryRetentionMs) {
      memoryCounters.delete(key);
    }
  }
}

function incrementMemoryCounter(key: string, nowMs: number, windowMs: number): number {
  sweepMemoryCounters(nowMs);

  const bucket = getBucket(nowMs, windowMs);
  const existing = memoryCounters.get(key);
  if (!existing || existing.windowStartMs !== bucket) {
    memoryCounters.set(key, {
      windowStartMs: bucket,
      count: 1
    });
    return 1;
  }

  existing.count += 1;
  memoryCounters.set(key, existing);
  return existing.count;
}

async function incrementPostgresCounter(
  key: string,
  nowMs: number,
  windowMs: number
): Promise<{ count: number; bucketStartMs: number }> {
  await ensureTable();
  const bucket = getBucket(nowMs, windowMs);
  const result = await getPool().query<{ hit_count: number; window_start_ms: string }>(
    `
      INSERT INTO api_rate_limits (key, window_start_ms, hit_count, updated_at)
      VALUES ($1, $2, 1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        window_start_ms = CASE
          WHEN api_rate_limits.window_start_ms = EXCLUDED.window_start_ms
            THEN api_rate_limits.window_start_ms
          ELSE EXCLUDED.window_start_ms
        END,
        hit_count = CASE
          WHEN api_rate_limits.window_start_ms = EXCLUDED.window_start_ms
            THEN api_rate_limits.hit_count + 1
          ELSE 1
        END,
        updated_at = NOW()
      RETURNING hit_count, window_start_ms
    `,
    [key, bucket]
  );

  const row = result.rows[0];
  return {
    count: row ? Number(row.hit_count) : 1,
    bucketStartMs: row ? Number(row.window_start_ms) : bucket
  };
}

function toRateLimitResult(
  count: number,
  bucketStartMs: number,
  rule: RateLimitRule
): RateLimitResult {
  const windowMs = Math.max(1, Math.floor(rule.windowSeconds * 1000));
  const resetUnixSeconds = Math.floor((bucketStartMs + windowMs) / 1000);
  const remaining = Math.max(0, rule.limit - count);

  return {
    allowed: count <= rule.limit,
    limit: rule.limit,
    remaining,
    resetUnixSeconds
  };
}

/**
 * Rate limits by client address and route scope.
 * Uses Postgres in hosted environments and memory fallback locally.
 */
export async function checkRateLimit(request: Request, rule: RateLimitRule): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowMs = Math.max(1, Math.floor(rule.windowSeconds * 1000));
  const key = buildKey(request, rule);

  if (shouldUsePostgres()) {
    try {
      const postgresResult = await incrementPostgresCounter(key, nowMs, windowMs);
      return toRateLimitResult(postgresResult.count, postgresResult.bucketStartMs, rule);
    } catch (error) {
      console.error("Rate limiter postgres fallback engaged", {
        scope: rule.scope,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const count = incrementMemoryCounter(key, nowMs, windowMs);
  const bucketStartMs = getBucket(nowMs, windowMs);
  return toRateLimitResult(count, bucketStartMs, rule);
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(result.resetUnixSeconds)
  };

  if (!result.allowed) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    headers["retry-after"] = String(Math.max(1, result.resetUnixSeconds - nowSeconds));
  }

  return headers;
}
