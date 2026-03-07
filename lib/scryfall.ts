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
  const lookedUp = await mapWithConcurrency(parsedDeck, Math.max(1, concurrency), async (entry) => {
    const setCode = typeof entry.setCode === "string" && entry.setCode.trim() ? entry.setCode : null;
    const collectorNumber =
      typeof entry.collectorNumber === "string" && entry.collectorNumber.trim()
        ? entry.collectorNumber
        : null;
    const printingId =
      typeof entry.printingId === "string" && entry.printingId.trim() ? entry.printingId : null;
    let card: ScryfallCard | null = null;

    if (mode === "decklist-set" && printingId) {
      card = await getCardById(printingId);
    }

    if (mode === "decklist-set" && setCode && collectorNumber) {
      card = card ?? (await getCardBySetAndCollector(setCode, collectorNumber));
    }

    if (mode === "decklist-set" && setCode) {
      card = card ?? await getCardByNameWithSet(entry.name, setCode);
    }

    if (!card) {
      card = await getCardByName(entry.name);
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
