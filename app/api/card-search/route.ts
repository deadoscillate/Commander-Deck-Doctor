import { apiJson, getRequestId } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { lookupCardsByNames, searchCards } from "@/lib/cardSearch";

export const runtime = "nodejs";

const CARD_SEARCH_RATE_LIMIT = {
  scope: "card-search" as const,
  limit: 60,
  windowSeconds: 60
};

function parseCsvColors(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((color) => color.trim().toUpperCase())
    .filter((color) => /^[WUBRGC]$/.test(color));
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
}

async function parseBody(request: Request): Promise<{
  names: string[];
  allowedColors: string[];
  commanderOnly: boolean;
  includePairs: boolean;
}> {
  try {
    const payload = (await request.json()) as {
      names?: unknown;
      allowedColors?: unknown;
      commanderOnly?: unknown;
      includePairs?: unknown;
    };

    const names = Array.isArray(payload.names)
      ? payload.names
          .filter((name): name is string => typeof name === "string")
          .map((name) => name.trim())
          .filter(Boolean)
      : [];
    const allowedColors = Array.isArray(payload.allowedColors)
      ? payload.allowedColors
          .filter((color): color is string => typeof color === "string")
          .map((color) => color.trim().toUpperCase())
          .filter((color) => /^[WUBRGC]$/.test(color))
      : [];

    return {
      names,
      allowedColors,
      commanderOnly: payload.commanderOnly === true,
      includePairs: payload.includePairs === true
    };
  } catch {
    return {
      names: [],
      allowedColors: [],
      commanderOnly: false,
      includePairs: false
    };
  }
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = await checkRateLimit(request, CARD_SEARCH_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Too many card searches. Please wait a moment and try again." },
      { status: 429, requestId, headers: rateLimitHeaders }
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const names = url.searchParams
    .getAll("name")
    .map((name) => name.trim())
    .filter(Boolean);
  const colors = parseCsvColors(url.searchParams.get("colors"));
  const allowedColors = parseCsvColors(url.searchParams.get("allowedColors"));
  const setCode = url.searchParams.get("set")?.trim().toUpperCase() ?? "";
  const cardType = url.searchParams.get("type")?.trim().toLowerCase() ?? "";
  const commanderOnly = url.searchParams.get("commanderOnly") === "1";
  const includePairs = url.searchParams.get("includePairs") === "1";
  const limit = parseLimit(url.searchParams.get("limit"));

  const items =
    names.length > 0
      ? lookupCardsByNames(names, {
          commanderOnly,
          allowedColors
        })
        : searchCards({
          query: q,
          commanderOnly,
          colors,
          allowedColors,
          setCode,
          cardType,
          includePairs,
          limit
        });

  return apiJson(
    {
      query: q,
      count: items.length,
      items
    },
    { requestId, headers: rateLimitHeaders }
  );
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = await checkRateLimit(request, CARD_SEARCH_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Too many card searches. Please wait a moment and try again." },
      { status: 429, requestId, headers: rateLimitHeaders }
    );
  }

  const { names, allowedColors, commanderOnly, includePairs } = await parseBody(request);
  if (names.length === 0) {
    return apiJson(
      { error: "At least one card name is required." },
      { status: 400, requestId, headers: rateLimitHeaders }
    );
  }

  const items = lookupCardsByNames(names, {
    allowedColors,
    commanderOnly,
    includePairs
  });

  return apiJson(
    {
      query: "",
      count: items.length,
      items
    },
    { requestId, headers: rateLimitHeaders }
  );
}
