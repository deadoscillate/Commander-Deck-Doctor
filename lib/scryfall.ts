import {
  DeckCard,
  ParsedDeckEntry,
  ScryfallCard,
  ScryfallCardFace,
  ScryfallImageUris,
  ScryfallPurchaseUris,
  ScryfallPrices
} from "./types";

/**
 * Scryfall integration for named-card lookups.
 * This module intentionally returns null on lookup failures so analysis can continue.
 */
const NAMED_ENDPOINT = "https://api.scryfall.com/cards/named";
const COLLECTION_ENDPOINT = "https://api.scryfall.com/cards/collection";
const DEFAULT_CONCURRENCY = 8;
const SCRYFALL_HEADERS = {
  Accept: "application/json",
  "User-Agent": "CommanderDeckDoctor/1.0",
  "Content-Type": "application/json"
} as const;
// Promise cache deduplicates repeated lookups for identical names.
const cardCache = new Map<string, Promise<ScryfallCard | null>>();

type DeckPriceMode = "oracle-default" | "decklist-set";

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

function buildNameSetKey(name: string, setCode: string): string {
  return `${normalizeLookupName(name)}|set:${setCode.trim().toLowerCase()}`;
}

function buildPrintingIdKey(printingId: string): string {
  return `id:${printingId.trim().toLowerCase()}`;
}

function buildSetCollectorKey(setCode: string, collectorNumber: string): string {
  return `set:${setCode.trim().toLowerCase()}|collector:${normalizeCollectorNumber(collectorNumber)}`;
}

function buildBatchNameKey(name: string): string {
  return `name:${normalizeLookupName(name)}`;
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

function normalizeCollectorNumber(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[★☆]/g, "");
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

function createEmptyBatchLookupMaps(): BatchLookupMaps {
  return {
    byId: new Map<string, ScryfallCard>(),
    bySetCollector: new Map<string, ScryfallCard>(),
    byNameSet: new Map<string, ScryfallCard>(),
    byName: new Map<string, ScryfallCard>()
  };
}

async function fetchCardsByBatchIdentifiers(
  parsedDeck: ParsedDeckEntry[],
  options?: { includeSetLookups?: boolean }
): Promise<BatchLookupMaps> {
  const includeSetLookups = options?.includeSetLookups ?? true;
  const identifiersByKey = new Map<string, ScryfallCollectionIdentifier>();
  for (const entry of parsedDeck) {
    const setCode = typeof entry.setCode === "string" ? entry.setCode.trim().toLowerCase() : "";
    const collectorNumber =
      typeof entry.collectorNumber === "string" ? entry.collectorNumber.trim() : "";
    const printingId = typeof entry.printingId === "string" ? entry.printingId.trim().toLowerCase() : "";
    const name = entry.name.trim();
    if (name) {
      const nameKey = buildBatchNameKey(name);
      if (!identifiersByKey.has(nameKey)) {
        identifiersByKey.set(nameKey, { name });
      }
    }

    if (!includeSetLookups) {
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

  if (identifiersByKey.size === 0) {
    return createEmptyBatchLookupMaps();
  }

  const resolved = createEmptyBatchLookupMaps();
  const identifiers = [...identifiersByKey.values()];
  for (const chunk of chunkArray(identifiers, 75)) {
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
        const batchNameKey = buildBatchNameKey(normalizedCard.name);
        if (batchNameKey !== "name:") {
          resolved.byName.set(batchNameKey, normalizedCard);
        }
        const normalizedSet = normalizedCard.set ?? "";
        if (normalizedSet) {
          resolved.byNameSet.set(buildNameSetKey(normalizedCard.name, normalizedSet), normalizedCard);
        }
        if (normalizedSet && normalizedCard.collector_number) {
          resolved.bySetCollector.set(
            buildSetCollectorKey(normalizedSet, normalizedCard.collector_number),
            normalizedCard
          );
        }
        if (normalizedCard.id) {
          resolved.byId.set(buildPrintingIdKey(normalizedCard.id), normalizedCard);
        }

        if (normalizedSet) {
          const nameSetCacheKey = `${normalizedCard.name.toLowerCase().trim()}|set:${normalizedSet}`;
          cardCache.set(nameSetCacheKey, Promise.resolve(normalizedCard));
        }
        cardCache.set(normalizedCard.name.toLowerCase().trim(), Promise.resolve(normalizedCard));
        if (normalizedCard.id) {
          cardCache.set(buildPrintingIdKey(normalizedCard.id), Promise.resolve(normalizedCard));
        }
        if (normalizedSet && normalizedCard.collector_number) {
          cardCache.set(
            buildSetCollectorKey(normalizedSet, normalizedCard.collector_number),
            Promise.resolve(normalizedCard)
          );
        }
      }
    } catch {
      continue;
    }
  }

  return resolved;
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
    const response = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(printingId)}`, {
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
        `https://api.scryfall.com/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(candidate)}`,
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
  const key = name.toLowerCase().trim();
  const cached = cardCache.get(key);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    // Primary lookup path, then tolerant fallback to fuzzy.
    const exact = await fetchNamedCard("exact", name);
    if (exact) {
      return exact;
    }

    return fetchNamedCard("fuzzy", name);
  })();

  cardCache.set(key, pending);
  return pending;
}

export async function getCardById(printingId: string): Promise<ScryfallCard | null> {
  const normalizedId = printingId.trim().toLowerCase();
  if (!normalizedId) {
    return null;
  }

  const key = `id:${normalizedId}`;
  const cached = cardCache.get(key);
  if (cached) {
    return cached;
  }

  const pending = fetchCardById(normalizedId);
  cardCache.set(key, pending);
  return pending;
}

export async function getCardByNameWithSet(name: string, setCode: string): Promise<ScryfallCard | null> {
  const normalizedSet = setCode.trim().toLowerCase();
  if (!normalizedSet) {
    return getCardByName(name);
  }

  const key = `${name.toLowerCase().trim()}|set:${normalizedSet}`;
  const cached = cardCache.get(key);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const exact = await fetchNamedCard("exact", name, { setCode: normalizedSet });
    if (exact) {
      return exact;
    }

    return fetchNamedCard("fuzzy", name, { setCode: normalizedSet });
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

  const key = `set:${normalizedSet}|collector:${normalizedCollector.toLowerCase()}`;
  const cached = cardCache.get(key);
  if (cached) {
    return cached;
  }

  const pending = fetchCardBySetAndCollector(normalizedSet, normalizedCollector);
  cardCache.set(key, pending);
  return pending;
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
  const batchLookups = await fetchCardsByBatchIdentifiers(parsedDeck, {
    includeSetLookups: mode === "decklist-set"
  });
  const lookedUp = await mapWithConcurrency(parsedDeck, Math.max(1, concurrency), async (entry) => {
    const setCode = typeof entry.setCode === "string" && entry.setCode.trim() ? entry.setCode : null;
    const collectorNumber =
      typeof entry.collectorNumber === "string" && entry.collectorNumber.trim()
        ? entry.collectorNumber
        : null;
    const printingId =
      typeof entry.printingId === "string" && entry.printingId.trim() ? entry.printingId : null;
    const batchByName = batchLookups.byName.get(buildBatchNameKey(entry.name));
    let card: ScryfallCard | null = null;

    if (mode === "decklist-set" && printingId) {
      card = batchLookups.byId.get(buildPrintingIdKey(printingId)) ?? (await getCardById(printingId));
    }

    if (mode === "decklist-set" && !card && setCode && collectorNumber) {
      const batchByCollector = batchLookups.bySetCollector.get(
        buildSetCollectorKey(setCode, collectorNumber)
      );
      if (
        batchByCollector &&
        normalizeLookupName(batchByCollector.name) === normalizeLookupName(entry.name)
      ) {
        card = batchByCollector;
      }
    }

    if (mode === "decklist-set" && !card && setCode) {
      const batchResolved = batchLookups.byNameSet.get(buildNameSetKey(entry.name, setCode));
      if (batchResolved) {
        if (!collectorNumber || collectorNumberMatches(collectorNumber, batchResolved.collector_number)) {
          card = batchResolved;
        }
      }
    }

    // Prefer collection-name fallback before per-card named endpoints.
    if (mode === "decklist-set" && !card && batchByName) {
      card = batchByName;
    }

    if (mode === "decklist-set" && !card && setCode) {
      card = card ?? await getCardByNameWithSet(entry.name, setCode);
    }

    if (mode === "decklist-set" && !card && setCode && collectorNumber) {
      card = card ?? (await getCardBySetAndCollector(setCode, collectorNumber));
    }

    if (!card) {
      card = batchByName ?? (await getCardByName(entry.name));
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
