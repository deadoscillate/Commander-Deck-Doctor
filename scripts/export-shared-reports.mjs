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

function nowStamp() {
  const iso = new Date().toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function resolveOutputPath() {
  const fromArg = process.argv[2];
  if (fromArg) {
    return path.resolve(fromArg);
  }

  return path.resolve("backups", `shared-reports-${nowStamp()}.json`);
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
  const outputPath = resolveOutputPath();
  const pool = new Pool({
    connectionString: getConnectionString(),
    max: 1
  });

  try {
    await ensureTable(pool);
    const result = await pool.query(
      `
      SELECT hash, decklist, analysis_json, created_at, updated_at
      FROM shared_reports
      ORDER BY updated_at DESC
    `
    );

    const payload = {
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      count: result.rows.length,
      reports: result.rows
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    console.log(`Exported ${result.rows.length} shared reports to ${outputPath}`);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
