import type { CardPreviewData } from "@/lib/previewCache";
import { getLocalDefaultCardByName } from "@/lib/scryfallLocalDefaultStore";
import {
  getLocalPrintCardById,
  getLocalPrintCardByName,
  getLocalPrintCardByNameSet,
  getLocalPrintCardBySetCollector,
  type LocalPrintCardRecord
} from "@/lib/scryfallLocalPrintIndexStore";
import type { ScryfallCard } from "@/lib/types";

type RawScryfallFace = {
  mana_cost?: string;
  type_line?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
    border_crop?: string;
  };
};

type RawScryfallCard = {
  object?: string;
  id?: string;
  digital?: boolean;
  name?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  released_at?: string;
  mana_cost?: string;
  type_line?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
    border_crop?: string;
  };
  card_faces?: RawScryfallFace[];
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
    tix?: string | null;
  };
};

export type CardPreviewRequestOptions = {
  setCode?: string | null;
  collectorNumber?: string | null;
  printingId?: string | null;
};

const SCRYFALL_HEADERS = {
  Accept: "application/json",
  "User-Agent": "CommanderDeckDoctor/1.0"
};

async function fetchPrintingById(printingId: string): Promise<RawScryfallCard | null> {
  const endpoint = `https://api.scryfall.com/cards/${encodeURIComponent(printingId)}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: SCRYFALL_HEADERS,
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
      headers: SCRYFALL_HEADERS,
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

async function fetchBySetAndCollector(setCode: string, collectorNumber: string): Promise<RawScryfallCard | null> {
  const normalizedSetCode = setCode.trim().toLowerCase();
  const normalizedCollectorNumber = collectorNumber.trim();
  if (!normalizedSetCode || !normalizedCollectorNumber) {
    return null;
  }

  const candidates = [
    ...new Set([normalizedCollectorNumber, normalizedCollectorNumber.toUpperCase(), normalizedCollectorNumber.toLowerCase()])
  ];

  for (const candidate of candidates) {
    const endpoint = `https://api.scryfall.com/cards/${encodeURIComponent(normalizedSetCode)}/${encodeURIComponent(candidate)}`;
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: SCRYFALL_HEADERS,
        cache: "no-store"
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as RawScryfallCard;
      if (payload.object === "error") {
        continue;
      }

      return payload;
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeLocalPrintPreview(payload: LocalPrintCardRecord): CardPreviewData | null {
  if (!payload?.name) {
    return null;
  }

  const firstFace = payload.card_faces?.[0];
  const imageUrl =
    payload.image_uris?.large ??
    payload.image_uris?.normal ??
    payload.image_uris?.png ??
    payload.image_uris?.border_crop ??
    firstFace?.image_uris?.large ??
    firstFace?.image_uris?.normal ??
    firstFace?.image_uris?.png ??
    firstFace?.image_uris?.border_crop ??
    null;

  return {
    name: payload.name,
    scryfallId: payload.id ?? null,
    setCode: payload.set?.toLowerCase() ?? null,
    setName: null,
    collectorNumber: payload.collector_number ?? null,
    releasedAt: null,
    imageUrl,
    manaCost: payload.mana_cost ?? firstFace?.mana_cost ?? null,
    typeLine: payload.type_line ?? null,
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

function normalizeLocalDefaultPreview(payload: ScryfallCard): CardPreviewData | null {
  if (!payload?.name) {
    return null;
  }

  const firstFace = payload.card_faces?.[0];
  const imageUrl =
    payload.image_uris?.large ??
    payload.image_uris?.normal ??
    payload.image_uris?.png ??
    payload.image_uris?.border_crop ??
    firstFace?.image_uris?.large ??
    firstFace?.image_uris?.normal ??
    firstFace?.image_uris?.png ??
    firstFace?.image_uris?.border_crop ??
    null;

  return {
    name: payload.name,
    scryfallId: typeof payload.id === "string" ? payload.id : null,
    setCode: typeof payload.set === "string" ? payload.set.toLowerCase() : null,
    setName: null,
    collectorNumber: typeof payload.collector_number === "string" ? payload.collector_number : null,
    releasedAt: null,
    imageUrl,
    manaCost: payload.mana_cost ?? firstFace?.mana_cost ?? null,
    typeLine: payload.type_line ?? null,
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

function normalizePreview(payload: RawScryfallCard, allowDigital = false): CardPreviewData | null {
  if (!payload || typeof payload.name !== "string" || !payload.name) {
    return null;
  }

  if (payload.digital === true && !allowDigital) {
    return null;
  }

  const firstFace = payload.card_faces?.[0];
  const imageUrl =
    payload.image_uris?.large ??
    payload.image_uris?.normal ??
    payload.image_uris?.png ??
    payload.image_uris?.border_crop ??
    firstFace?.image_uris?.large ??
    firstFace?.image_uris?.normal ??
    firstFace?.image_uris?.png ??
    firstFace?.image_uris?.border_crop ??
    null;

  return {
    name: payload.name,
    scryfallId: typeof payload.id === "string" ? payload.id : null,
    setCode: typeof payload.set === "string" ? payload.set.toLowerCase() : null,
    setName: typeof payload.set_name === "string" ? payload.set_name : null,
    collectorNumber: typeof payload.collector_number === "string" ? payload.collector_number : null,
    releasedAt: typeof payload.released_at === "string" ? payload.released_at : null,
    imageUrl,
    manaCost: payload.mana_cost ?? firstFace?.mana_cost ?? null,
    typeLine: payload.type_line ?? firstFace?.type_line ?? null,
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

export async function resolveCardPreview(
  cardName: string,
  options?: CardPreviewRequestOptions
): Promise<CardPreviewData | null> {
  const trimmed = cardName.trim();
  if (!trimmed) {
    return null;
  }

  const printingId = options?.printingId?.trim() ?? "";
  if (printingId) {
    const localPrinting = await getLocalPrintCardById(printingId);
    const normalizedLocalPrinting = localPrinting ? normalizeLocalPrintPreview(localPrinting) : null;
    if (normalizedLocalPrinting) {
      return normalizedLocalPrinting;
    }

    const exactPrinting = await fetchPrintingById(printingId);
    return exactPrinting ? normalizePreview(exactPrinting, true) : null;
  }

  const setCode = options?.setCode?.trim() ?? "";
  const collectorNumber = options?.collectorNumber?.trim() ?? "";
  if (setCode && collectorNumber) {
    const localByCollector = await getLocalPrintCardBySetCollector(setCode, collectorNumber);
    const normalizedLocalByCollector = localByCollector ? normalizeLocalPrintPreview(localByCollector) : null;
    if (normalizedLocalByCollector) {
      return normalizedLocalByCollector;
    }

    const exactByCollector = await fetchBySetAndCollector(setCode, collectorNumber);
    const normalizedByCollector = exactByCollector ? normalizePreview(exactByCollector) : null;
    if (normalizedByCollector) {
      return normalizedByCollector;
    }
  }

  if (setCode) {
    const localByNameSet = await getLocalPrintCardByNameSet(trimmed, setCode);
    const normalizedLocalByNameSet = localByNameSet ? normalizeLocalPrintPreview(localByNameSet) : null;
    if (normalizedLocalByNameSet) {
      return normalizedLocalByNameSet;
    }
  }

  const localByName = await getLocalPrintCardByName(trimmed);
  const normalizedLocalByName = localByName ? normalizeLocalPrintPreview(localByName) : null;
  if (normalizedLocalByName) {
    return normalizedLocalByName;
  }

  const localDefault = getLocalDefaultCardByName(trimmed);
  const normalizedLocalDefault = localDefault ? normalizeLocalDefaultPreview(localDefault) : null;
  if (normalizedLocalDefault) {
    return normalizedLocalDefault;
  }

  const exact = await fetchNamed("exact", trimmed, options);
  const normalizedExact = exact ? normalizePreview(exact) : null;
  if (normalizedExact) {
    return normalizedExact;
  }

  const fuzzy = await fetchNamed("fuzzy", trimmed, options);
  return fuzzy ? normalizePreview(fuzzy) : null;
}
