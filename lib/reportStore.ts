import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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

let db: DatabaseSync | null = null;

function ensureDb(): DatabaseSync {
  if (db) {
    return db;
  }

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
export function saveReport(decklist: string, analysis: AnalyzeResponse): { hash: string } {
  const database = ensureDb();
  const hash = createDeckHash(decklist);
  const now = new Date().toISOString();
  const normalizedDecklist = normalizeDecklist(decklist);

  const statement = database.prepare(`
    INSERT INTO shared_reports (hash, decklist, analysis_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(hash) DO UPDATE SET
      decklist = excluded.decklist,
      analysis_json = excluded.analysis_json,
      updated_at = excluded.updated_at
  `);

  statement.run(hash, normalizedDecklist, JSON.stringify(analysis), now, now);
  return { hash };
}

/**
 * Loads a previously saved report by hash.
 */
export function getReport(hash: string): SavedReport | null {
  if (!isValidReportHash(hash)) {
    return null;
  }

  const database = ensureDb();
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
