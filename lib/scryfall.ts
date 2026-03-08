import {
  DeckCard,
  ParsedDeckEntry,
  ScryfallCard,
  ScryfallCardFace,
  ScryfallImageUris,
  ScryfallPurchaseUris,
  ScryfallPrices
} from "./types";
import { CardDatabase } from "@/engine/cards/CardDatabase";
import type { CardDefinition } from "@/engine/core/types";
import { getCachedScryfallCards, saveCachedScryfallCards } from "./scryfallCardCacheStore";
import { getLocalDefaultCardByName, getLocalDefaultCardsByNames } from "./scryfallLocalDefaultStore";
import {
  getLocalPrintCardById,
  getLocalPrintCardByNameSet,
  getLocalPrintCardBySetCollector,
  type LocalPrintCardRecord
} from "./scryfallLocalPrintIndexStore";

/**
 * Scryfall integration for card lookups.
 * Network failures intentionally return null so analysis can continue.
 */
const NAMED_ENDPOINT = "https://api.scryfall.com/cards/named";
const COLLECTION_ENDPOINT = "https://api.scryfall.com/cards/collection";
const CARD_BY_ID_ENDPOINT = "https://api.scryfall.com/cards";
const DEFAULT_CONCURRENCY = 8;
const COLLECTION_CHUNK_SIZE = 75;
const SCRYFALL_HEADERS = {
  Accept: "application/json",
  "User-Agent": "CommanderDeckDoctor/1.0",
  "Content-Type": "application/json"
} as const;
// Promise cache deduplicates repeated lookups for identical identifiers.
const cardCache = new Map<string, Promise<ScryfallCard | null>>();
let localOracleDatabase: CardDatabase | null = null;

type DeckPriceMode = "oracle-default" | "decklist-set";
type BatchLookupMode = "precise" | "name";

type ScryfallApiCard = {
  object: string;
  id?: string;
  oracle_id?: string;
  set?: string;
  collector_number?: string;
  name: string;
  type_line?: string;
  cmc?: number;
  mana_cost?: string;
  colors?: string[] | null;
  color_identity?: string[] | null;
  oracle_text?: string;
  keywords?: string[] | null;
  image_uris?: ScryfallImageUris | null;
  card_faces?: ScryfallCardFace[];
  prices?: ScryfallPrices | null;
  purchase_uris?: ScryfallPurchaseUris | null;
};

type ScryfallCollectionResponse = {
  object?: string;
  data?: ScryfallApiCard[];
};

type ScryfallCollectionIdentifier =
  | { id: string }
  | { set: string; collector_number: string }
  | { name: string; set: string }
  | { name: string };

type BatchLookupMaps = {
  byId: Map<string, ScryfallCard>;
  bySetCollector: Map<string, ScryfallCard>;
  byNameSet: Map<string, ScryfallCard>;
  byName: Map<string, ScryfallCard>;
};

type LocalPrintLookupMaps = {
  byId: Map<string, ScryfallCard>;
  bySetCollector: Map<string, ScryfallCard>;
  byNameSet: Map<string, ScryfallCard>;
};

function normalizeScryfallCard(data: ScryfallApiCard): ScryfallCard {
  const oracleText =
    data.oracle_text ??
    data.card_faces?.map((face) => face.oracle_text ?? "").filter(Boolean).join("\n") ??
    "";

  return {
    id: data.id,
    oracle_id: data.oracle_id,
    set: typeof data.set === "string" ? data.set.toLowerCase() : undefined,
    collector_number:
      typeof data.collector_number === "string" ? data.collector_number : undefined,
    name: data.name,
    type_line: data.type_line ?? "",
    cmc: typeof data.cmc === "number" ? data.cmc : 0,
    mana_cost: data.mana_cost ?? "",
    colors: Array.isArray(data.colors) ? data.colors : [],
    color_identity: Array.isArray(data.color_identity) ? data.color_identity : [],
    oracle_text: oracleText,
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    image_uris: data.image_uris ?? null,
    card_faces: Array.isArray(data.card_faces) ? data.card_faces : [],
    prices: data.prices ?? null,
    purchase_uris: data.purchase_uris ?? null
  };
}

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
    .replace(/[★☆]/g, "");
}

function buildNameKey(name: string): string {
  return `name:${normalizeLookupName(name)}`;
}

function buildNameSetKey(name: string, setCode: string): string {
  return `${normalizeLookupName(name)}|set:${setCode.trim().toLowerCase()}`;
}

function buildPrintingIdKey(printingId: string): string {
  return `id:${printingId.trim().toLowerCase()}`;
}

function buildSetCollectorKey(setCode: string, collectorNumber: string): string {
  return `set:${setCode.trim().toLowerCase()}|collector:${normalizeCollectorNumber(collectorNumber)}`;
}

function collectorNumberMatches(
  expected: string | null | undefined,
  actual: string | null | undefined
): boolean {
  const normalizedExpected = normalizeCollectorNumber(expected);
  const normalizedActual = normalizeCollectorNumber(actual);
  if (!normalizedExpected || !normalizedActual) {
    return false;
  }

  if (normalizedExpected === normalizedActual) {
    return true;
  }

  if (/^\d+$/.test(normalizedExpected) && /^\d+$/.test(normalizedActual)) {
    return normalizedExpected.replace(/^0+/, "") === normalizedActual.replace(/^0+/, "");
  }

  return false;
}

function chunkArray<T>(rows: T[], chunkSize: number): T[][] {
  if (rows.length === 0) {
    return [];
  }

  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function createEmptyBatchLookupMaps(): BatchLookupMaps {
  return {
    byId: new Map<string, ScryfallCard>(),
    bySetCollector: new Map<string, ScryfallCard>(),
    byNameSet: new Map<string, ScryfallCard>(),
    byName: new Map<string, ScryfallCard>()
  };
}

function createEmptyLocalPrintLookupMaps(): LocalPrintLookupMaps {
  return {
    byId: new Map<string, ScryfallCard>(),
    bySetCollector: new Map<string, ScryfallCard>(),
    byNameSet: new Map<string, ScryfallCard>()
  };
}

function getLocalOracleDatabase(): CardDatabase {
  if (!localOracleDatabase) {
    try {
      localOracleDatabase = CardDatabase.loadFromCompiledFile();
    } catch {
      localOracleDatabase = CardDatabase.createWithEngineSet();
    }
  }

  return localOracleDatabase;
}

function toLocalScryfallCard(card: CardDefinition): ScryfallCard {
  return {
    oracle_id: card.oracleId,
    name: card.name,
    type_line: card.typeLine,
    cmc: card.mv,
    mana_cost: card.manaCost ?? "",
    colors: [...card.colors],
    color_identity: [...card.colorIdentity],
    oracle_text: card.oracleText ?? "",
    keywords: [...card.keywords],
    image_uris: null,
    card_faces: card.faces.map((face) => ({
      oracle_text: face.oracleText ?? "",
      mana_cost: face.manaCost ?? undefined
    })),
    prices: null,
    purchase_uris: null
  };
}

function toScryfallCardFromLocalPrintRecord(record: LocalPrintCardRecord): ScryfallCard | null {
  const db = getLocalOracleDatabase();
  const oracleCard = db.getCardByOracleId(record.oracle_id) ?? db.getCardByName(record.name);
  if (!oracleCard) {
    return null;
  }

  const faceImagesByName = new Map(
    record.card_faces
      .filter((face) => typeof face?.name === "string" && face.name.trim().length > 0)
      .map((face) => [normalizeLookupName(face.name ?? ""), face.image_uris ?? undefined] as const)
  );

  return {
    id: record.id,
    oracle_id: record.oracle_id,
    set: record.set,
    collector_number: record.collector_number,
    name: oracleCard.name,
    type_line: oracleCard.typeLine,
    cmc: oracleCard.mv,
    mana_cost: oracleCard.manaCost ?? "",
    colors: [...oracleCard.colors],
    color_identity: [...oracleCard.colorIdentity],
    oracle_text: oracleCard.oracleText ?? "",
    keywords: [...oracleCard.keywords],
    image_uris: record.image_uris ?? null,
    card_faces: oracleCard.faces.map((face) => ({
      oracle_text: face.oracleText ?? "",
      mana_cost: face.manaCost ?? undefined,
      image_uris: faceImagesByName.get(normalizeLookupName(face.name)) ?? undefined
    })),
    prices: record.prices ?? null,
    purchase_uris: record.purchase_uris ?? null
  };
}

function getLocalOracleFallbackCardsByNames(names: string[]): Map<string, ScryfallCard> {
  const db = getLocalOracleDatabase();
  const rows = new Map<string, ScryfallCard>();

  for (const name of names) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) {
      continue;
    }

    const key = buildNameKey(trimmed);
    if (rows.has(key)) {
      continue;
    }

    const card = db.getCardByName(trimmed);
    if (!card) {
      continue;
    }

    rows.set(key, toLocalScryfallCard(card));
  }

  return rows;
}

function buildCacheEntriesForCard(card: ScryfallCard): Array<{ key: string; card: ScryfallCard }> {
  const rows = new Map<string, ScryfallCard>();
  rows.set(buildNameKey(card.name), card);

  if (card.set) {
    rows.set(buildNameSetKey(card.name, card.set), card);
  }
  if (card.id) {
    rows.set(buildPrintingIdKey(card.id), card);
  }
  if (card.set && card.collector_number) {
    rows.set(buildSetCollectorKey(card.set, card.collector_number), card);
  }

  return [...rows.entries()].map(([key, cachedCard]) => ({ key, card: cachedCard }));
}

function primeMemoryCache(card: ScryfallCard): void {
  for (const entry of buildCacheEntriesForCard(card)) {
    cardCache.set(entry.key, Promise.resolve(entry.card));
  }
}

function persistCards(cards: ScryfallCard[]): void {
  if (cards.length === 0) {
    return;
  }

  const cacheEntries = cards.flatMap((card) => buildCacheEntriesForCard(card));
  if (cacheEntries.length === 0) {
    return;
  }

  void saveCachedScryfallCards(cacheEntries);
}

function applyCardToLookupMaps(lookups: BatchLookupMaps, card: ScryfallCard): void {
  lookups.byName.set(buildNameKey(card.name), card);

  if (card.set) {
    lookups.byNameSet.set(buildNameSetKey(card.name, card.set), card);
  }
  if (card.set && card.collector_number) {
    lookups.bySetCollector.set(buildSetCollectorKey(card.set, card.collector_number), card);
  }
  if (card.id) {
    lookups.byId.set(buildPrintingIdKey(card.id), card);
  }
}

function applyCardToLocalPrintLookupMaps(
  lookups: LocalPrintLookupMaps,
  entry: ParsedDeckEntry,
  card: ScryfallCard
): void {
  if (card.id) {
    lookups.byId.set(buildPrintingIdKey(card.id), card);
  }

  const setCode = typeof entry.setCode === "string" ? entry.setCode.trim().toLowerCase() : "";
  const collectorNumber =
    typeof entry.collectorNumber === "string" ? entry.collectorNumber.trim() : "";

  if (setCode && collectorNumber) {
    lookups.bySetCollector.set(buildSetCollectorKey(setCode, collectorNumber), card);
  }

  if (setCode) {
    lookups.byNameSet.set(buildNameSetKey(entry.name, setCode), card);
  }
}

async function getCachedCardsByKeys(keys: string[]): Promise<Map<string, ScryfallCard>> {
  const uniqueKeys = [...new Set(keys.filter((key) => typeof key === "string" && key.trim().length > 0))];
  if (uniqueKeys.length === 0) {
    return new Map();
  }

  const results = new Map<string, ScryfallCard>();
  const unresolvedKeys: string[] = [];
  const memoryRows = await Promise.all(
    uniqueKeys.map(async (key) => {
      const pending = cardCache.get(key);
      if (!pending) {
        return [key, null] as const;
      }

      try {
        return [key, await pending] as const;
      } catch {
        return [key, null] as const;
      }
    })
  );

  for (const [key, card] of memoryRows) {
    if (card) {
      results.set(key, card);
      continue;
    }

    unresolvedKeys.push(key);
  }

  if (unresolvedKeys.length === 0) {
    return results;
  }

  const persisted = await getCachedScryfallCards(unresolvedKeys);
  for (const [key, card] of persisted.entries()) {
    results.set(key, card);
    primeMemoryCache(card);
  }

  return results;
}

function resolveIdentifierKeys(
  parsedDeck: ParsedDeckEntry[],
  lookupMode: BatchLookupMode
): Map<string, ScryfallCollectionIdentifier> {
  const identifiersByKey = new Map<string, ScryfallCollectionIdentifier>();

  for (const entry of parsedDeck) {
    const setCode = typeof entry.setCode === "string" ? entry.setCode.trim().toLowerCase() : "";
    const collectorNumber =
      typeof entry.collectorNumber === "string" ? entry.collectorNumber.trim() : "";
    const printingId = typeof entry.printingId === "string" ? entry.printingId.trim().toLowerCase() : "";
    const name = entry.name.trim();

    if (lookupMode === "name") {
      if (!name) {
        continue;
      }

      const nameKey = buildNameKey(name);
      if (!identifiersByKey.has(nameKey)) {
        identifiersByKey.set(nameKey, { name });
      }
      continue;
    }

    if (printingId) {
      const idKey = buildPrintingIdKey(printingId);
      if (!identifiersByKey.has(idKey)) {
        identifiersByKey.set(idKey, { id: printingId });
      }
      continue;
    }

    if (setCode && collectorNumber) {
      const setCollectorKey = buildSetCollectorKey(setCode, collectorNumber);
      if (!identifiersByKey.has(setCollectorKey)) {
        identifiersByKey.set(setCollectorKey, {
          set: setCode,
          collector_number: collectorNumber
        });
      }
      continue;
    }

    if (!name || !setCode) {
      continue;
    }

    const nameSetKey = buildNameSetKey(name, setCode);
    if (!identifiersByKey.has(nameSetKey)) {
      identifiersByKey.set(nameSetKey, { name, set: setCode });
    }
  }

  return identifiersByKey;
}

async function fetchCardsByBatchIdentifiers(
  parsedDeck: ParsedDeckEntry[],
  options?: { lookupMode?: BatchLookupMode }
): Promise<BatchLookupMaps> {
  const lookupMode = options?.lookupMode ?? "precise";
  const identifiersByKey = resolveIdentifierKeys(parsedDeck, lookupMode);
  if (identifiersByKey.size === 0) {
    return createEmptyBatchLookupMaps();
  }

  const resolved = createEmptyBatchLookupMaps();
  const cachedCards = await getCachedCardsByKeys([...identifiersByKey.keys()]);
  const unresolvedIdentifiers: ScryfallCollectionIdentifier[] = [];

  for (const [key, identifier] of identifiersByKey.entries()) {
    const cachedCard = cachedCards.get(key);
    if (cachedCard) {
      applyCardToLookupMaps(resolved, cachedCard);
      continue;
    }

    unresolvedIdentifiers.push(identifier);
  }

  const fetchedCards: ScryfallCard[] = [];
  for (const chunk of chunkArray(unresolvedIdentifiers, COLLECTION_CHUNK_SIZE)) {
    try {
      const response = await fetch(COLLECTION_ENDPOINT, {
        method: "POST",
        headers: SCRYFALL_HEADERS,
        cache: "no-store",
        body: JSON.stringify({
          identifiers: chunk
        })
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as ScryfallCollectionResponse;
      if (!Array.isArray(payload.data)) {
        continue;
      }

      for (const rawCard of payload.data) {
        if (!rawCard || rawCard.object === "error" || !rawCard.name) {
          continue;
        }

        const normalizedCard = normalizeScryfallCard(rawCard);
        applyCardToLookupMaps(resolved, normalizedCard);
        primeMemoryCache(normalizedCard);
        fetchedCards.push(normalizedCard);
      }
    } catch {
      continue;
    }
  }

  persistCards(fetchedCards);
  return resolved;
}

async function getLocalPrintLookupMaps(parsedDeck: ParsedDeckEntry[]): Promise<LocalPrintLookupMaps> {
  const lookups = createEmptyLocalPrintLookupMaps();
  const persistedCards: ScryfallCard[] = [];

  for (const entry of parsedDeck) {
    let card: ScryfallCard | null = null;
    const printingId = typeof entry.printingId === "string" ? entry.printingId.trim() : "";
    const setCode = typeof entry.setCode === "string" ? entry.setCode.trim().toLowerCase() : "";
    const collectorNumber =
      typeof entry.collectorNumber === "string" ? entry.collectorNumber.trim() : "";

    if (printingId) {
      const record = await getLocalPrintCardById(printingId);
      if (record) {
        card = toScryfallCardFromLocalPrintRecord(record);
      }
    }

    if (!card && setCode && collectorNumber) {
      const record = await getLocalPrintCardBySetCollector(setCode, collectorNumber);
      if (record && normalizeLookupName(record.name) === normalizeLookupName(entry.name)) {
        card = toScryfallCardFromLocalPrintRecord(record);
      }
    }

    if (!card && setCode) {
      const record = await getLocalPrintCardByNameSet(entry.name, setCode);
      if (record && (!collectorNumber || collectorNumberMatches(collectorNumber, record.collector_number))) {
        card = toScryfallCardFromLocalPrintRecord(record);
      }
    }

    if (!card) {
      continue;
    }

    applyCardToLocalPrintLookupMaps(lookups, entry, card);
    primeMemoryCache(card);
    persistedCards.push(card);
  }

  persistCards(persistedCards);
  return lookups;
}

async function fetchNamedCard(
  key: "exact" | "fuzzy",
  name: string,
  options?: { setCode?: string | null }
): Promise<ScryfallCard | null> {
  try {
    const url = new URL(NAMED_ENDPOINT);
    url.searchParams.set(key, name);
    const requestedSet = options?.setCode?.trim().toLowerCase() ?? "";
    if (requestedSet) {
      url.searchParams.set("set", requestedSet);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: SCRYFALL_HEADERS,
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ScryfallApiCard;
    if (data.object === "error" || !data.name) {
      return null;
    }

    return normalizeScryfallCard(data);
  } catch {
    return null;
  }
}

async function fetchCardById(printingId: string): Promise<ScryfallCard | null> {
  try {
    const response = await fetch(`${CARD_BY_ID_ENDPOINT}/${encodeURIComponent(printingId)}`, {
      method: "GET",
      headers: SCRYFALL_HEADERS,
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ScryfallApiCard;
    if (data.object === "error" || !data.name) {
      return null;
    }

    return normalizeScryfallCard(data);
  } catch {
    return null;
  }
}

async function fetchCardBySetAndCollector(
  setCode: string,
  collectorNumber: string
): Promise<ScryfallCard | null> {
  const candidates = [...new Set([collectorNumber, collectorNumber.toUpperCase(), collectorNumber.toLowerCase()])];

  for (const candidate of candidates) {
    try {
      const response = await fetch(
        `${CARD_BY_ID_ENDPOINT}/${encodeURIComponent(setCode)}/${encodeURIComponent(candidate)}`,
        {
          method: "GET",
          headers: SCRYFALL_HEADERS,
          cache: "no-store"
        }
      );

      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as ScryfallApiCard;
      if (data.object === "error" || !data.name) {
        continue;
      }

      return normalizeScryfallCard(data);
    } catch {
      continue;
    }
  }

  return null;
}

export async function getCardByName(name: string): Promise<ScryfallCard | null> {
  const key = buildNameKey(name);
  const cached = await getCachedCardsByKeys([key]);
  if (cached.has(key)) {
    return cached.get(key) ?? null;
  }

  const localDefault = getLocalDefaultCardByName(name);
  if (localDefault) {
    primeMemoryCache(localDefault);
    return localDefault;
  }

  const pending = (async () => {
    const exact = await fetchNamedCard("exact", name);
    if (exact) {
      primeMemoryCache(exact);
      persistCards([exact]);
      return exact;
    }

    const fuzzy = await fetchNamedCard("fuzzy", name);
    if (fuzzy) {
      primeMemoryCache(fuzzy);
      persistCards([fuzzy]);
    }
    return fuzzy;
  })();

  cardCache.set(key, pending);
  return pending;
}

export async function getCardById(printingId: string): Promise<ScryfallCard | null> {
  const normalizedId = printingId.trim().toLowerCase();
  if (!normalizedId) {
    return null;
  }

  const key = buildPrintingIdKey(normalizedId);
  const cached = await getCachedCardsByKeys([key]);
  if (cached.has(key)) {
    return cached.get(key) ?? null;
  }

  const localPrint = await getLocalPrintCardById(normalizedId);
  if (localPrint) {
    const localCard = toScryfallCardFromLocalPrintRecord(localPrint);
    if (localCard) {
      primeMemoryCache(localCard);
      persistCards([localCard]);
      return localCard;
    }
  }

  const pending = (async () => {
    const card = await fetchCardById(normalizedId);
    if (card) {
      primeMemoryCache(card);
      persistCards([card]);
    }
    return card;
  })();

  cardCache.set(key, pending);
  return pending;
}

export async function getCardByNameWithSet(name: string, setCode: string): Promise<ScryfallCard | null> {
  const normalizedSet = setCode.trim().toLowerCase();
  if (!normalizedSet) {
    return getCardByName(name);
  }

  const key = buildNameSetKey(name, normalizedSet);
  const cached = await getCachedCardsByKeys([key]);
  if (cached.has(key)) {
    return cached.get(key) ?? null;
  }

  const localPrint = await getLocalPrintCardByNameSet(name, normalizedSet);
  if (localPrint) {
    const localCard = toScryfallCardFromLocalPrintRecord(localPrint);
    if (localCard) {
      primeMemoryCache(localCard);
      persistCards([localCard]);
      return localCard;
    }
  }

  const localDefault = getLocalDefaultCardByName(name);
  if (localDefault?.set === normalizedSet) {
    primeMemoryCache(localDefault);
    return localDefault;
  }

  const pending = (async () => {
    const exact = await fetchNamedCard("exact", name, { setCode: normalizedSet });
    if (exact) {
      primeMemoryCache(exact);
      persistCards([exact]);
      return exact;
    }

    const fuzzy = await fetchNamedCard("fuzzy", name, { setCode: normalizedSet });
    if (fuzzy) {
      primeMemoryCache(fuzzy);
      persistCards([fuzzy]);
    }
    if (fuzzy) {
      return fuzzy;
    }

    if (localDefault) {
      primeMemoryCache(localDefault);
      return localDefault;
    }

    return null;
  })();

  cardCache.set(key, pending);
  return pending;
}

async function getCardBySetAndCollector(
  setCode: string,
  collectorNumber: string
): Promise<ScryfallCard | null> {
  const normalizedSet = setCode.trim().toLowerCase();
  const normalizedCollector = collectorNumber.trim();
  if (!normalizedSet || !normalizedCollector) {
    return null;
  }

  const key = buildSetCollectorKey(normalizedSet, normalizedCollector);
  const cached = await getCachedCardsByKeys([key]);
  if (cached.has(key)) {
    return cached.get(key) ?? null;
  }

  const localPrint = await getLocalPrintCardBySetCollector(normalizedSet, normalizedCollector);
  if (localPrint) {
    const localCard = toScryfallCardFromLocalPrintRecord(localPrint);
    if (localCard) {
      primeMemoryCache(localCard);
      persistCards([localCard]);
      return localCard;
    }
  }

  const pending = (async () => {
    const card = await fetchCardBySetAndCollector(normalizedSet, normalizedCollector);
    if (card) {
      primeMemoryCache(card);
      persistCards([card]);
    }
    return card;
  })();

  cardCache.set(key, pending);
  return pending;
}

function resolveCardFromLocalPrintLookups(
  entry: ParsedDeckEntry,
  lookups: LocalPrintLookupMaps
): ScryfallCard | null {
  const printingId =
    typeof entry.printingId === "string" && entry.printingId.trim() ? entry.printingId : null;
  const setCode = typeof entry.setCode === "string" && entry.setCode.trim() ? entry.setCode : null;
  const collectorNumber =
    typeof entry.collectorNumber === "string" && entry.collectorNumber.trim()
      ? entry.collectorNumber
      : null;

  if (printingId) {
    const byId = lookups.byId.get(buildPrintingIdKey(printingId));
    if (byId) {
      return byId;
    }
  }

  if (setCode && collectorNumber) {
    const byCollector = lookups.bySetCollector.get(buildSetCollectorKey(setCode, collectorNumber));
    if (byCollector) {
      return byCollector;
    }
  }

  if (setCode) {
    const byNameSet = lookups.byNameSet.get(buildNameSetKey(entry.name, setCode));
    if (byNameSet) {
      return byNameSet;
    }
  }

  return null;
}

function resolveCardFromBatchLookups(
  entry: ParsedDeckEntry,
  mode: DeckPriceMode,
  preciseLookups: BatchLookupMaps,
  nameLookups?: BatchLookupMaps | null
): ScryfallCard | null {
  const setCode = typeof entry.setCode === "string" && entry.setCode.trim() ? entry.setCode : null;
  const collectorNumber =
    typeof entry.collectorNumber === "string" && entry.collectorNumber.trim()
      ? entry.collectorNumber
      : null;
  const printingId =
    typeof entry.printingId === "string" && entry.printingId.trim() ? entry.printingId : null;

  if (mode === "decklist-set" && printingId) {
    const byId = preciseLookups.byId.get(buildPrintingIdKey(printingId));
    if (byId) {
      return byId;
    }
  }

  if (mode === "decklist-set" && setCode && collectorNumber) {
    const byCollector = preciseLookups.bySetCollector.get(buildSetCollectorKey(setCode, collectorNumber));
    if (byCollector && normalizeLookupName(byCollector.name) === normalizeLookupName(entry.name)) {
      return byCollector;
    }
  }

  if (mode === "decklist-set" && setCode) {
    const byNameSet = preciseLookups.byNameSet.get(buildNameSetKey(entry.name, setCode));
    if (byNameSet) {
      if (!collectorNumber || collectorNumberMatches(collectorNumber, byNameSet.collector_number)) {
        return byNameSet;
      }
    }
  }

  const nameMaps = nameLookups ?? preciseLookups;
  return nameMaps.byName.get(buildNameKey(entry.name)) ?? null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        break;
      }

      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

/**
 * Resolves parsed deck rows against Scryfall with bounded concurrency.
 * Unknown card names are preserved and returned to the caller.
 */
export async function fetchDeckCards(
  parsedDeck: ParsedDeckEntry[],
  concurrency = DEFAULT_CONCURRENCY,
  options?: { deckPriceMode?: DeckPriceMode }
): Promise<{ knownCards: DeckCard[]; unknownCards: string[] }> {
  const mode = options?.deckPriceMode ?? "oracle-default";
  let localDefaultLookups = new Map<string, ScryfallCard>();
  let localPrintLookups = createEmptyLocalPrintLookupMaps();
  let preciseLookups = createEmptyBatchLookupMaps();
  let nameLookups: BatchLookupMaps | null = null;

  if (mode === "oracle-default") {
    localDefaultLookups = getLocalDefaultCardsByNames(parsedDeck.map((entry) => entry.name));
    const unresolvedForNetwork = parsedDeck.filter(
      (entry) => !localDefaultLookups.has(buildNameKey(entry.name))
    );
    if (unresolvedForNetwork.length > 0) {
      preciseLookups = await fetchCardsByBatchIdentifiers(unresolvedForNetwork, {
        lookupMode: "name"
      });
      nameLookups = preciseLookups;
    }
  } else {
    localPrintLookups = await getLocalPrintLookupMaps(parsedDeck);
    const unresolvedForPreciseBatch = parsedDeck.filter(
      (entry) => !resolveCardFromLocalPrintLookups(entry, localPrintLookups)
    );
    if (unresolvedForPreciseBatch.length > 0) {
      preciseLookups = await fetchCardsByBatchIdentifiers(unresolvedForPreciseBatch, {
        lookupMode: "precise"
      });
    }
  }

  if (mode === "decklist-set") {
    const unresolvedForNameBatch = parsedDeck.filter(
      (entry) =>
        !resolveCardFromLocalPrintLookups(entry, localPrintLookups) &&
        !resolveCardFromBatchLookups(entry, mode, preciseLookups, null)
    );
    if (unresolvedForNameBatch.length > 0) {
      nameLookups = await fetchCardsByBatchIdentifiers(unresolvedForNameBatch, {
        lookupMode: "name"
      });
    }
  }

  if (mode === "decklist-set") {
    const unresolvedForLocalDefault = parsedDeck.filter(
      (entry) =>
        !resolveCardFromLocalPrintLookups(entry, localPrintLookups) &&
        !resolveCardFromBatchLookups(entry, mode, preciseLookups, nameLookups)
    );
    if (unresolvedForLocalDefault.length > 0) {
      localDefaultLookups = getLocalDefaultCardsByNames(
        unresolvedForLocalDefault.map((entry) => entry.name)
      );
    }
  }

  const localOracleFallbacks = getLocalOracleFallbackCardsByNames(
    parsedDeck
      .filter((entry) => {
        const resolvedFromLocalPrint = resolveCardFromLocalPrintLookups(entry, localPrintLookups);
        const resolvedFromBatch = resolveCardFromBatchLookups(entry, mode, preciseLookups, nameLookups);
        const resolvedFromDefault = localDefaultLookups.get(buildNameKey(entry.name)) ?? null;
        return !resolvedFromLocalPrint && !resolvedFromBatch && !resolvedFromDefault;
      })
      .map((entry) => entry.name)
  );

  const lookedUp = await mapWithConcurrency(parsedDeck, Math.max(1, concurrency), async (entry) => {
    const setCode = typeof entry.setCode === "string" && entry.setCode.trim() ? entry.setCode : null;
    const collectorNumber =
      typeof entry.collectorNumber === "string" && entry.collectorNumber.trim()
        ? entry.collectorNumber
        : null;
    const batchByName = nameLookups?.byName.get(buildNameKey(entry.name)) ?? null;
    const localDefault = localDefaultLookups.get(buildNameKey(entry.name)) ?? null;
    const localFallback = localOracleFallbacks.get(buildNameKey(entry.name)) ?? null;
    const localPrint = resolveCardFromLocalPrintLookups(entry, localPrintLookups);
    let card: ScryfallCard | null =
      mode === "oracle-default"
        ? localDefault ?? resolveCardFromBatchLookups(entry, mode, preciseLookups, nameLookups)
        : localPrint ?? resolveCardFromBatchLookups(entry, mode, preciseLookups, nameLookups);

    if (mode === "decklist-set" && !card && setCode) {
      card = await getCardByNameWithSet(entry.name, setCode);
    }

    if (mode === "decklist-set" && !card && setCode && collectorNumber) {
      card = await getCardBySetAndCollector(setCode, collectorNumber);
    }

    if (mode === "decklist-set" && !card) {
      card = localDefault ?? localFallback;
    }

    if (!card) {
      card = batchByName ?? localFallback ?? (await getCardByName(entry.name));
    }

    return { entry, card };
  });

  const knownCards: DeckCard[] = [];
  const unknownCards: string[] = [];

  for (const row of lookedUp) {
    if (!row.card) {
      unknownCards.push(row.entry.name);
      continue;
    }

    knownCards.push({
      name: row.entry.name,
      qty: row.entry.qty,
      setCode: row.entry.setCode,
      collectorNumber: row.entry.collectorNumber,
      printingId: row.entry.printingId,
      card: row.card
    });
  }

  return { knownCards, unknownCards };
}
