import { apiJson, getRequestId } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { searchCards } from "@/lib/cardSearch";

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
  const colors = parseCsvColors(url.searchParams.get("colors"));
  const allowedColors = parseCsvColors(url.searchParams.get("allowedColors"));
  const commanderOnly = url.searchParams.get("commanderOnly") === "1";
  const limit = parseLimit(url.searchParams.get("limit"));

  const items = searchCards({
    query: q,
    commanderOnly,
    colors,
    allowedColors,
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
