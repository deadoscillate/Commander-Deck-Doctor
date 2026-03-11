import fs from "node:fs";
import path from "node:path";
import type { LocalPrintCardRecord } from "./scryfallLocalPrintIndexStore";

type SqliteDatabase = import("node:sqlite").DatabaseSync;
type SqliteStatement = ReturnType<SqliteDatabase["prepare"]>;

const PRINT_SQLITE_FILE = path.resolve("data/scryfall/prints.compiled.sqlite");

let db: SqliteDatabase | null = null;
let sqliteReady: Promise<SqliteDatabase | null> | null = null;
let sqliteUnavailable = false;
let byIdStatement: SqliteStatement | null = null;
let bySetCollectorStatement: SqliteStatement | null = null;
let byNameSetStatement: SqliteStatement | null = null;
let byNameStatement: SqliteStatement | null = null;
let printCardsSelectClause: string | null = null;
let printCardsFromClause = "FROM print_cards";
let printSetOptionRowsCache: SqlitePrintSetOptionRow[] | null = null;
let printCardsHasDigitalColumn = false;

type PrintRow = {
  printing_id?: string;
  set_code?: string;
  collector_number?: string;
  digital?: number | null;
  oracle_id?: string;
  name?: string;
  type_line?: string | null;
  cmc?: number | null;
  mana_cost?: string | null;
  colors_json?: string | null;
  color_identity_json?: string | null;
  oracle_text?: string | null;
  keywords_json?: string | null;
  image_normal?: string | null;
  image_art_crop?: string | null;
  price_usd?: string | null;
  price_usd_foil?: string | null;
  price_usd_etched?: string | null;
  tcgplayer_url?: string | null;
  cardkingdom_url?: string | null;
  card_faces_json?: string | null;
};

type NameSetLookup = {
  name: string;
  setCode: string;
};

type SetCollectorLookup = {
  setCode: string;
  collectorNumber: string;
};

type PrintSearchOptions = {
  query?: string;
  setCode?: string;
  cardType?: string;
  limit?: number;
};

type SqlitePrintSetOptionRow = {
  setCode: string;
  oracleId: string;
  name: string;
  typeLine: string | null;
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

function escapeSqlLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function buildIdKey(printingId: string): string {
  return `id:${printingId.trim().toLowerCase()}`;
}

function buildSetCollectorKey(setCode: string, collectorNumber: string): string {
  return `set:${setCode.trim().toLowerCase()}|collector:${normalizeCollectorNumber(collectorNumber)}`;
}

function buildNameSetKey(name: string, setCode: string): string {
  return `name:${normalizeLookupName(name)}|set:${setCode.trim().toLowerCase()}`;
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

  const parsedColors = (() => {
    if (typeof row.colors_json !== "string" || !row.colors_json.trim()) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(row.colors_json) as unknown;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : undefined;
    } catch {
      return undefined;
    }
  })();

  const parsedColorIdentity = (() => {
    if (typeof row.color_identity_json !== "string" || !row.color_identity_json.trim()) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(row.color_identity_json) as unknown;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : undefined;
    } catch {
      return undefined;
    }
  })();

  const parsedKeywords = (() => {
    if (typeof row.keywords_json !== "string" || !row.keywords_json.trim()) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(row.keywords_json) as unknown;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : undefined;
    } catch {
      return undefined;
    }
  })();

  return {
    id: row.printing_id,
    oracle_id: row.oracle_id,
    name: row.name,
    set: row.set_code,
    collector_number: row.collector_number,
    type_line: row.type_line ?? undefined,
    cmc: typeof row.cmc === "number" && Number.isFinite(row.cmc) ? row.cmc : undefined,
    mana_cost: row.mana_cost ?? undefined,
    colors: parsedColors,
    color_identity: parsedColorIdentity,
    oracle_text: row.oracle_text ?? undefined,
    keywords: parsedKeywords,
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
    purchase_uris:
      row.tcgplayer_url || row.cardkingdom_url
        ? {
            tcgplayer: row.tcgplayer_url ?? undefined,
            cardkingdom: row.cardkingdom_url ?? undefined
          }
        : null
  };
}

function buildQueryParts(database: SqliteDatabase): { selectClause: string; fromClause: string; hasDigitalColumn: boolean } {
  const tableRows = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
    name?: string;
  }>;
  const tableNames = new Set(
    tableRows
      .map((row) => (typeof row.name === "string" ? row.name : ""))
      .filter(Boolean)
  );
  const hasOracleTable = tableNames.has("oracle_cards");

  const pragmaRows = database.prepare("PRAGMA table_info(print_cards)").all() as Array<{
    name?: string;
  }>;
  const availableColumns = new Set(
    pragmaRows
      .map((row) => (typeof row.name === "string" ? row.name : ""))
      .filter(Boolean)
  );

  const oracleColumns = hasOracleTable
    ? new Set(
        (
          database.prepare("PRAGMA table_info(oracle_cards)").all() as Array<{
            name?: string;
          }>
        )
          .map((row) => (typeof row.name === "string" ? row.name : ""))
          .filter(Boolean)
      )
    : new Set<string>();

  const printColumn = (columnName: string, alias = columnName): string =>
    availableColumns.has(columnName) ? `print_cards.${columnName} AS ${alias}` : `NULL AS ${alias}`;
  const metadataColumn = (columnName: string, alias = columnName): string => {
    if (hasOracleTable && oracleColumns.has(columnName)) {
      return `oracle_cards.${columnName} AS ${alias}`;
    }

    if (availableColumns.has(columnName)) {
      return `print_cards.${columnName} AS ${alias}`;
    }

    return `NULL AS ${alias}`;
  };

  return {
    selectClause: [
      printColumn("printing_id"),
      printColumn("set_code"),
      printColumn("collector_number"),
      printColumn("oracle_id"),
      printColumn("name"),
      metadataColumn("type_line"),
      metadataColumn("cmc"),
      metadataColumn("mana_cost"),
      metadataColumn("colors_json"),
      metadataColumn("color_identity_json"),
      metadataColumn("oracle_text"),
      metadataColumn("keywords_json"),
      printColumn("image_normal"),
      printColumn("image_art_crop"),
      printColumn("price_usd"),
      printColumn("price_usd_foil"),
      printColumn("price_usd_etched"),
      printColumn("tcgplayer_url"),
      printColumn("cardkingdom_url"),
      printColumn("card_faces_json")
    ].join(", "),
    fromClause: hasOracleTable
      ? "FROM print_cards LEFT JOIN oracle_cards ON oracle_cards.oracle_id = print_cards.oracle_id"
      : "FROM print_cards",
    hasDigitalColumn: availableColumns.has("digital")
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
      byIdStatement = null;
      bySetCollectorStatement = null;
      byNameSetStatement = null;
      byNameStatement = null;
      const queryParts = buildQueryParts(db);
      printCardsSelectClause = queryParts.selectClause;
      printCardsFromClause = queryParts.fromClause;
      printCardsHasDigitalColumn = queryParts.hasDigitalColumn;
      printSetOptionRowsCache = null;
      return db;
    } catch {
      sqliteUnavailable = true;
      sqliteReady = null;
      return null;
    }
  })();

  return sqliteReady;
}

async function getByIdStatement(): Promise<SqliteStatement | null> {
  const database = await ensureDb();
  if (!database) {
    return null;
  }

  if (!byIdStatement) {
    const queryParts = printCardsSelectClause
      ? { selectClause: printCardsSelectClause, fromClause: printCardsFromClause }
      : buildQueryParts(database);
    byIdStatement = database.prepare(
      `
      SELECT ${queryParts.selectClause}
      ${queryParts.fromClause}
      WHERE printing_id = ?
      LIMIT 1
    `
    );
  }

  return byIdStatement;
}

async function getBySetCollectorStatement(): Promise<SqliteStatement | null> {
  const database = await ensureDb();
  if (!database) {
    return null;
  }

  if (!bySetCollectorStatement) {
    const queryParts = printCardsSelectClause
      ? { selectClause: printCardsSelectClause, fromClause: printCardsFromClause }
      : buildQueryParts(database);
    bySetCollectorStatement = database.prepare(
      `
      SELECT ${queryParts.selectClause}
      ${queryParts.fromClause}
      WHERE set_code = ? AND normalized_collector_number = ?
      LIMIT 1
    `
    );
  }

  return bySetCollectorStatement;
}

async function getByNameSetStatement(): Promise<SqliteStatement | null> {
  const database = await ensureDb();
  if (!database) {
    return null;
  }

  if (!byNameSetStatement) {
    const queryParts = printCardsSelectClause
      ? { selectClause: printCardsSelectClause, fromClause: printCardsFromClause }
      : buildQueryParts(database);
    byNameSetStatement = database.prepare(
      `
      SELECT ${queryParts.selectClause}
      ${queryParts.fromClause}
      WHERE set_code = ? AND normalized_name = ?
      ORDER BY collector_sort_rank ASC, collector_sort_suffix ASC, printing_id ASC
      LIMIT 1
    `
    );
  }

  return byNameSetStatement;
}

async function getByNameStatement(): Promise<SqliteStatement | null> {
  const database = await ensureDb();
  if (!database) {
    return null;
  }

  if (!byNameStatement) {
    const queryParts = printCardsSelectClause
      ? { selectClause: printCardsSelectClause, fromClause: printCardsFromClause }
      : buildQueryParts(database);
    byNameStatement = database.prepare(
      `
      SELECT ${queryParts.selectClause}
      ${queryParts.fromClause}
      WHERE normalized_name = ?
      ORDER BY collector_sort_rank ASC, collector_sort_suffix ASC, printing_id ASC
      LIMIT 1
    `
    );
  }

  return byNameStatement;
}

export async function getSqlitePrintCardById(printingId: string): Promise<LocalPrintCardRecord | null> {
  const statement = await getByIdStatement();
  const normalizedId = printingId.trim().toLowerCase();
  if (!statement || !normalizedId) {
    return null;
  }

  const row = statement.get(normalizedId) as PrintRow | undefined;

  return toLocalPrintCardRecord(row);
}

export async function getSqlitePrintCardsByIds(
  printingIds: string[]
): Promise<Map<string, LocalPrintCardRecord>> {
  const database = await ensureDb();
  const normalizedIds = [...new Set(printingIds.map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (!database || normalizedIds.length === 0) {
    return new Map();
  }

  const placeholders = normalizedIds.map(() => "?").join(", ");
  const queryParts: { selectClause: string; fromClause: string; hasDigitalColumn: boolean } = printCardsSelectClause
    ? {
        selectClause: printCardsSelectClause,
        fromClause: printCardsFromClause,
        hasDigitalColumn: printCardsHasDigitalColumn
      }
    : buildQueryParts(database);
  const rows = database
    .prepare(
      `
      SELECT ${queryParts.selectClause}
      ${queryParts.fromClause}
      WHERE printing_id IN (${placeholders})
    `
    )
    .all(...normalizedIds) as PrintRow[];

  const results = new Map<string, LocalPrintCardRecord>();
  for (const row of rows) {
    const record = toLocalPrintCardRecord(row);
    if (record) {
      results.set(buildIdKey(record.id), record);
    }
  }

  return results;
}

export async function getSqlitePrintCardBySetCollector(
  setCode: string,
  collectorNumber: string
): Promise<LocalPrintCardRecord | null> {
  const statement = await getBySetCollectorStatement();
  const normalizedSet = setCode.trim().toLowerCase();
  const normalizedCollector = normalizeCollectorNumber(collectorNumber);
  if (!statement || !normalizedSet || !normalizedCollector) {
    return null;
  }

  const row = statement.get(normalizedSet, normalizedCollector) as PrintRow | undefined;

  return toLocalPrintCardRecord(row);
}

export async function getSqlitePrintCardsBySetCollectors(
  lookups: SetCollectorLookup[]
): Promise<Map<string, LocalPrintCardRecord>> {
  const database = await ensureDb();
  const deduped = new Map<string, { setCode: string; collectorNumber: string }>();

  for (const lookup of lookups) {
    const normalizedSet = lookup.setCode.trim().toLowerCase();
    const normalizedCollector = normalizeCollectorNumber(lookup.collectorNumber);
    if (!normalizedSet || !normalizedCollector) {
      continue;
    }

    const key = buildSetCollectorKey(normalizedSet, normalizedCollector);
    if (!deduped.has(key)) {
      deduped.set(key, { setCode: normalizedSet, collectorNumber: normalizedCollector });
    }
  }

  if (!database || deduped.size === 0) {
    return new Map();
  }

  const where = [...deduped.values()]
    .map(() => "(set_code = ? AND normalized_collector_number = ?)")
    .join(" OR ");
  const params = [...deduped.values()].flatMap((lookup) => [lookup.setCode, lookup.collectorNumber]);
  const queryParts: { selectClause: string; fromClause: string; hasDigitalColumn: boolean } = printCardsSelectClause
    ? {
        selectClause: printCardsSelectClause,
        fromClause: printCardsFromClause,
        hasDigitalColumn: printCardsHasDigitalColumn
      }
    : buildQueryParts(database);
  const rows = database
    .prepare(
      `
      SELECT ${queryParts.selectClause}
      ${queryParts.fromClause}
      WHERE ${where}
    `
    )
    .all(...params) as PrintRow[];

  const results = new Map<string, LocalPrintCardRecord>();
  for (const row of rows) {
    const record = toLocalPrintCardRecord(row);
    if (record) {
      results.set(buildSetCollectorKey(record.set, record.collector_number), record);
    }
  }

  return results;
}

export async function getSqlitePrintCardByNameSet(
  name: string,
  setCode: string
): Promise<LocalPrintCardRecord | null> {
  const statement = await getByNameSetStatement();
  const normalizedSet = setCode.trim().toLowerCase();
  const normalizedName = normalizeLookupName(name);
  if (!statement || !normalizedSet || !normalizedName) {
    return null;
  }

  const row = statement.get(normalizedSet, normalizedName) as PrintRow | undefined;

  return toLocalPrintCardRecord(row);
}

export async function getSqlitePrintCardByName(name: string): Promise<LocalPrintCardRecord | null> {
  const statement = await getByNameStatement();
  const normalizedName = normalizeLookupName(name);
  if (!statement || !normalizedName) {
    return null;
  }

  const row = statement.get(normalizedName) as PrintRow | undefined;

  return toLocalPrintCardRecord(row);
}

export async function getSqlitePrintCardsByNames(
  names: string[]
): Promise<Map<string, LocalPrintCardRecord>> {
  const database = await ensureDb();
  const deduped = new Map<string, string>();

  for (const name of names) {
    const normalizedName = normalizeLookupName(name);
    if (!normalizedName || deduped.has(normalizedName)) {
      continue;
    }

    deduped.set(normalizedName, normalizedName);
  }

  if (!database || deduped.size === 0) {
    return new Map();
  }

  const placeholders = [...deduped.keys()].map(() => "?").join(", ");
  const queryParts: { selectClause: string; fromClause: string; hasDigitalColumn: boolean } = printCardsSelectClause
    ? {
        selectClause: printCardsSelectClause,
        fromClause: printCardsFromClause,
        hasDigitalColumn: printCardsHasDigitalColumn
      }
    : buildQueryParts(database);
  const rows = database
    .prepare(
      `
      SELECT ${queryParts.selectClause}
      ${queryParts.fromClause}
      WHERE normalized_name IN (${placeholders})
      ORDER BY normalized_name ASC, collector_sort_rank ASC, collector_sort_suffix ASC, printing_id ASC
    `
    )
    .all(...deduped.values()) as PrintRow[];

  const results = new Map<string, LocalPrintCardRecord>();
  for (const row of rows) {
    const record = toLocalPrintCardRecord(row);
    if (!record) {
      continue;
    }

    const key = `name:${normalizeLookupName(record.name)}`;
    if (!results.has(key)) {
      results.set(key, record);
    }
  }

  return results;
}

export async function getSqlitePrintCardsByNameSets(
  lookups: NameSetLookup[]
): Promise<Map<string, LocalPrintCardRecord>> {
  const database = await ensureDb();
  const deduped = new Map<string, { name: string; setCode: string; normalizedName: string }>();

  for (const lookup of lookups) {
    const normalizedSet = lookup.setCode.trim().toLowerCase();
    const normalizedName = normalizeLookupName(lookup.name);
    if (!normalizedSet || !normalizedName) {
      continue;
    }

    const key = buildNameSetKey(lookup.name, normalizedSet);
    if (!deduped.has(key)) {
      deduped.set(key, { name: lookup.name, setCode: normalizedSet, normalizedName });
    }
  }

  if (!database || deduped.size === 0) {
    return new Map();
  }

  const where = [...deduped.values()].map(() => "(set_code = ? AND normalized_name = ?)").join(" OR ");
  const params = [...deduped.values()].flatMap((lookup) => [lookup.setCode, lookup.normalizedName]);
  const queryParts = printCardsSelectClause
    ? { selectClause: printCardsSelectClause, fromClause: printCardsFromClause }
    : buildQueryParts(database);
  const rows = database
    .prepare(
      `
      SELECT ${queryParts.selectClause}
      ${queryParts.fromClause}
      WHERE ${where}
      ORDER BY set_code ASC, normalized_name ASC, collector_sort_rank ASC, collector_sort_suffix ASC, printing_id ASC
    `
    )
    .all(...params) as PrintRow[];

  const results = new Map<string, LocalPrintCardRecord>();
  for (const row of rows) {
    const record = toLocalPrintCardRecord(row);
    if (!record) {
      continue;
    }

    const key = buildNameSetKey(record.name, record.set);
    if (!results.has(key)) {
      results.set(key, record);
    }
  }

  return results;
}

export async function searchSqlitePrintCards(
  input: PrintSearchOptions = {}
): Promise<LocalPrintCardRecord[]> {
  const database = await ensureDb();
  if (!database) {
    return [];
  }

  const limit = Math.max(1, Math.min(1000, Math.floor(input.limit ?? 60)));
  const rawLimit = Math.max(limit * 8, 400);
  const queryParts: { selectClause: string; fromClause: string; hasDigitalColumn: boolean } = printCardsSelectClause
    ? {
        selectClause: printCardsSelectClause,
        fromClause: printCardsFromClause,
        hasDigitalColumn: printCardsHasDigitalColumn
      }
    : buildQueryParts(database);
  const normalizedQuery = normalizeLookupName(input.query ?? "");
  const normalizedSet = (input.setCode ?? "").trim().toLowerCase();
  const normalizedType = (input.cardType ?? "").trim().toLowerCase();
  const whereClauses: string[] = [];
  const params: Array<string | number> = [];

  if (queryParts.hasDigitalColumn) {
    whereClauses.push("coalesce(print_cards.digital, 0) = 0");
  }

  if (normalizedSet) {
    whereClauses.push("print_cards.set_code = ?");
    params.push(normalizedSet);
  }

  if (normalizedType) {
    whereClauses.push("lower(coalesce(oracle_cards.type_line, '')) LIKE ? ESCAPE '\\'");
    params.push(`%${escapeSqlLike(normalizedType)}%`);
  }

  const dedupeAndLimit = (rows: PrintRow[]): LocalPrintCardRecord[] => {
    const seen = new Set<string>();
    const results: LocalPrintCardRecord[] = [];
    const shouldDedupeByName = !normalizedSet;
    for (const row of rows) {
      const record = toLocalPrintCardRecord(row);
      if (!record) {
        continue;
      }

      if (shouldDedupeByName) {
        const dedupeKey = normalizeLookupName(record.name);
        if (!dedupeKey || seen.has(dedupeKey)) {
          continue;
        }

        seen.add(dedupeKey);
      }

      results.push(record);
      if (results.length >= limit) {
        break;
      }
    }

    return results;
  };

  if (normalizedQuery) {
    const nameLike = `%${escapeSqlLike(normalizedQuery)}%`;
    const startsWith = `${escapeSqlLike(normalizedQuery)}%`;
    whereClauses.push(
      "(print_cards.normalized_name LIKE ? ESCAPE '\\' OR lower(coalesce(oracle_cards.type_line, '')) LIKE ? ESCAPE '\\' OR lower(coalesce(oracle_cards.oracle_text, '')) LIKE ? ESCAPE '\\')"
    );
    params.push(nameLike, nameLike, nameLike);

    const rows = database
      .prepare(
        `
        SELECT ${queryParts.selectClause}
        ${queryParts.fromClause}
        ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
        ORDER BY
          CASE
            WHEN print_cards.normalized_name = ? THEN 0
            WHEN print_cards.normalized_name LIKE ? ESCAPE '\\' THEN 1
            WHEN print_cards.normalized_name LIKE ? ESCAPE '\\' THEN 2
            WHEN lower(coalesce(oracle_cards.type_line, '')) LIKE ? ESCAPE '\\' THEN 3
            ELSE 4
          END,
          print_cards.normalized_name ASC,
          print_cards.collector_sort_rank ASC,
          print_cards.collector_sort_suffix ASC,
          print_cards.printing_id ASC
        LIMIT ?
      `
      )
      .all(...params, normalizedQuery, startsWith, nameLike, nameLike, rawLimit) as PrintRow[];

    return dedupeAndLimit(rows);
  }

  const rows = database
    .prepare(
      `
      SELECT ${queryParts.selectClause}
      ${queryParts.fromClause}
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY
        print_cards.normalized_name ASC,
        print_cards.collector_sort_rank ASC,
        print_cards.collector_sort_suffix ASC,
        print_cards.printing_id ASC
      LIMIT ?
    `
    )
    .all(...params, rawLimit) as PrintRow[];

  return dedupeAndLimit(rows);
}

export async function listSqlitePrintSetRows(): Promise<SqlitePrintSetOptionRow[]> {
  if (printSetOptionRowsCache) {
    return printSetOptionRowsCache;
  }

  const database = await ensureDb();
  if (!database) {
    return [];
  }

  const rows = database
    .prepare(
      `
      SELECT DISTINCT
        print_cards.set_code AS set_code,
        print_cards.oracle_id AS oracle_id,
        print_cards.name AS name,
        oracle_cards.type_line AS type_line
      FROM print_cards
      LEFT JOIN oracle_cards ON oracle_cards.oracle_id = print_cards.oracle_id
      ORDER BY print_cards.set_code ASC
    `
    )
    .all() as Array<{
      set_code?: string;
      oracle_id?: string;
      name?: string;
      type_line?: string | null;
    }>;

  printSetOptionRowsCache = rows
    .filter(
      (row): row is { set_code: string; oracle_id: string; name: string; type_line?: string | null } =>
        typeof row.set_code === "string" && typeof row.oracle_id === "string" && typeof row.name === "string"
    )
    .map((row) => ({
      setCode: row.set_code.toUpperCase(),
      oracleId: row.oracle_id,
      name: row.name,
      typeLine: row.type_line ?? null
    }));

  return printSetOptionRowsCache;
}

export async function prewarmSqlitePrintStore(): Promise<{ available: boolean }> {
  const database = await ensureDb();
  if (!database) {
    return { available: false };
  }

  await Promise.all([
    getByIdStatement(),
    getBySetCollectorStatement(),
    getByNameSetStatement(),
    getByNameStatement()
  ]);
  return { available: true };
}
