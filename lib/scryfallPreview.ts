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
  id?: string;
  name?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  released_at?: string;
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

type CardPreviewRequestOptions = {
  setCode?: string | null;
  printingId?: string | null;
};

async function fetchPrintingById(printingId: string): Promise<RawScryfallCard | null> {
  const endpoint = `https://api.scryfall.com/cards/${encodeURIComponent(printingId)}`;

  try {
    const response = await fetch(endpoint, {
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

async function fetchNamed(
  mode: "exact" | "fuzzy",
  cardName: string,
  options?: CardPreviewRequestOptions
): Promise<RawScryfallCard | null> {
  const endpoint = new URL("https://api.scryfall.com/cards/named");
  endpoint.searchParams.set(mode, cardName);
  const setCode = options?.setCode?.trim().toLowerCase() ?? "";
  if (setCode) {
    endpoint.searchParams.set("set", setCode);
  }

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
    scryfallId: typeof payload.id === "string" ? payload.id : null,
    setCode: typeof payload.set === "string" ? payload.set.toLowerCase() : null,
    setName: typeof payload.set_name === "string" ? payload.set_name : null,
    collectorNumber: typeof payload.collector_number === "string" ? payload.collector_number : null,
    releasedAt: typeof payload.released_at === "string" ? payload.released_at : null,
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

export async function getCardPreview(
  cardName: string,
  options?: CardPreviewRequestOptions
): Promise<CardPreviewData | null> {
  const trimmed = cardName.trim();
  if (!trimmed) {
    return null;
  }

  const lookup = {
    setCode: options?.setCode ?? null,
    printingId: options?.printingId ?? null
  };
  const cached = getCachedPreview(trimmed, lookup);
  if (cached !== undefined) {
    return cached;
  }

  const inflight = getInflightPreview(trimmed, lookup);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const printingId = options?.printingId?.trim() ?? "";
    if (printingId) {
      const exactPrinting = await fetchPrintingById(printingId);
      const normalizedPrinting = exactPrinting ? normalizePreview(exactPrinting) : null;
      setCachedPreview(trimmed, normalizedPrinting, lookup);
      return normalizedPrinting;
    }

    const exact = await fetchNamed("exact", trimmed, lookup);
    const normalizedExact = exact ? normalizePreview(exact) : null;
    if (normalizedExact) {
      setCachedPreview(trimmed, normalizedExact, lookup);
      return normalizedExact;
    }

    const fuzzy = await fetchNamed("fuzzy", trimmed, lookup);
    const normalizedFuzzy = fuzzy ? normalizePreview(fuzzy) : null;
    setCachedPreview(trimmed, normalizedFuzzy, lookup);
    return normalizedFuzzy;
  })();

  setInflightPreview(trimmed, request, lookup);
  request.finally(() => clearInflightPreview(trimmed, lookup));
  return request;
}
