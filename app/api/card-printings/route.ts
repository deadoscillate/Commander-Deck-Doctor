import { apiJson, getRequestId } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { reportApiError } from "@/lib/api/monitoring";

export const runtime = "nodejs";

type ScryfallSearchCardFace = {
  image_uris?: {
    large?: string;
    normal?: string;
    png?: string;
  };
};

type ScryfallSearchCard = {
  id?: string;
  name?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  released_at?: string;
  image_uris?: {
    large?: string;
    normal?: string;
    png?: string;
  };
  card_faces?: ScryfallSearchCardFace[];
};

type ScryfallSearchResponse = {
  object?: string;
  data?: ScryfallSearchCard[];
};

type CardPrintingOption = {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string | null;
  imageUrl: string | null;
  label: string;
};

const PRINTINGS_ENDPOINT = "https://api.scryfall.com/cards/search";
const MAX_NAME_LENGTH = 120;
const MAX_PRINTINGS = 60;
const PRINTINGS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const PRINTINGS_CACHE_CONTROL = "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400";
const CARD_PRINTINGS_RATE_LIMIT = {
  scope: "card-printings" as const,
  limit: 60,
  windowSeconds: 60
};

type CachedPrintings = {
  expiresAt: number;
  printings: CardPrintingOption[];
};

const printingsCache = new Map<string, CachedPrintings>();

function normalizeCardName(value: string | null): string {
  if (!value) {
    return "";
  }

  return value.trim();
}

function buildCacheKey(name: string): string {
  return name.toLowerCase();
}

function getCachedPrintings(name: string): CardPrintingOption[] | null {
  const now = Date.now();
  const key = buildCacheKey(name);
  const cached = printingsCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    printingsCache.delete(key);
    return null;
  }

  return cached.printings;
}

function setCachedPrintings(name: string, printings: CardPrintingOption[]): void {
  const now = Date.now();
  for (const [key, entry] of printingsCache.entries()) {
    if (entry.expiresAt <= now) {
      printingsCache.delete(key);
    }
  }

  if (printingsCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = printingsCache.keys().next().value;
    if (typeof oldestKey === "string") {
      printingsCache.delete(oldestKey);
    }
  }

  printingsCache.set(buildCacheKey(name), {
    expiresAt: now + PRINTINGS_CACHE_TTL_MS,
    printings
  });
}

function sortPrintings(a: CardPrintingOption, b: CardPrintingOption): number {
  const dateA = a.releasedAt ?? "";
  const dateB = b.releasedAt ?? "";
  if (dateA !== dateB) {
    return dateA > dateB ? -1 : 1;
  }

  if (a.setCode !== b.setCode) {
    return a.setCode.localeCompare(b.setCode);
  }

  const numA = Number(a.collectorNumber.replace(/[^0-9]/g, ""));
  const numB = Number(b.collectorNumber.replace(/[^0-9]/g, ""));
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
    return numA - numB;
  }

  return a.collectorNumber.localeCompare(b.collectorNumber);
}

/**
 * GET /api/card-printings?name=...
 * Returns available printings for a card name (for UI printing/art selection).
 */
export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = await checkRateLimit(request, CARD_PRINTINGS_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Rate limit exceeded. Please retry shortly." },
      { status: 429, requestId, headers: rateLimitHeaders }
    );
  }

  const url = new URL(request.url);
  const name = normalizeCardName(url.searchParams.get("name"));

  if (!name) {
    return apiJson({ error: "Card name is required." }, { status: 400, requestId, headers: rateLimitHeaders });
  }

  if (name.length > MAX_NAME_LENGTH) {
    return apiJson({ error: "Card name is too long." }, { status: 413, requestId, headers: rateLimitHeaders });
  }

  const cached = getCachedPrintings(name);
  if (cached) {
    return apiJson(
      {
        name,
        count: cached.length,
        printings: cached
      },
      {
        status: 200,
        requestId,
        headers: { ...rateLimitHeaders, "cache-control": PRINTINGS_CACHE_CONTROL }
      }
    );
  }

  try {
    const endpoint = new URL(PRINTINGS_ENDPOINT);
    endpoint.searchParams.set("q", `!"${name}"`);
    endpoint.searchParams.set("unique", "prints");
    endpoint.searchParams.set("order", "released");
    endpoint.searchParams.set("dir", "desc");
    endpoint.searchParams.set("include_extras", "true");

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "CommanderDeckDoctor/1.0"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return apiJson(
        { error: "Could not load printings from Scryfall right now." },
        { status: 502, requestId, headers: rateLimitHeaders }
      );
    }

    const payload = (await response.json()) as ScryfallSearchResponse;
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const printings: CardPrintingOption[] = rows
      .map((row) => {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const cardName = typeof row.name === "string" ? row.name.trim() : "";
        const setCode = typeof row.set === "string" ? row.set.trim().toLowerCase() : "";
        const setName = typeof row.set_name === "string" ? row.set_name.trim() : "";
        const collectorNumber =
          typeof row.collector_number === "string" ? row.collector_number.trim() : "";
        const releasedAt = typeof row.released_at === "string" ? row.released_at.trim() : null;
        const imageUrl =
          row.image_uris?.large ??
          row.image_uris?.normal ??
          row.image_uris?.png ??
          row.card_faces?.[0]?.image_uris?.large ??
          row.card_faces?.[0]?.image_uris?.normal ??
          row.card_faces?.[0]?.image_uris?.png ??
          null;
        if (!id || !cardName || !setCode || !setName || !collectorNumber) {
          return null;
        }

        const releaseLabel = releasedAt ? ` (${releasedAt})` : "";
        return {
          id,
          name: cardName,
          setCode,
          setName,
          collectorNumber,
          releasedAt,
          imageUrl,
          label: `${setCode.toUpperCase()} #${collectorNumber} - ${setName}${releaseLabel}`
        } satisfies CardPrintingOption;
      })
      .filter((row): row is CardPrintingOption => Boolean(row))
      .sort(sortPrintings)
      .slice(0, MAX_PRINTINGS);

    setCachedPrintings(name, printings);

    return apiJson(
      {
        name,
        count: printings.length,
        printings
      },
      {
        status: 200,
        requestId,
        headers: { ...rateLimitHeaders, "cache-control": PRINTINGS_CACHE_CONTROL }
      }
    );
  } catch (error) {
    reportApiError(error, {
      requestId,
      route: "/api/card-printings",
      status: 500
    });
    return apiJson(
      { error: "Could not load printings." },
      { status: 500, requestId, headers: rateLimitHeaders }
    );
  }
}
