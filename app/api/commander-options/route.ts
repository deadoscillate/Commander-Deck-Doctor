import { deriveCommanderOptions } from "@/lib/commanderOptions";
import { recordCommanderOptionsTelemetry } from "@/lib/commanderOptionsTelemetryStore";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import type { CommanderChoice, DeckPriceMode } from "@/lib/contracts";
import { parseDecklistWithCommander } from "@/lib/decklist";
import { fetchDeckCards } from "@/lib/scryfall";
import { consumeRuntimeColdStart } from "@/lib/runtimeWarmState";

export const runtime = "nodejs";

const COMMANDER_OPTIONS_REQUEST_MAX_BYTES = 300_000;
const COMMANDER_OPTIONS_RATE_LIMIT = {
  scope: "commander-options" as const,
  limit: 30,
  windowSeconds: 60
};

type CommanderOptionsRequest = {
  decklist?: string;
  deckPriceMode?: DeckPriceMode | null;
  setOverrides?: Record<
    string,
    string | { setCode?: string | null; printingId?: string | null } | null
  > | null;
};

type CommanderOptionsResponse = {
  commanderFromSection: string | null;
  options: CommanderChoice[];
  suggestedCommanderName: string | null;
};

type CommanderOptionsCacheEntry = {
  expiresAt: number;
  payload: CommanderOptionsResponse;
};

const COMMANDER_OPTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const commanderOptionsCache = new Map<string, CommanderOptionsCacheEntry>();

function parseDeckPriceMode(value: unknown): DeckPriceMode {
  return value === "decklist-set" ? "decklist-set" : "oracle-default";
}

function normalizeLookupName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function stableHashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function parseSetOverrides(
  value: unknown
): Map<string, { setCode: string; printingId: string | null }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }

  const record = value as Record<string, unknown>;
  const overrides = new Map<string, { setCode: string; printingId: string | null }>();
  for (const [rawCardName, rawOverride] of Object.entries(record)) {
    let normalizedSetCode = "";
    let normalizedPrintingId: string | null = null;

    if (typeof rawOverride === "string") {
      normalizedSetCode = rawOverride.trim().toLowerCase();
    } else if (rawOverride && typeof rawOverride === "object" && !Array.isArray(rawOverride)) {
      const row = rawOverride as Record<string, unknown>;
      normalizedSetCode =
        typeof row.setCode === "string" ? row.setCode.trim().toLowerCase() : "";
      normalizedPrintingId =
        typeof row.printingId === "string" && row.printingId.trim()
          ? row.printingId.trim()
          : null;
    } else {
      continue;
    }

    const normalizedCardName = normalizeLookupName(rawCardName);
    if (!normalizedCardName || !/^[a-z0-9]{2,10}$/.test(normalizedSetCode)) {
      continue;
    }

    overrides.set(normalizedCardName, {
      setCode: normalizedSetCode,
      printingId: normalizedPrintingId
    });
  }

  return overrides;
}

function stableSetOverrideKey(
  overrides: Map<string, { setCode: string; printingId: string | null }>
): string {
  return [...overrides.entries()]
    .map(([cardName, row]) => `${cardName}:${row.setCode}:${row.printingId ?? ""}`)
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function buildCommanderOptionsCacheKey(input: {
  decklist: string;
  deckPriceMode: DeckPriceMode;
  setOverrides: Map<string, { setCode: string; printingId: string | null }>;
}): string {
  return `commander-options:${stableHashString(
    [`deck:${input.decklist}`, `price:${input.deckPriceMode}`, `setOverrides:${stableSetOverrideKey(input.setOverrides)}`].join(
      "\n"
    )
  )}`;
}

function getCachedCommanderOptions(cacheKey: string): CommanderOptionsResponse | null {
  const now = Date.now();
  for (const [key, entry] of commanderOptionsCache.entries()) {
    if (entry.expiresAt <= now) {
      commanderOptionsCache.delete(key);
    }
  }

  const cached = commanderOptionsCache.get(cacheKey);
  if (!cached || cached.expiresAt <= now) {
    commanderOptionsCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function setCachedCommanderOptions(cacheKey: string, payload: CommanderOptionsResponse): void {
  commanderOptionsCache.set(cacheKey, {
    expiresAt: Date.now() + COMMANDER_OPTIONS_CACHE_TTL_MS,
    payload
  });
}

function buildCommanderOptionsHeaders(metrics: {
  cache: "hit" | "miss";
  coldStart: boolean;
  totalMs: number;
  parseMs?: number;
  lookupMs?: number;
  serializeMs?: number;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "x-commander-options-cache": metrics.cache,
    "x-commander-options-cold-start": metrics.coldStart ? "1" : "0",
    "x-commander-options-total-ms": metrics.totalMs.toFixed(1)
  };

  if (typeof metrics.parseMs === "number") {
    headers["x-commander-options-parse-ms"] = metrics.parseMs.toFixed(1);
  }

  if (typeof metrics.lookupMs === "number") {
    headers["x-commander-options-lookup-ms"] = metrics.lookupMs.toFixed(1);
  }

  if (typeof metrics.serializeMs === "number") {
    headers["x-commander-options-serialize-ms"] = metrics.serializeMs.toFixed(1);
  }

  return headers;
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now();
  const requestId = getRequestId(request);
  const runtimeWarmSnapshot = consumeRuntimeColdStart();
  const rateLimit = await checkRateLimit(request, COMMANDER_OPTIONS_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Too many commander-option lookups. Please wait a moment and try again." },
      {
        status: 429,
        requestId,
        headers: rateLimitHeaders
      }
    );
  }

  const parseStartedAt = performance.now();
  const parsedBody = await parseJsonBody<CommanderOptionsRequest>(request, {
    maxBytes: COMMANDER_OPTIONS_REQUEST_MAX_BYTES
  });
  if (!parsedBody.ok) {
    return apiJson({ error: parsedBody.error }, { status: parsedBody.status, requestId, headers: rateLimitHeaders });
  }

  const decklist = typeof parsedBody.data.decklist === "string" ? parsedBody.data.decklist.trim() : "";
  if (!decklist) {
    return apiJson(
      {
        commanderFromSection: null,
        options: [],
        suggestedCommanderName: null
      },
      { requestId, headers: rateLimitHeaders }
    );
  }

  const deckPriceMode = parseDeckPriceMode(parsedBody.data.deckPriceMode);
  const setOverridesByCardName = parseSetOverrides(parsedBody.data.setOverrides);
  const { entries, commanderFromSection } = parseDecklistWithCommander(decklist);
  const deckSize = entries.reduce((sum, entry) => sum + entry.qty, 0);
  const parseCompletedAt = performance.now();
  if (entries.length === 0 || commanderFromSection) {
    const payload = {
      commanderFromSection,
      options: [],
      suggestedCommanderName: commanderFromSection
    } satisfies CommanderOptionsResponse;
    const serializeStartedAt = performance.now();
    const responseBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    const serializeCompletedAt = performance.now();
    const metrics = {
      cache: "miss" as const,
      coldStart: runtimeWarmSnapshot.coldStart,
      totalMs: performance.now() - requestStartedAt,
      parseMs: parseCompletedAt - parseStartedAt,
      serializeMs: serializeCompletedAt - serializeStartedAt
    };
    void recordCommanderOptionsTelemetry({
      requestId,
      ...metrics,
      responseBytes,
      deckSize,
      knownCards: 0,
      unknownCards: 0,
      deckPriceMode,
      setOverrideCount: setOverridesByCardName.size,
      commanderFromSection: Boolean(commanderFromSection),
      optionsCount: 0,
      suggestedCommander: Boolean(commanderFromSection)
    });
    return apiJson(payload, {
      requestId,
      headers: {
        ...rateLimitHeaders,
        ...buildCommanderOptionsHeaders(metrics)
      }
    });
  }

  const effectiveParsedDeck = entries.map((entry) => {
    const override = setOverridesByCardName.get(normalizeLookupName(entry.name));
    if (!override) {
      return entry;
    }

    return {
      ...entry,
      setCode: override.setCode,
      printingId: override.printingId ?? undefined
    };
  });

  const cacheKey = buildCommanderOptionsCacheKey({
    decklist,
    deckPriceMode,
    setOverrides: setOverridesByCardName
  });
  const cached = getCachedCommanderOptions(cacheKey);
  if (cached) {
    const serializeStartedAt = performance.now();
    const responseBytes = Buffer.byteLength(JSON.stringify(cached), "utf8");
    const serializeCompletedAt = performance.now();
    const metrics = {
      cache: "hit" as const,
      coldStart: runtimeWarmSnapshot.coldStart,
      totalMs: performance.now() - requestStartedAt,
      parseMs: parseCompletedAt - parseStartedAt,
      serializeMs: serializeCompletedAt - serializeStartedAt
    };
    void recordCommanderOptionsTelemetry({
      requestId,
      ...metrics,
      responseBytes,
      deckSize,
      knownCards: undefined,
      unknownCards: undefined,
      deckPriceMode,
      setOverrideCount: setOverridesByCardName.size,
      commanderFromSection: false,
      optionsCount: cached.options.length,
      suggestedCommander: Boolean(cached.suggestedCommanderName)
    });
    return apiJson(cached, {
      requestId,
      headers: {
        ...rateLimitHeaders,
        ...buildCommanderOptionsHeaders(metrics)
      }
    });
  }

  const lookupStartedAt = performance.now();
  const { knownCards, unknownCards } = await fetchDeckCards(effectiveParsedDeck, 8, {
    deckPriceMode,
    localOnly: true
  });
  const lookupCompletedAt = performance.now();
  const commanderSelection = deriveCommanderOptions(
    knownCards,
    effectiveParsedDeck,
    deckSize
  );

  const payload = {
    commanderFromSection: null,
    options: commanderSelection.options,
    suggestedCommanderName: commanderSelection.suggestedCommanderCard?.name ?? null
  } satisfies CommanderOptionsResponse;
  setCachedCommanderOptions(cacheKey, payload);

  const serializeStartedAt = performance.now();
  const responseBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  const serializeCompletedAt = performance.now();
  const metrics = {
    cache: "miss" as const,
    coldStart: runtimeWarmSnapshot.coldStart,
    totalMs: performance.now() - requestStartedAt,
    parseMs: parseCompletedAt - parseStartedAt,
    lookupMs: lookupCompletedAt - lookupStartedAt,
    serializeMs: serializeCompletedAt - serializeStartedAt
  };
  void recordCommanderOptionsTelemetry({
    requestId,
    ...metrics,
    responseBytes,
    deckSize,
    knownCards: knownCards.length,
    unknownCards: unknownCards.length,
    deckPriceMode,
    setOverrideCount: setOverridesByCardName.size,
    commanderFromSection: false,
    optionsCount: payload.options.length,
    suggestedCommander: Boolean(payload.suggestedCommanderName)
  });

  return apiJson(payload, {
    requestId,
    headers: {
      ...rateLimitHeaders,
      ...buildCommanderOptionsHeaders(metrics)
    }
  });
}
