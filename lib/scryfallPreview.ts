import {
  CardPreviewData,
  getCachedPreview,
  getInflightPreview,
  setInflightPreview,
  clearInflightPreview,
  setCachedPreview
} from "@/lib/previewCache";

type RawScryfallFace = {
  mana_cost?: string;
  type_line?: string;
  image_uris?: {
    normal?: string;
  };
};

type RawScryfallCard = {
  object?: string;
  name?: string;
  mana_cost?: string;
  type_line?: string;
  image_uris?: {
    normal?: string;
  };
  card_faces?: RawScryfallFace[];
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
    tix?: string | null;
  };
};

async function fetchNamed(mode: "exact" | "fuzzy", cardName: string): Promise<RawScryfallCard | null> {
  const endpoint = new URL("https://api.scryfall.com/cards/named");
  endpoint.searchParams.set(mode, cardName);

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as RawScryfallCard;
    if (payload.object === "error") {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function normalizePreview(payload: RawScryfallCard): CardPreviewData | null {
  if (!payload || typeof payload.name !== "string" || !payload.name) {
    return null;
  }

  const firstFace = payload.card_faces?.[0];
  const imageUrl = payload.image_uris?.normal ?? firstFace?.image_uris?.normal ?? null;
  const manaCost = payload.mana_cost ?? firstFace?.mana_cost ?? null;
  const typeLine = payload.type_line ?? firstFace?.type_line ?? null;

  return {
    name: payload.name,
    imageUrl,
    manaCost,
    typeLine,
    prices: payload.prices
      ? {
          usd: payload.prices.usd ?? null,
          usdFoil: payload.prices.usd_foil ?? null,
          usdEtched: payload.prices.usd_etched ?? null,
          tix: payload.prices.tix ?? null
        }
      : null
  };
}

export async function getCardPreview(cardName: string): Promise<CardPreviewData | null> {
  const trimmed = cardName.trim();
  if (!trimmed) {
    return null;
  }

  const cached = getCachedPreview(trimmed);
  if (cached !== undefined) {
    return cached;
  }

  const inflight = getInflightPreview(trimmed);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const exact = await fetchNamed("exact", trimmed);
    const normalizedExact = exact ? normalizePreview(exact) : null;
    if (normalizedExact) {
      setCachedPreview(trimmed, normalizedExact);
      return normalizedExact;
    }

    const fuzzy = await fetchNamed("fuzzy", trimmed);
    const normalizedFuzzy = fuzzy ? normalizePreview(fuzzy) : null;
    setCachedPreview(trimmed, normalizedFuzzy);
    return normalizedFuzzy;
  })();

  setInflightPreview(trimmed, request);
  request.finally(() => clearInflightPreview(trimmed));
  return request;
}
