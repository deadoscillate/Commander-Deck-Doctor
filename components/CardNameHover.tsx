"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";

const CARD_IMAGE_CACHE_STORAGE_KEY = "commanderDeckDoctor.cardImageCache.v2";
const MAX_CACHE_ENTRIES = 400;

type CardPrices = {
  usd: string | null;
  usdFoil: string | null;
  usdEtched: string | null;
  tix: string | null;
};

type HoverCardCacheEntry = {
  imageUrl: string | null;
  prices: CardPrices | null;
};

const memoryCache = new Map<string, HoverCardCacheEntry>();
const inflightRequests = new Map<string, Promise<HoverCardCacheEntry>>();
let storageLoaded = false;

function normalizeCardName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function loadStorageCache() {
  if (storageLoaded || typeof window === "undefined") {
    return;
  }

  storageLoaded = true;

  try {
    const raw = window.localStorage.getItem(CARD_IMAGE_CACHE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const candidate = value as Partial<HoverCardCacheEntry>;
      const prices =
        candidate.prices && typeof candidate.prices === "object"
          ? {
              usd: typeof candidate.prices.usd === "string" || candidate.prices.usd === null
                ? candidate.prices.usd
                : null,
              usdFoil:
                typeof candidate.prices.usdFoil === "string" || candidate.prices.usdFoil === null
                  ? candidate.prices.usdFoil
                  : null,
              usdEtched:
                typeof candidate.prices.usdEtched === "string" || candidate.prices.usdEtched === null
                  ? candidate.prices.usdEtched
                  : null,
              tix:
                typeof candidate.prices.tix === "string" || candidate.prices.tix === null
                  ? candidate.prices.tix
                  : null
            }
          : null;

      if (typeof candidate.imageUrl === "string" || candidate.imageUrl === null) {
        memoryCache.set(key, {
          imageUrl: candidate.imageUrl,
          prices
        });
      }
    }
  } catch {
    // Ignore malformed local cache payloads.
  }
}

function persistStorageCache() {
  if (typeof window === "undefined") {
    return;
  }

  const recentEntries = [...memoryCache.entries()].slice(-MAX_CACHE_ENTRIES);
  try {
    window.localStorage.setItem(
      CARD_IMAGE_CACHE_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(recentEntries))
    );
  } catch {
    // Ignore storage quota/private-mode write failures.
  }
}

async function fetchCardImage(cardName: string): Promise<HoverCardCacheEntry> {
  const endpoint = new URL("https://api.scryfall.com/cards/named");
  endpoint.searchParams.set("exact", cardName);

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      return {
        imageUrl: null,
        prices: null
      };
    }

    const payload = (await response.json()) as {
      image_uris?: { normal?: string };
      card_faces?: Array<{ image_uris?: { normal?: string } }>;
      prices?: {
        usd?: string | null;
        usd_foil?: string | null;
        usd_etched?: string | null;
        tix?: string | null;
      };
    };

    return {
      imageUrl: payload.image_uris?.normal ?? payload.card_faces?.[0]?.image_uris?.normal ?? null,
      prices: payload.prices
        ? {
            usd: payload.prices.usd ?? null,
            usdFoil: payload.prices.usd_foil ?? null,
            usdEtched: payload.prices.usd_etched ?? null,
            tix: payload.prices.tix ?? null
          }
        : null
    };
  } catch {
    return {
      imageUrl: null,
      prices: null
    };
  }
}

function getCardImageCached(cardName: string): HoverCardCacheEntry | undefined {
  loadStorageCache();
  return memoryCache.get(normalizeCardName(cardName));
}

async function getCardImage(cardName: string): Promise<HoverCardCacheEntry> {
  const normalized = normalizeCardName(cardName);
  const cached = getCardImageCached(cardName);
  if (cached !== undefined) {
    return cached;
  }

  const pending = inflightRequests.get(normalized);
  if (pending) {
    return pending;
  }

  const request = fetchCardImage(cardName).then((entry) => {
    inflightRequests.delete(normalized);

    if (!memoryCache.has(normalized) && memoryCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = memoryCache.keys().next().value as string | undefined;
      if (oldestKey) {
        memoryCache.delete(oldestKey);
      }
    }

    memoryCache.set(normalized, entry);
    persistStorageCache();
    return entry;
  });

  inflightRequests.set(normalized, request);
  return request;
}

type CardNameHoverProps = {
  name: string;
};

function formatUsd(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return `$${parsed.toFixed(2)}`;
  }

  return `$${value}`;
}

function renderPriceSummary(prices: CardPrices | null): string | null {
  if (!prices) {
    return null;
  }

  const chunks: string[] = [];
  const usd = formatUsd(prices.usd);
  const foil = formatUsd(prices.usdFoil);
  const etched = formatUsd(prices.usdEtched);
  const tix = prices.tix ? prices.tix : null;

  if (usd) chunks.push(`USD ${usd}`);
  if (foil) chunks.push(`Foil ${foil}`);
  if (etched) chunks.push(`Etched ${etched}`);
  if (tix) chunks.push(`TIX ${tix}`);

  return chunks.length > 0 ? chunks.join(" | ") : null;
}

export function CardNameHover({ name }: CardNameHoverProps) {
  const [open, setOpen] = useState(false);
  const [cardMeta, setCardMeta] = useState<HoverCardCacheEntry | undefined>(() => getCardImageCached(name));
  const requestIdRef = useRef(0);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function ensureLoaded() {
    if (cardMeta !== undefined) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const resolved = await getCardImage(name);
    if (requestIdRef.current !== requestId) {
      return;
    }

    setCardMeta(resolved);
  }

  const priceSummary = renderPriceSummary(cardMeta?.prices ?? null);
  const showPreview = Boolean(cardMeta && (cardMeta.imageUrl || priceSummary));

  return (
    <span
      className="card-hover"
      onMouseEnter={() => {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }

        hoverTimerRef.current = setTimeout(() => {
          setOpen(true);
          void ensureLoaded();
        }, 120);
      }}
      onMouseLeave={() => {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
        setOpen(false);
      }}
    >
      <span className="card-hover-text">{name}</span>
      {open && showPreview ? (
        <span className="card-hover-preview">
          {cardMeta?.imageUrl ? (
            <img src={cardMeta.imageUrl} alt={`${name} preview`} loading="lazy" />
          ) : null}
          {priceSummary ? <span className="card-hover-prices">{priceSummary}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
