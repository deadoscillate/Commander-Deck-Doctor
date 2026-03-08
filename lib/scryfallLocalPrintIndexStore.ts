import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { ScryfallCardFace, ScryfallImageUris, ScryfallPrices, ScryfallPurchaseUris } from "./types";
import {
  getSqlitePrintCardById,
  getSqlitePrintCardByNameSet,
  getSqlitePrintCardBySetCollector
} from "./scryfallLocalPrintSqliteStore";

export type LocalPrintCardFace = ScryfallCardFace & {
  name?: string;
};

export type LocalPrintCardRecord = {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  collector_number: string;
  image_uris: ScryfallImageUris | null;
  card_faces: LocalPrintCardFace[];
  prices: ScryfallPrices | null;
  purchase_uris: ScryfallPurchaseUris | null;
};

type PrintIndexManifestPayload = {
  byId: Record<string, string>;
};

type PrintIndexShardPayload = {
  records: LocalPrintCardRecord[];
  byId: Record<string, number>;
  bySetCollector: Record<string, number>;
  byNameSet: Record<string, number>;
};

type PrintIndexShardStore = {
  records: LocalPrintCardRecord[];
  byId: Map<string, number>;
  bySetCollector: Map<string, number>;
  byNameSet: Map<string, number>;
};

const PRINT_INDEX_DIR = "data/scryfall/print-index";
const PRINT_INDEX_MANIFEST_FILE = path.resolve(PRINT_INDEX_DIR, "manifest.compiled.json.gz");
const PRINT_INDEX_SHARD_DIR = path.resolve(PRINT_INDEX_DIR, "shards");
const PRINT_INDEX_BUCKET_COUNT = 256;

let manifestCache: Map<string, string> | null = null;
const shardCache = new Map<string, PrintIndexShardStore>();

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

function buildIdKey(printingId: string): string {
  return `id:${printingId.trim().toLowerCase()}`;
}

function buildSetCollectorKey(setCode: string, collectorNumber: string): string {
  return `set:${setCode.trim().toLowerCase()}|collector:${normalizeCollectorNumber(collectorNumber)}`;
}

function buildNameSetKey(name: string, setCode: string): string {
  return `name:${normalizeLookupName(name)}|set:${setCode.trim().toLowerCase()}`;
}

function getPrintIndexBucketId(setCode: string): string {
  const normalized = String(setCode ?? "").trim().toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  const bucket = hash % PRINT_INDEX_BUCKET_COUNT;
  return bucket.toString(16).padStart(2, "0");
}

function normalizeRecord(record: LocalPrintCardRecord): LocalPrintCardRecord {
  return {
    ...record,
    set: record.set.toLowerCase(),
    image_uris: record.image_uris ?? null,
    card_faces: Array.isArray(record.card_faces)
      ? record.card_faces
          .filter((face) => face && typeof face === "object")
          .map((face) => ({
            name: typeof face.name === "string" ? face.name : undefined,
            image_uris: face.image_uris ?? undefined,
            mana_cost: face.mana_cost ?? undefined,
            oracle_text: face.oracle_text ?? undefined
          }))
      : [],
    prices: record.prices ?? null,
    purchase_uris: record.purchase_uris ?? null
  };
}

function createEmptyShardStore(): PrintIndexShardStore {
  return {
    records: [],
    byId: new Map(),
    bySetCollector: new Map(),
    byNameSet: new Map()
  };
}

function loadManifest(): Map<string, string> {
  if (manifestCache) {
    return manifestCache;
  }

  if (!fs.existsSync(PRINT_INDEX_MANIFEST_FILE)) {
    manifestCache = new Map();
    return manifestCache;
  }

  const raw = zlib.gunzipSync(fs.readFileSync(PRINT_INDEX_MANIFEST_FILE)).toString("utf8");
  const parsed = JSON.parse(raw) as Partial<PrintIndexManifestPayload>;
  manifestCache = new Map(Object.entries(parsed.byId ?? {}));
  return manifestCache;
}

function loadShard(bucketId: string): PrintIndexShardStore {
  const normalizedBucket = bucketId.trim().toLowerCase();
  const cached = shardCache.get(normalizedBucket);
  if (cached) {
    return cached;
  }

  const shardPath = path.join(PRINT_INDEX_SHARD_DIR, `${normalizedBucket}.json.gz`);
  if (!fs.existsSync(shardPath)) {
    const empty = createEmptyShardStore();
    shardCache.set(normalizedBucket, empty);
    return empty;
  }

  const raw = zlib.gunzipSync(fs.readFileSync(shardPath)).toString("utf8");
  const parsed = JSON.parse(raw) as Partial<PrintIndexShardPayload>;
  const store: PrintIndexShardStore = {
    records: Array.isArray(parsed.records) ? parsed.records.map((row) => normalizeRecord(row)) : [],
    byId: new Map(Object.entries(parsed.byId ?? {})),
    bySetCollector: new Map(Object.entries(parsed.bySetCollector ?? {})),
    byNameSet: new Map(Object.entries(parsed.byNameSet ?? {}))
  };
  shardCache.set(normalizedBucket, store);
  return store;
}

function resolveRecord(store: PrintIndexShardStore, index: number | undefined): LocalPrintCardRecord | null {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    return null;
  }

  return store.records[index] ?? null;
}

export async function getLocalPrintCardById(printingId: string): Promise<LocalPrintCardRecord | null> {
  const sqliteCard = await getSqlitePrintCardById(printingId);
  if (sqliteCard) {
    return normalizeRecord(sqliteCard);
  }

  const key = buildIdKey(printingId);
  const bucketId = loadManifest().get(key);
  if (!bucketId) {
    return null;
  }

  const store = loadShard(bucketId);
  return resolveRecord(store, store.byId.get(key));
}

export async function getLocalPrintCardBySetCollector(
  setCode: string,
  collectorNumber: string
): Promise<LocalPrintCardRecord | null> {
  const sqliteCard = await getSqlitePrintCardBySetCollector(setCode, collectorNumber);
  if (sqliteCard) {
    return normalizeRecord(sqliteCard);
  }

  const store = loadShard(getPrintIndexBucketId(setCode));
  const key = buildSetCollectorKey(setCode, collectorNumber);
  return resolveRecord(store, store.bySetCollector.get(key));
}

export async function getLocalPrintCardByNameSet(
  name: string,
  setCode: string
): Promise<LocalPrintCardRecord | null> {
  const sqliteCard = await getSqlitePrintCardByNameSet(name, setCode);
  if (sqliteCard) {
    return normalizeRecord(sqliteCard);
  }

  const store = loadShard(getPrintIndexBucketId(setCode));
  const key = buildNameSetKey(name, setCode);
  return resolveRecord(store, store.byNameSet.get(key));
}
