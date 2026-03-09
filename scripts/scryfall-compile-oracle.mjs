import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const OUTPUT_DIR = path.resolve("data/scryfall");
const PRINT_SQLITE_PATH = path.join(OUTPUT_DIR, "prints.compiled.sqlite");
const PRINT_INDEX_DIR = path.join(OUTPUT_DIR, "print-index");
const PRINT_INDEX_MANIFEST_PATH = path.join(PRINT_INDEX_DIR, "manifest.compiled.json.gz");
const PRINT_INDEX_SHARD_DIR = path.join(PRINT_INDEX_DIR, "shards");
const PRINT_INDEX_BUCKET_COUNT = 256;
const DATASETS = [
  {
    rawPath: path.join(OUTPUT_DIR, "oracle-cards.raw.json"),
    compiledPath: path.join(OUTPUT_DIR, "oracle-cards.compiled.json"),
    label: "oracle-cards",
    compileCard: compileOracleCard,
    dedupeByNormalizedName: false
  },
  {
    rawPath: path.join(OUTPUT_DIR, "default-cards.raw.json"),
    compiledPath: path.join(OUTPUT_DIR, "default-cards.compiled.json.gz"),
    label: "default-cards",
    compileCard: compileDefaultCard,
    dedupeByNormalizedName: true,
    gzipOutput: true
  }
];

function fail(message) {
  throw new Error(message);
}

function normalizeLookupName(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pickImageUris(source, fields = ["small", "normal", "large", "png", "art_crop", "border_crop"]) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const imageUris = {};
  for (const field of fields) {
    if (typeof source[field] === "string" && source[field]) {
      imageUris[field] = source[field];
    }
  }

  return Object.keys(imageUris).length > 0 ? imageUris : undefined;
}

function pickCardFaces(card, options = { includeImages: false }) {
  if (!Array.isArray(card.card_faces)) {
    return null;
  }

  const faces = card.card_faces
    .map((face) => {
      if (!face || typeof face !== "object") {
        return null;
      }

      const next = {
        name: typeof face.name === "string" ? face.name : undefined,
        mana_cost: typeof face.mana_cost === "string" ? face.mana_cost : undefined,
        type_line: typeof face.type_line === "string" ? face.type_line : undefined,
        oracle_text: typeof face.oracle_text === "string" ? face.oracle_text : undefined,
        power: typeof face.power === "string" ? face.power : undefined,
        toughness: typeof face.toughness === "string" ? face.toughness : undefined,
        loyalty: typeof face.loyalty === "string" ? face.loyalty : undefined,
        colors: Array.isArray(face.colors) ? face.colors.filter((value) => typeof value === "string") : undefined
      };

      if (options.includeImages) {
        next.image_uris = pickImageUris(face.image_uris, ["normal", "art_crop"]);
      }

      return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
    })
    .filter(Boolean);

  return faces.length > 0 ? faces : null;
}

function baseCompiledCard(card) {
  if (!card || typeof card !== "object") {
    return null;
  }

  const oracleId = typeof card.oracle_id === "string" ? card.oracle_id : "";
  const name = typeof card.name === "string" ? card.name : "";
  if (!oracleId || !name) {
    return null;
  }

  const manaValue =
    typeof card.mana_value === "number" && Number.isFinite(card.mana_value)
      ? card.mana_value
      : typeof card.cmc === "number" && Number.isFinite(card.cmc)
        ? card.cmc
        : undefined;

  return {
    oracle_id: oracleId,
    name,
    mana_cost: typeof card.mana_cost === "string" ? card.mana_cost : undefined,
    mana_value: manaValue,
    type_line: typeof card.type_line === "string" ? card.type_line : undefined,
    colors: Array.isArray(card.colors) ? card.colors.filter((value) => typeof value === "string") : undefined,
    color_identity: Array.isArray(card.color_identity)
      ? card.color_identity.filter((value) => typeof value === "string")
      : undefined,
    oracle_text: typeof card.oracle_text === "string" ? card.oracle_text : undefined,
    keywords: Array.isArray(card.keywords)
      ? card.keywords.filter((value) => typeof value === "string")
      : undefined,
    legalities:
      card.legalities && typeof card.legalities === "object"
        ? Object.fromEntries(
            Object.entries(card.legalities).filter(
              ([format, status]) => typeof format === "string" && typeof status === "string"
            )
          )
        : undefined,
    power: typeof card.power === "string" ? card.power : undefined,
    toughness: typeof card.toughness === "string" ? card.toughness : undefined,
    loyalty: typeof card.loyalty === "string" ? card.loyalty : undefined,
    layout: typeof card.layout === "string" ? card.layout : undefined
  };
}

function compactRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function mergeLookupNames(primary, duplicate) {
  const merged = [
    ...(Array.isArray(primary.lookup_names) ? primary.lookup_names : []),
    ...(Array.isArray(duplicate.lookup_names) ? duplicate.lookup_names : [])
  ].filter((value, index, array) => typeof value === "string" && value && array.indexOf(value) === index);

  if (merged.length === 0) {
    return primary;
  }

  return {
    ...primary,
    lookup_names: merged
  };
}

function compileOracleCard(card) {
  const compiled = baseCompiledCard(card);
  if (!compiled) {
    return null;
  }

  return compactRecord({
    ...compiled,
    card_faces: pickCardFaces(card) ?? []
  });
}

function compileDefaultCard(card) {
  const compiled = baseCompiledCard(card);
  if (!compiled) {
    return null;
  }

  const lookupNames = [
    typeof card.name === "string" ? card.name : null,
    typeof card.flavor_name === "string" ? card.flavor_name : null
  ].filter((value, index, array) => typeof value === "string" && value && array.indexOf(value) === index);

  const prices =
    card.prices && typeof card.prices === "object"
      ? {
          usd: typeof card.prices.usd === "string" || card.prices.usd === null ? card.prices.usd : null,
          usd_foil:
            typeof card.prices.usd_foil === "string" || card.prices.usd_foil === null
              ? card.prices.usd_foil
              : null,
          usd_etched:
            typeof card.prices.usd_etched === "string" || card.prices.usd_etched === null
              ? card.prices.usd_etched
              : null,
          tix: typeof card.prices.tix === "string" || card.prices.tix === null ? card.prices.tix : null
        }
      : undefined;

  const purchaseUris =
    card.purchase_uris && typeof card.purchase_uris === "object"
      ? {
          tcgplayer:
            typeof card.purchase_uris.tcgplayer === "string" ? card.purchase_uris.tcgplayer : undefined,
          cardkingdom:
            typeof card.purchase_uris.cardkingdom === "string" ? card.purchase_uris.cardkingdom : undefined
        }
      : undefined;

  return compactRecord({
    ...compiled,
    id: typeof card.id === "string" ? card.id : undefined,
    set: typeof card.set === "string" ? card.set.toLowerCase() : undefined,
    collector_number: typeof card.collector_number === "string" ? card.collector_number : undefined,
    image_uris: pickImageUris(card.image_uris, ["normal", "art_crop"]) ?? null,
    card_faces: pickCardFaces(card, { includeImages: true }) ?? [],
    lookup_names: lookupNames.length > 0 ? lookupNames : undefined,
    prices: prices ?? null,
    purchase_uris: purchaseUris ?? null
  });
}

function dedupeCompiledCardsByNormalizedName(cards) {
  const deduped = new Map();

  for (const card of cards) {
    const key = normalizeLookupName(card.name);
    if (!key) {
      continue;
    }

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, card);
      continue;
    }

    deduped.set(key, mergeLookupNames(existing, card));
  }

  return [...deduped.values()];
}

function normalizeCollectorNumber(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\u2605\u2606]/g, "");
}

function collectorSortValue(value) {
  const normalized = normalizeCollectorNumber(value);
  const match = normalized.match(/^(\d+)(.*)$/);
  if (!match) {
    return {
      rank: Number.MAX_SAFE_INTEGER,
      suffix: normalized
    };
  }

  return {
    rank: Number.parseInt(match[1], 10),
    suffix: match[2]
  };
}

function comparePrintPreference(left, right) {
  const leftCollector = collectorSortValue(left.collector_number);
  const rightCollector = collectorSortValue(right.collector_number);
  if (leftCollector.rank !== rightCollector.rank) {
    return leftCollector.rank - rightCollector.rank;
  }

  if (leftCollector.suffix !== rightCollector.suffix) {
    return leftCollector.suffix.localeCompare(rightCollector.suffix);
  }

  return left.id.localeCompare(right.id);
}

function getPrintIndexBucketId(setCode) {
  const normalized = String(setCode ?? "").trim().toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  const bucket = hash % PRINT_INDEX_BUCKET_COUNT;
  return bucket.toString(16).padStart(2, "0");
}

function compilePrintIndexCard(card) {
  const name = typeof card?.name === "string" ? card.name : "";
  const oracleId = typeof card?.oracle_id === "string" ? card.oracle_id : "";
  const setCode = typeof card?.set === "string" ? card.set.toLowerCase() : "";
  const collectorNumber = typeof card?.collector_number === "string" ? card.collector_number : "";
  const id = typeof card?.id === "string" ? card.id : "";
  if (!name || !oracleId || !setCode || !collectorNumber || !id) {
    return null;
  }

  const prices =
    card.prices && typeof card.prices === "object"
      ? {
          usd: typeof card.prices.usd === "string" || card.prices.usd === null ? card.prices.usd : null,
          usd_foil:
            typeof card.prices.usd_foil === "string" || card.prices.usd_foil === null
              ? card.prices.usd_foil
              : null,
          usd_etched:
            typeof card.prices.usd_etched === "string" || card.prices.usd_etched === null
              ? card.prices.usd_etched
              : null,
          tix: typeof card.prices.tix === "string" || card.prices.tix === null ? card.prices.tix : null
        }
      : undefined;

  const purchaseUris =
    card.purchase_uris && typeof card.purchase_uris === "object"
      ? {
          tcgplayer:
            typeof card.purchase_uris.tcgplayer === "string" ? card.purchase_uris.tcgplayer : undefined,
          cardkingdom:
            typeof card.purchase_uris.cardkingdom === "string" ? card.purchase_uris.cardkingdom : undefined
        }
      : undefined;

  const cardFaces = Array.isArray(card.card_faces)
    ? card.card_faces
        .map((face) => {
          if (!face || typeof face !== "object") {
            return null;
          }

          return compactRecord({
            name: typeof face.name === "string" ? face.name : undefined,
            image_uris: pickImageUris(face.image_uris, ["normal", "art_crop"]) ?? undefined
          });
        })
        .filter(Boolean)
    : [];

  return compactRecord({
    id,
    oracle_id: oracleId,
    name,
    set: setCode,
    collector_number: collectorNumber,
    image_uris: pickImageUris(card.image_uris, ["normal", "art_crop"]) ?? null,
    card_faces: cardFaces,
    prices: prices ?? null,
    purchase_uris: purchaseUris ?? null
  });
}

async function compilePrintIndexArtifacts() {
  const rawPath = path.join(OUTPUT_DIR, "default-cards.raw.json");
  try {
    await fs.access(rawPath);
  } catch {
    fail(`Missing raw Scryfall file: ${rawPath}. Run: npm run scryfall:download`);
  }

  const raw = JSON.parse(await fs.readFile(rawPath, "utf8"));
  if (!Array.isArray(raw)) {
    fail("Unexpected print-index source format: expected top-level array");
  }

  await fs.rm(PRINT_INDEX_DIR, { recursive: true, force: true });
  await fs.mkdir(PRINT_INDEX_SHARD_DIR, { recursive: true });

  const bucketStates = new Map();
  const manifest = { byId: {} };
  let recordCount = 0;

  for (const card of raw) {
    const record = compilePrintIndexCard(card);
    if (!record) {
      continue;
    }

    const bucketId = getPrintIndexBucketId(record.set);
    if (!bucketStates.has(bucketId)) {
      bucketStates.set(bucketId, {
        records: [],
        byId: {},
        bySetCollector: {},
        byNameSetCandidates: new Map()
      });
    }

    const bucket = bucketStates.get(bucketId);
    const index = bucket.records.length;
    bucket.records.push(record);
    bucket.byId[`id:${record.id.toLowerCase()}`] = index;
    bucket.bySetCollector[
      `set:${record.set}|collector:${normalizeCollectorNumber(record.collector_number)}`
    ] = index;

    const nameSetKey = `name:${normalizeLookupName(record.name)}|set:${record.set}`;
    const existingIndex = bucket.byNameSetCandidates.get(nameSetKey);
    if (typeof existingIndex !== "number") {
      bucket.byNameSetCandidates.set(nameSetKey, index);
    } else {
      const existingRecord = bucket.records[existingIndex];
      if (comparePrintPreference(record, existingRecord) < 0) {
        bucket.byNameSetCandidates.set(nameSetKey, index);
      }
    }

    manifest.byId[`id:${record.id.toLowerCase()}`] = bucketId;
    recordCount += 1;
  }

  const shardWrites = [];
  for (const [bucketId, bucket] of bucketStates.entries()) {
    const byNameSet = {};
    for (const [key, index] of bucket.byNameSetCandidates.entries()) {
      byNameSet[key] = index;
    }

    shardWrites.push(
      fs.writeFile(
        path.join(PRINT_INDEX_SHARD_DIR, `${bucketId}.json.gz`),
        zlib.gzipSync(
          JSON.stringify({
            records: bucket.records,
            byId: bucket.byId,
            bySetCollector: bucket.bySetCollector,
            byNameSet
          })
        )
      )
    );
  }

  await Promise.all(shardWrites);
  await fs.writeFile(PRINT_INDEX_MANIFEST_PATH, zlib.gzipSync(JSON.stringify(manifest)));
  console.log(
    `Compiled ${recordCount} print-index records across ${bucketStates.size} shards to: ${PRINT_INDEX_DIR}`
  );
}

async function compilePrintSqliteArtifact() {
  const rawPath = path.join(OUTPUT_DIR, "default-cards.raw.json");
  try {
    await fs.access(rawPath);
  } catch {
    fail(`Missing raw Scryfall file: ${rawPath}. Run: npm run scryfall:download`);
  }

  const raw = JSON.parse(await fs.readFile(rawPath, "utf8"));
  if (!Array.isArray(raw)) {
    fail("Unexpected print SQLite source format: expected top-level array");
  }

  const { DatabaseSync } = await import("node:sqlite");
  await fs.rm(PRINT_SQLITE_PATH, { force: true });

  const database = new DatabaseSync(PRINT_SQLITE_PATH);
  try {
    database.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = MEMORY;

      CREATE TABLE oracle_cards (
        oracle_id TEXT PRIMARY KEY,
        type_line TEXT,
        cmc REAL,
        mana_cost TEXT,
        colors_json TEXT,
        color_identity_json TEXT,
        oracle_text TEXT,
        keywords_json TEXT
      ) WITHOUT ROWID;

      CREATE TABLE print_cards (
        printing_id TEXT PRIMARY KEY,
        set_code TEXT NOT NULL,
        collector_number TEXT NOT NULL,
        normalized_collector_number TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        collector_sort_rank INTEGER NOT NULL,
        collector_sort_suffix TEXT NOT NULL,
        oracle_id TEXT NOT NULL,
        name TEXT NOT NULL,
        image_normal TEXT,
        image_art_crop TEXT,
        price_usd TEXT,
        price_usd_foil TEXT,
        price_usd_etched TEXT,
        tcgplayer_url TEXT,
        card_faces_json TEXT
      ) WITHOUT ROWID;

      CREATE INDEX idx_print_cards_set_collector
        ON print_cards (set_code, normalized_collector_number);

      CREATE INDEX idx_print_cards_set_name_rank
        ON print_cards (set_code, normalized_name, collector_sort_rank, collector_sort_suffix, printing_id);

      CREATE INDEX idx_print_cards_name_rank
        ON print_cards (normalized_name, collector_sort_rank, collector_sort_suffix, printing_id);
    `);

    const insertOracle = database.prepare(`
      INSERT OR REPLACE INTO oracle_cards (
        oracle_id,
        type_line,
        cmc,
        mana_cost,
        colors_json,
        color_identity_json,
        oracle_text,
        keywords_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insert = database.prepare(`
      INSERT OR REPLACE INTO print_cards (
        printing_id,
        set_code,
        collector_number,
        normalized_collector_number,
        normalized_name,
        collector_sort_rank,
        collector_sort_suffix,
        oracle_id,
        name,
        image_normal,
        image_art_crop,
        price_usd,
        price_usd_foil,
        price_usd_etched,
        tcgplayer_url,
        card_faces_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let recordCount = 0;
    database.exec("BEGIN");
    for (const card of raw) {
      const compiled = compilePrintIndexCard(card);
      const oracleFields = baseCompiledCard(card);
      if (!compiled || !oracleFields) {
        continue;
      }

      const collectorSort = collectorSortValue(compiled.collector_number);
      const facesPayload =
        Array.isArray(card.card_faces) && card.card_faces.length > 0
          ? JSON.stringify(pickCardFaces(card, { includeImages: true }))
          : null;

      insertOracle.run(
        compiled.oracle_id,
        oracleFields.type_line ?? null,
        typeof oracleFields.mana_value === "number" && Number.isFinite(oracleFields.mana_value)
          ? oracleFields.mana_value
          : null,
        oracleFields.mana_cost ?? null,
        Array.isArray(oracleFields.colors) ? JSON.stringify(oracleFields.colors) : null,
        Array.isArray(oracleFields.color_identity) ? JSON.stringify(oracleFields.color_identity) : null,
        oracleFields.oracle_text ?? null,
        Array.isArray(oracleFields.keywords) ? JSON.stringify(oracleFields.keywords) : null
      );

      insert.run(
        compiled.id.toLowerCase(),
        compiled.set,
        compiled.collector_number,
        normalizeCollectorNumber(compiled.collector_number),
        normalizeLookupName(compiled.name),
        collectorSort.rank,
        collectorSort.suffix,
        compiled.oracle_id,
        compiled.name,
        compiled.image_uris?.normal ?? null,
        compiled.image_uris?.art_crop ?? null,
        compiled.prices?.usd ?? null,
        compiled.prices?.usd_foil ?? null,
        compiled.prices?.usd_etched ?? null,
        compiled.purchase_uris?.tcgplayer ?? null,
        facesPayload
      );
      recordCount += 1;
    }
    database.exec("COMMIT");
    database.exec("VACUUM");

    console.log(`Compiled ${recordCount} print rows to SQLite: ${PRINT_SQLITE_PATH}`);
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // ignore rollback failures
    }
    throw error;
  } finally {
    database.close();
  }
}

async function compileDataset(dataset) {
  try {
    await fs.access(dataset.rawPath);
  } catch {
    fail(`Missing raw Scryfall file: ${dataset.rawPath}. Run: npm run scryfall:download`);
  }

  const rawText = await fs.readFile(dataset.rawPath, "utf8");
  const raw = JSON.parse(rawText);
  if (!Array.isArray(raw)) {
    fail(`Unexpected ${dataset.label} format: expected top-level array`);
  }

  const finalized = dataset.compileDataset
    ? dataset.compileDataset(raw)
    : (() => {
        const compiled = raw.map((card) => dataset.compileCard(card)).filter(Boolean);
        return dataset.dedupeByNormalizedName ? dedupeCompiledCardsByNormalizedName(compiled) : compiled;
      })();
  const json = JSON.stringify(finalized);
  if (dataset.gzipOutput) {
    await fs.writeFile(dataset.compiledPath, zlib.gzipSync(json));
  } else {
    await fs.writeFile(dataset.compiledPath, json, "utf8");
  }
  const recordCount = Array.isArray(finalized) ? finalized.length : finalized.records.length;
  console.log(`Compiled ${recordCount} ${dataset.label} records to: ${dataset.compiledPath}`);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const dataset of DATASETS) {
    await compileDataset(dataset);
  }
  await compilePrintIndexArtifacts();
  await compilePrintSqliteArtifact();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`scryfall:compile failed: ${message}`);
  process.exit(1);
});
