import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

type SummaryOptions = {
  days?: number;
  since?: string;
  last?: number;
  output?: string;
  jsonOutput?: string;
};

type CacheMixRow = {
  cache_status: string;
  requests: string;
  avg_total_ms: string | null;
  p50_total_ms: string | null;
  p95_total_ms: string | null;
};

type PricingModeRow = {
  deck_price_mode: string;
  cache_status: string;
  requests: string;
  p50_total_ms: string | null;
  p95_total_ms: string | null;
  p95_lookup_ms: string | null;
  p95_compute_ms: string | null;
};

type ColdStartRow = {
  cold_start: boolean;
  requests: string;
  avg_total_ms: string | null;
  p50_total_ms: string | null;
  p95_total_ms: string | null;
  p95_lookup_ms: string | null;
};

type SlowShapeRow = {
  deck_price_mode: string;
  set_override_count: string | null;
  deck_size: string | null;
  commander_source: string;
  requests: string;
  avg_total_ms: string | null;
  p95_total_ms: string | null;
};

type DailyTrendRow = {
  day: string;
  requests: string;
  p95_total_ms: string | null;
  p95_lookup_ms: string | null;
};

type CommanderOptionsTotalsRow = {
  requests: string;
  first_seen: string | null;
  last_seen: string | null;
};

type CommanderOptionsCacheRow = {
  cache_status: string;
  requests: string;
  avg_total_ms: string | null;
  p50_total_ms: string | null;
  p95_total_ms: string | null;
};

type CommanderOptionsColdRow = {
  cold_start: boolean;
  requests: string;
  avg_total_ms: string | null;
  p50_total_ms: string | null;
  p95_total_ms: string | null;
  p95_lookup_ms: string | null;
};

function parseArgs(argv: string[]): SummaryOptions {
  const options: SummaryOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--days") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--days must be a positive number.");
      }
      options.days = Math.max(1, Math.floor(value));
      index += 1;
      continue;
    }

    if (arg === "--since") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--since requires an ISO-8601 timestamp.");
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("--since must be a valid ISO-8601 timestamp.");
      }

      options.since = parsed.toISOString();
      index += 1;
      continue;
    }

    if (arg === "--last") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--last must be a positive number.");
      }

      options.last = Math.max(1, Math.floor(value));
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.output = argv[index + 1];
      if (!options.output) {
        throw new Error("--output requires a file path.");
      }
      index += 1;
      continue;
    }

    if (arg === "--json-output") {
      options.jsonOutput = argv[index + 1];
      if (!options.jsonOutput) {
        throw new Error("--json-output requires a file path.");
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.days === undefined && !options.since && options.last === undefined) {
    options.days = 7;
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage: npm run telemetry:summary -- [options]

Options:
  --days <n>          Report window in days (default: 7 when no other filter is provided)
  --since <iso>       Only include requests at or after the given ISO-8601 timestamp
  --last <n>          Only include the most recent n requests (applied after --since when both are used)
  --output <path>     Write markdown report to a file
  --json-output <path> Write raw JSON summary to a file
  --help              Show this help

Environment:
  DATABASE_URL / POSTGRES_URL / POSTGRES_URL_NON_POOLING
`);
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
  const raw = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!raw) {
    throw new Error("Missing DATABASE_URL or POSTGRES_URL for telemetry summary.");
  }

  return normalizePostgresConnectionString(raw);
}

function toDisplayNumber(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : value;
}

function toDisplayInt(value: string | null | undefined): string {
  if (!value) {
    return "0";
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : value;
}

function describeWindow(options: SummaryOptions): string {
  const parts: string[] = [];
  if (options.days !== undefined) {
    parts.push(`last ${options.days} day(s)`);
  }

  if (options.since) {
    parts.push(`since ${options.since}`);
  }

  if (options.last !== undefined) {
    parts.push(`last ${options.last} request(s)`);
  }

  return parts.length > 0 ? parts.join(", ") : "unbounded";
}

function buildFilteredTelemetryQuery(options: SummaryOptions): { sql: string; params: string[] } {
  return buildFilteredQueryForTable(options, "analyze_telemetry");
}

function buildFilteredQueryForTable(
  options: SummaryOptions,
  tableName: string
): { sql: string; params: string[] } {
  const whereClauses: string[] = [];
  const params: string[] = [];

  if (options.days !== undefined) {
    params.push(String(options.days));
    whereClauses.push(`created_at >= now() - ($${params.length}::text || ' days')::interval`);
  }

  if (options.since) {
    params.push(options.since);
    whereClauses.push(`created_at >= $${params.length}::timestamptz`);
  }

  const whereClause = whereClauses.length > 0 ? `where ${whereClauses.join(" and ")}` : "";
  const orderAndLimit =
    options.last !== undefined
      ? `order by created_at desc limit ${Math.max(1, Math.floor(options.last))}`
      : "";

  return {
    sql: `
      with filtered as (
        select *
        from ${tableName}
        ${whereClause}
        ${orderAndLimit}
      )
    `,
    params
  };
}

async function writeIfRequested(filePath: string | undefined, content: string): Promise<void> {
  if (!filePath) {
    return;
  }

  const absolutePath = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const windowLabel = describeWindow(options);
  const filtered = buildFilteredTelemetryQuery(options);
  const commanderOptionsFiltered = buildFilteredQueryForTable(options, "commander_options_telemetry");
  const pool = new Pool({
    connectionString: getConnectionString(),
    max: 1
  });

  try {
    const [cacheMix, byPricingMode, coldStartMisses, slowShapes, dailyTrend, totals] = await Promise.all([
      pool.query<CacheMixRow>(
        `
        ${filtered.sql}
        select
          cache_status,
          count(*) as requests,
          round(avg(total_ms)::numeric, 1) as avg_total_ms,
          round(percentile_cont(0.5) within group (order by total_ms)::numeric, 1) as p50_total_ms,
          round(percentile_cont(0.95) within group (order by total_ms)::numeric, 1) as p95_total_ms
        from filtered
        group by cache_status
        order by cache_status
      `,
        filtered.params
      ),
      pool.query<PricingModeRow>(
        `
        ${filtered.sql}
        select
          deck_price_mode,
          cache_status,
          count(*) as requests,
          round(percentile_cont(0.5) within group (order by total_ms)::numeric, 1) as p50_total_ms,
          round(percentile_cont(0.95) within group (order by total_ms)::numeric, 1) as p95_total_ms,
          round(percentile_cont(0.95) within group (order by lookup_ms)::numeric, 1) as p95_lookup_ms,
          round(percentile_cont(0.95) within group (order by compute_ms)::numeric, 1) as p95_compute_ms
        from filtered
        group by deck_price_mode, cache_status
        order by deck_price_mode, cache_status
      `,
        filtered.params
      ),
      pool.query<ColdStartRow>(
        `
        ${filtered.sql}
        select
          cold_start,
          count(*) as requests,
          round(avg(total_ms)::numeric, 1) as avg_total_ms,
          round(percentile_cont(0.5) within group (order by total_ms)::numeric, 1) as p50_total_ms,
          round(percentile_cont(0.95) within group (order by total_ms)::numeric, 1) as p95_total_ms,
          round(percentile_cont(0.95) within group (order by lookup_ms)::numeric, 1) as p95_lookup_ms
        from filtered
        where cache_status = 'miss'
        group by cold_start
        order by cold_start desc
      `,
        filtered.params
      ),
      pool.query<SlowShapeRow>(
        `
        ${filtered.sql}
        select
          deck_price_mode,
          set_override_count,
          deck_size,
          commander_source,
          count(*) as requests,
          round(avg(total_ms)::numeric, 1) as avg_total_ms,
          round(percentile_cont(0.95) within group (order by total_ms)::numeric, 1) as p95_total_ms
        from filtered
        where cache_status = 'miss'
        group by deck_price_mode, set_override_count, deck_size, commander_source
        having count(*) >= 3
        order by p95_total_ms desc
        limit 20
      `,
        filtered.params
      ),
      pool.query<DailyTrendRow>(
        `
        ${filtered.sql}
        select
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
          count(*) as requests,
          round(percentile_cont(0.95) within group (order by total_ms)::numeric, 1) as p95_total_ms,
          round(percentile_cont(0.95) within group (order by lookup_ms)::numeric, 1) as p95_lookup_ms
        from filtered
        group by 1
        order by 1 desc
      `,
        filtered.params
      ),
      pool.query<{ requests: string; first_seen: string | null; last_seen: string | null }>(
        `
        ${filtered.sql}
        select
          count(*) as requests,
          to_char(min(created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as first_seen,
          to_char(max(created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_seen
        from filtered
      `,
        filtered.params
      )
    ]);

    const commanderOptionsTableCheck = await pool.query<{ exists: string | null }>(
      `select to_regclass('public.commander_options_telemetry') as exists`
    );
    const commanderOptionsAvailable = Boolean(commanderOptionsTableCheck.rows[0]?.exists);
    const commanderOptionsSummary = commanderOptionsAvailable
      ? await Promise.all([
          pool.query<CommanderOptionsCacheRow>(
            `
            ${commanderOptionsFiltered.sql}
            select
              cache_status,
              count(*) as requests,
              round(avg(total_ms)::numeric, 1) as avg_total_ms,
              round(percentile_cont(0.5) within group (order by total_ms)::numeric, 1) as p50_total_ms,
              round(percentile_cont(0.95) within group (order by total_ms)::numeric, 1) as p95_total_ms
            from filtered
            group by cache_status
            order by cache_status
          `,
            commanderOptionsFiltered.params
          ),
          pool.query<CommanderOptionsColdRow>(
            `
            ${commanderOptionsFiltered.sql}
            select
              cold_start,
              count(*) as requests,
              round(avg(total_ms)::numeric, 1) as avg_total_ms,
              round(percentile_cont(0.5) within group (order by total_ms)::numeric, 1) as p50_total_ms,
              round(percentile_cont(0.95) within group (order by total_ms)::numeric, 1) as p95_total_ms,
              round(percentile_cont(0.95) within group (order by lookup_ms)::numeric, 1) as p95_lookup_ms
            from filtered
            where cache_status = 'miss'
            group by cold_start
            order by cold_start desc
          `,
            commanderOptionsFiltered.params
          ),
          pool.query<CommanderOptionsTotalsRow>(
            `
            ${commanderOptionsFiltered.sql}
            select
              count(*) as requests,
              to_char(min(created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as first_seen,
              to_char(max(created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_seen
            from filtered
          `,
            commanderOptionsFiltered.params
          )
        ])
      : null;

    const totalRow = totals.rows[0] ?? { requests: "0", first_seen: null, last_seen: null };
    const commanderOptionsTotalRow = commanderOptionsSummary?.[2].rows[0] ?? null;
    const markdown = [
      `# Analyze Telemetry Summary`,
      ``,
      `Generated at: ${generatedAt}`,
      `Window: ${windowLabel}`,
      `Requests sampled: ${toDisplayInt(totalRow.requests)}`,
      `First sample: ${totalRow.first_seen ?? "n/a"}`,
      `Last sample: ${totalRow.last_seen ?? "n/a"}`,
      ``,
      `## Cache Mix`,
      `| Cache | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) |`,
      `| --- | ---: | ---: | ---: | ---: |`,
      ...cacheMix.rows.map(
        (row) =>
          `| ${row.cache_status} | ${toDisplayInt(row.requests)} | ${toDisplayNumber(row.avg_total_ms)} | ${toDisplayNumber(row.p50_total_ms)} | ${toDisplayNumber(row.p95_total_ms)} |`
      ),
      ``,
      `## By Pricing Mode`,
      `| Pricing Mode | Cache | Requests | P50 Total (ms) | P95 Total (ms) | P95 Lookup (ms) | P95 Compute (ms) |`,
      `| --- | --- | ---: | ---: | ---: | ---: | ---: |`,
      ...byPricingMode.rows.map(
        (row) =>
          `| ${row.deck_price_mode} | ${row.cache_status} | ${toDisplayInt(row.requests)} | ${toDisplayNumber(row.p50_total_ms)} | ${toDisplayNumber(row.p95_total_ms)} | ${toDisplayNumber(row.p95_lookup_ms)} | ${toDisplayNumber(row.p95_compute_ms)} |`
      ),
      ``,
      `## Cold Start Misses`,
      `| Cold Start | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) | P95 Lookup (ms) |`,
      `| --- | ---: | ---: | ---: | ---: | ---: |`,
      ...coldStartMisses.rows.map(
        (row) =>
          `| ${row.cold_start ? "yes" : "no"} | ${toDisplayInt(row.requests)} | ${toDisplayNumber(row.avg_total_ms)} | ${toDisplayNumber(row.p50_total_ms)} | ${toDisplayNumber(row.p95_total_ms)} | ${toDisplayNumber(row.p95_lookup_ms)} |`
      ),
      ``,
      `## Slow Miss Shapes`,
      `| Pricing Mode | Set Overrides | Deck Size | Commander Source | Requests | Avg Total (ms) | P95 Total (ms) |`,
      `| --- | ---: | ---: | --- | ---: | ---: | ---: |`,
      ...slowShapes.rows.map(
        (row) =>
          `| ${row.deck_price_mode} | ${toDisplayInt(row.set_override_count)} | ${toDisplayInt(row.deck_size)} | ${row.commander_source} | ${toDisplayInt(row.requests)} | ${toDisplayNumber(row.avg_total_ms)} | ${toDisplayNumber(row.p95_total_ms)} |`
      ),
      ``,
      `## Daily Trend`,
      `| Day | Requests | P95 Total (ms) | P95 Lookup (ms) |`,
      `| --- | ---: | ---: | ---: |`,
      ...dailyTrend.rows.map(
        (row) =>
          `| ${row.day} | ${toDisplayInt(row.requests)} | ${toDisplayNumber(row.p95_total_ms)} | ${toDisplayNumber(row.p95_lookup_ms)} |`
      ),
      ``,
      `## Commander Options Telemetry`,
      commanderOptionsAvailable
        ? `Requests sampled: ${toDisplayInt(commanderOptionsTotalRow?.requests)} | First sample: ${commanderOptionsTotalRow?.first_seen ?? "n/a"} | Last sample: ${commanderOptionsTotalRow?.last_seen ?? "n/a"}`
        : `Commander options telemetry table not available yet.`,
      ...(commanderOptionsSummary
        ? [
            ``,
            `### Commander Options Cache Mix`,
            `| Cache | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) |`,
            `| --- | ---: | ---: | ---: | ---: |`,
            ...commanderOptionsSummary[0].rows.map(
              (row) =>
                `| ${row.cache_status} | ${toDisplayInt(row.requests)} | ${toDisplayNumber(row.avg_total_ms)} | ${toDisplayNumber(row.p50_total_ms)} | ${toDisplayNumber(row.p95_total_ms)} |`
            ),
            ``,
            `### Commander Options Cold Start Misses`,
            `| Cold Start | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) | P95 Lookup (ms) |`,
            `| --- | ---: | ---: | ---: | ---: | ---: |`,
            ...commanderOptionsSummary[1].rows.map(
              (row) =>
                `| ${row.cold_start ? "yes" : "no"} | ${toDisplayInt(row.requests)} | ${toDisplayNumber(row.avg_total_ms)} | ${toDisplayNumber(row.p50_total_ms)} | ${toDisplayNumber(row.p95_total_ms)} | ${toDisplayNumber(row.p95_lookup_ms)} |`
            )
          ]
        : []),
      ``
    ].join("\n");

    const json = JSON.stringify(
      {
        generatedAt,
        window: {
          days: options.days ?? null,
          since: options.since ?? null,
          last: options.last ?? null,
          label: windowLabel
        },
        totals: totalRow,
        cacheMix: cacheMix.rows,
        byPricingMode: byPricingMode.rows,
        coldStartMisses: coldStartMisses.rows,
        slowShapes: slowShapes.rows,
        dailyTrend: dailyTrend.rows,
        commanderOptions: commanderOptionsSummary
          ? {
              totals: commanderOptionsTotalRow,
              cacheMix: commanderOptionsSummary[0].rows,
              coldStartMisses: commanderOptionsSummary[1].rows
            }
          : null
      },
      null,
      2
    );

    console.log(markdown);
    await writeIfRequested(options.output, markdown);
    await writeIfRequested(options.jsonOutput, json);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
