import { apiJson, getRequestId } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { recordCardSearchTelemetry } from "@/lib/cardSearchTelemetryStore";
import { listSearchSetOptions, lookupCardsByNames, searchCards } from "@/lib/cardSearch";
import { consumeRuntimeColdStart } from "@/lib/runtimeWarmState";

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

function buildCardSearchHeaders(metrics: {
  routeKind: string;
  coldStart: boolean;
  totalMs: number;
  lookupMs?: number;
  serializeMs?: number;
  resultsCount: number;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "x-card-search-kind": metrics.routeKind,
    "x-card-search-cold-start": metrics.coldStart ? "1" : "0",
    "x-card-search-total-ms": metrics.totalMs.toFixed(1),
    "x-card-search-results": String(Math.max(0, Math.floor(metrics.resultsCount)))
  };

  if (typeof metrics.lookupMs === "number") {
    headers["x-card-search-lookup-ms"] = metrics.lookupMs.toFixed(1);
  }

  if (typeof metrics.serializeMs === "number") {
    headers["x-card-search-serialize-ms"] = metrics.serializeMs.toFixed(1);
  }

  return headers;
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
  const requestStartedAt = performance.now();
  const requestId = getRequestId(request);
  const runtimeWarmSnapshot = consumeRuntimeColdStart();
  const rateLimit = await checkRateLimit(request, CARD_SEARCH_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Too many card searches. Please wait a moment and try again." },
      { status: 429, requestId, headers: rateLimitHeaders }
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("meta") === "sets") {
    const body = {
      items: listSearchSetOptions()
    };
    const serializeStartedAt = performance.now();
    JSON.stringify(body);
    const totalMs = performance.now() - requestStartedAt;
    const serializeMs = performance.now() - serializeStartedAt;
    return apiJson(body, {
      requestId,
      headers: {
        ...rateLimitHeaders,
        ...buildCardSearchHeaders({
          routeKind: "meta-sets",
          coldStart: runtimeWarmSnapshot.coldStart,
          totalMs,
          serializeMs,
          resultsCount: body.items.length
        })
      }
    });
  }

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
  const lookupStartedAt = performance.now();

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
  const lookupMs = performance.now() - lookupStartedAt;
  const body = {
    query: q,
    count: items.length,
    items
  };
  const serializeStartedAt = performance.now();
  const responseBytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  const serializeMs = performance.now() - serializeStartedAt;
  const totalMs = performance.now() - requestStartedAt;
  const routeKind =
    names.length > 0
      ? commanderOnly
        ? "commander-lookup"
        : "card-lookup"
      : commanderOnly
        ? "commander-search"
        : "card-search";

  void recordCardSearchTelemetry({
    requestId,
    routeKind,
    coldStart: runtimeWarmSnapshot.coldStart,
    totalMs,
    lookupMs,
    serializeMs,
    responseBytes,
    queryLength: q.length || undefined,
    namesCount: names.length || undefined,
    colorsCount: colors.length,
    allowedColorsCount: allowedColors.length,
    resultsCount: items.length,
    commanderOnly,
    includePairs,
    setFilter: Boolean(setCode),
    typeFilter: Boolean(cardType)
  });

  return apiJson(body, {
    requestId,
    headers: {
      ...rateLimitHeaders,
      ...buildCardSearchHeaders({
        routeKind,
        coldStart: runtimeWarmSnapshot.coldStart,
        totalMs,
        lookupMs,
        serializeMs,
        resultsCount: items.length
      })
    }
  });
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now();
  const requestId = getRequestId(request);
  const runtimeWarmSnapshot = consumeRuntimeColdStart();
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

  const lookupStartedAt = performance.now();
  const items = lookupCardsByNames(names, {
    allowedColors,
    commanderOnly,
    includePairs
  });
  const lookupMs = performance.now() - lookupStartedAt;
  const body = {
    query: "",
    count: items.length,
    items
  };
  const serializeStartedAt = performance.now();
  const responseBytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  const serializeMs = performance.now() - serializeStartedAt;
  const totalMs = performance.now() - requestStartedAt;
  const routeKind = commanderOnly ? "commander-lookup" : "card-lookup";

  void recordCardSearchTelemetry({
    requestId,
    routeKind,
    coldStart: runtimeWarmSnapshot.coldStart,
    totalMs,
    lookupMs,
    serializeMs,
    responseBytes,
    namesCount: names.length,
    colorsCount: 0,
    allowedColorsCount: allowedColors.length,
    resultsCount: items.length,
    commanderOnly,
    includePairs,
    setFilter: false,
    typeFilter: false
  });

  return apiJson(body, {
    requestId,
    headers: {
      ...rateLimitHeaders,
      ...buildCardSearchHeaders({
        routeKind,
        coldStart: runtimeWarmSnapshot.coldStart,
        totalMs,
        lookupMs,
        serializeMs,
        resultsCount: items.length
      })
    }
  });
}
