#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Pool } from "pg";

function normalizePostgresConnectionString(value) {
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

function getConnectionString() {
  const raw = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("Missing Postgres connection string. Set POSTGRES_URL or DATABASE_URL.");
  }
  return normalizePostgresConnectionString(raw);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const truncate = args.includes("--truncate");
  const fileArg = args.find((arg) => !arg.startsWith("--"));

  if (!fileArg) {
    throw new Error(
      "Usage: node scripts/import-shared-reports.mjs <backup-file.json> [--truncate]"
    );
  }

  return {
    truncate,
    backupPath: path.resolve(fileArg)
  };
}

function toReports(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object" && Array.isArray(payload.reports)) {
    return payload.reports;
  }

  throw new Error("Backup file format is invalid. Expected an array or { reports: [] }.");
}

function normalizeRow(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const row = input;
  const hash = typeof row.hash === "string" ? row.hash : null;
  const decklist = typeof row.decklist === "string" ? row.decklist : null;
  const createdAt = typeof row.created_at === "string" ? row.created_at : null;
  const updatedAt = typeof row.updated_at === "string" ? row.updated_at : null;
  const analysisJson =
    typeof row.analysis_json === "string"
      ? row.analysis_json
      : row.analysis_json && typeof row.analysis_json === "object"
        ? JSON.stringify(row.analysis_json)
        : null;

  if (!hash || !decklist || !analysisJson || !createdAt || !updatedAt) {
    return null;
  }

  return {
    hash,
    decklist,
    analysisJson,
    createdAt,
    updatedAt
  };
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shared_reports (
      hash TEXT PRIMARY KEY,
      decklist TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

async function run() {
  const { truncate, backupPath } = parseArgs();
  const raw = await fs.readFile(backupPath, "utf8");
  const parsed = JSON.parse(raw);
  const reports = toReports(parsed)
    .map((item) => normalizeRow(item))
    .filter((item) => Boolean(item));

  if (reports.length === 0) {
    throw new Error("Backup file has no valid shared report rows.");
  }

  const pool = new Pool({
    connectionString: getConnectionString(),
    max: 1
  });

  try {
    await ensureTable(pool);
    await pool.query("BEGIN");

    if (truncate) {
      await pool.query("TRUNCATE TABLE shared_reports");
    }

    for (const row of reports) {
      await pool.query(
        `
        INSERT INTO shared_reports (hash, decklist, analysis_json, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (hash) DO UPDATE SET
          decklist = EXCLUDED.decklist,
          analysis_json = EXCLUDED.analysis_json,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `,
        [row.hash, row.decklist, row.analysisJson, row.createdAt, row.updatedAt]
      );
    }

    await pool.query("COMMIT");
    console.log(`Imported ${reports.length} shared reports from ${backupPath}`);
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
