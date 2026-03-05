import {
  DeckCard,
  ParsedDeckEntry,
  ScryfallCard,
  ScryfallCardFace,
  ScryfallImageUris,
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
  "User-Agent": "CommanderDeckDoctor/1.0"
} as const;
// Promise cache deduplicates repeated lookups for identical names.
const cardCache = new Map<string, Promise<ScryfallCard | null>>();

type ScryfallApiCard = {
  object: string;
  name: string;
  type_line?: string;
  cmc?: number;
  mana_cost?: string;
  colors?: string[] | null;
  color_identity?: string[] | null;
  oracle_text?: string;
  image_uris?: ScryfallImageUris | null;
  card_faces?: ScryfallCardFace[];
  prices?: ScryfallPrices | null;
};

async function fetchNamedCard(
  key: "exact" | "fuzzy",
  name: string
): Promise<ScryfallCard | null> {
  try {
    const url = new URL(NAMED_ENDPOINT);
    url.searchParams.set(key, name);

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

    // Some cards expose oracle text only on faces.
    const oracleText =
      data.oracle_text ??
      data.card_faces?.map((face) => face.oracle_text ?? "").filter(Boolean).join("\n") ??
      "";

    return {
      name: data.name,
      type_line: data.type_line ?? "",
      cmc: typeof data.cmc === "number" ? data.cmc : 0,
      mana_cost: data.mana_cost ?? "",
      colors: Array.isArray(data.colors) ? data.colors : [],
      color_identity: Array.isArray(data.color_identity) ? data.color_identity : [],
      oracle_text: oracleText,
      image_uris: data.image_uris ?? null,
      card_faces: Array.isArray(data.card_faces) ? data.card_faces : [],
      prices: data.prices ?? null
    };
  } catch {
    return null;
  }
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
  concurrency = DEFAULT_CONCURRENCY
): Promise<{ knownCards: DeckCard[]; unknownCards: string[] }> {
  const lookedUp = await mapWithConcurrency(parsedDeck, Math.max(1, concurrency), async (entry) => {
    const card = await getCardByName(entry.name);
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
      card: row.card
    });
  }

  return { knownCards, unknownCards };
}
