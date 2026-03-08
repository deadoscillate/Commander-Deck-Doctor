import fs from "node:fs";
import path from "node:path";
import type { LocalPrintCardRecord } from "./scryfallLocalPrintIndexStore";

type SqliteDatabase = import("node:sqlite").DatabaseSync;

const PRINT_SQLITE_FILE = path.resolve("data/scryfall/prints.compiled.sqlite");

let db: SqliteDatabase | null = null;
let sqliteReady: Promise<SqliteDatabase | null> | null = null;
let sqliteUnavailable = false;

type PrintRow = {
  printing_id?: string;
  set_code?: string;
  collector_number?: string;
  oracle_id?: string;
  name?: string;
  image_normal?: string | null;
  image_art_crop?: string | null;
  price_usd?: string | null;
  price_usd_foil?: string | null;
  price_usd_etched?: string | null;
  tcgplayer_url?: string | null;
  card_faces_json?: string | null;
};

function normalizeLookupName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeCollectorNumber(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\u2605\u2606]/g, "");
}

function toLocalPrintCardRecord(row: PrintRow | undefined): LocalPrintCardRecord | null {
  if (
    !row ||
    typeof row.printing_id !== "string" ||
    typeof row.oracle_id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.set_code !== "string" ||
    typeof row.collector_number !== "string"
  ) {
    return null;
  }

  const parsedFaces = (() => {
    if (typeof row.card_faces_json !== "string" || !row.card_faces_json.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(row.card_faces_json) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  return {
    id: row.printing_id,
    oracle_id: row.oracle_id,
    name: row.name,
    set: row.set_code,
    collector_number: row.collector_number,
    image_uris:
      row.image_normal || row.image_art_crop
        ? {
            normal: row.image_normal ?? undefined,
            art_crop: row.image_art_crop ?? undefined
          }
        : null,
    card_faces: parsedFaces,
    prices:
      row.price_usd !== undefined || row.price_usd_foil !== undefined || row.price_usd_etched !== undefined
        ? {
            usd: row.price_usd ?? null,
            usd_foil: row.price_usd_foil ?? null,
            usd_etched: row.price_usd_etched ?? null,
            tix: null
          }
        : null,
    purchase_uris: row.tcgplayer_url
      ? {
          tcgplayer: row.tcgplayer_url
        }
      : null
  };
}

async function ensureDb(): Promise<SqliteDatabase | null> {
  if (db) {
    return db;
  }

  if (sqliteUnavailable) {
    return null;
  }

  if (sqliteReady) {
    return sqliteReady;
  }

  if (!fs.existsSync(PRINT_SQLITE_FILE)) {
    sqliteUnavailable = true;
    return null;
  }

  sqliteReady = (async () => {
    try {
      const sqliteModule = await import("node:sqlite");
      db = new sqliteModule.DatabaseSync(PRINT_SQLITE_FILE, { readOnly: true });
      return db;
    } catch {
      sqliteUnavailable = true;
      sqliteReady = null;
      return null;
    }
  })();

  return sqliteReady;
}

export async function getSqlitePrintCardById(printingId: string): Promise<LocalPrintCardRecord | null> {
  const database = await ensureDb();
  const normalizedId = printingId.trim().toLowerCase();
  if (!database || !normalizedId) {
    return null;
  }

  const row = database
    .prepare(
      `
      SELECT printing_id, set_code, collector_number, oracle_id, name,
             image_normal, image_art_crop, price_usd, price_usd_foil, price_usd_etched,
             tcgplayer_url, card_faces_json
      FROM print_cards
      WHERE printing_id = ?
      LIMIT 1
    `
    )
    .get(normalizedId) as PrintRow | undefined;

  return toLocalPrintCardRecord(row);
}

export async function getSqlitePrintCardBySetCollector(
  setCode: string,
  collectorNumber: string
): Promise<LocalPrintCardRecord | null> {
  const database = await ensureDb();
  const normalizedSet = setCode.trim().toLowerCase();
  const normalizedCollector = normalizeCollectorNumber(collectorNumber);
  if (!database || !normalizedSet || !normalizedCollector) {
    return null;
  }

  const row = database
    .prepare(
      `
      SELECT printing_id, set_code, collector_number, oracle_id, name,
             image_normal, image_art_crop, price_usd, price_usd_foil, price_usd_etched,
             tcgplayer_url, card_faces_json
      FROM print_cards
      WHERE set_code = ? AND normalized_collector_number = ?
      LIMIT 1
    `
    )
    .get(normalizedSet, normalizedCollector) as PrintRow | undefined;

  return toLocalPrintCardRecord(row);
}

export async function getSqlitePrintCardByNameSet(
  name: string,
  setCode: string
): Promise<LocalPrintCardRecord | null> {
  const database = await ensureDb();
  const normalizedSet = setCode.trim().toLowerCase();
  const normalizedName = normalizeLookupName(name);
  if (!database || !normalizedSet || !normalizedName) {
    return null;
  }

  const row = database
    .prepare(
      `
      SELECT printing_id, set_code, collector_number, oracle_id, name,
             image_normal, image_art_crop, price_usd, price_usd_foil, price_usd_etched,
             tcgplayer_url, card_faces_json
      FROM print_cards
      WHERE set_code = ? AND normalized_name = ?
      ORDER BY collector_sort_rank ASC, collector_sort_suffix ASC, printing_id ASC
      LIMIT 1
    `
    )
    .get(normalizedSet, normalizedName) as PrintRow | undefined;

  return toLocalPrintCardRecord(row);
}
