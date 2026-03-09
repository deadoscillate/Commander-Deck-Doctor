import { computeDeckSummary, computeRoleBreakdown, computeRoleCounts, computeTutorSummary } from "@/lib/analysis";
import { computeDeckArchetypes } from "@/lib/archetypes";
import {
  buildBracketExplanation,
  computeExtraTurns,
  computeGameChangersFromEntries,
  computeMassLandDenial,
  estimateBracket
} from "@/lib/brackets";
import { getAnalyzerEngine, getDetectCombosInDeck } from "@/lib/analyzeRuntime";
import type { AnalyzeRequest, DeckPriceMode, DeckPriceSummary, ExpectedWinTurn } from "@/lib/contracts";
import { buildDeckHealthReport } from "@/lib/deckHealth";
import { parseDecklistWithCommander } from "@/lib/decklist";
import { GAME_CHANGERS_VERSION, findGameChangerName } from "@/lib/gameChangers";
import { buildColorIdentityCheck, buildDeckChecks } from "@/lib/checks";
import { evaluateCommanderConfiguration } from "@/lib/commanderConfiguration";
import { computePlayerHeuristics } from "@/lib/playerHeuristics";
import { evaluateCommanderRules } from "@/lib/rulesEngine";
import {
  fetchDeckCards,
  getCardById,
  getCardByName,
  getCardByNameWithSet,
  getLocalCardByName
} from "@/lib/scryfall";
import { recordAnalyzeTelemetry } from "@/lib/analyzeTelemetryStore";
import { deriveCommanderOptions } from "@/lib/commanderOptions";
import type { DeckCard, ScryfallCard } from "@/lib/types";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { reportApiError } from "@/lib/api/monitoring";
import { consumeRuntimeColdStart } from "@/lib/runtimeWarmState";

export const runtime = "nodejs";

const ANALYZE_REQUEST_MAX_BYTES = 500_000;
const ANALYZE_DECKLIST_MAX_CHARS = 50_000;
const ANALYZE_CACHE_TTL_MS = 10 * 60 * 1000;
const ANALYZE_CACHE_MAX_ENTRIES = 120;
const ANALYZE_RATE_LIMIT = {
  scope: "analyze" as const,
  limit: 45,
  windowSeconds: 60
};
const ANALYZE_PROFILE_LOG_ENABLED = process.env.ANALYZE_PROFILE_LOG === "1";

type AnalyzeCacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const analyzeResponseCache = new Map<string, AnalyzeCacheEntry>();

type AnalyzeMetricsInput = {
  cache: "hit" | "miss";
  coldStart?: boolean;
  instanceUptimeMs?: number;
  totalMs: number;
  parseMs?: number;
  lookupMs?: number;
  computeMs?: number;
  serializeMs?: number;
  responseBytes?: number;
  deckSize?: number;
  knownCards?: number;
  unknownCards?: number;
};

function toMetricValue(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(1)).toString();
}

function buildAnalyzeMetricsHeaders(metrics: AnalyzeMetricsInput): Record<string, string> {
  const headers: Record<string, string> = {
    "x-analyze-cache": metrics.cache,
    "x-analyze-total-ms": toMetricValue(metrics.totalMs) ?? "0"
  };

  if (typeof metrics.coldStart === "boolean") {
    headers["x-analyze-cold-start"] = metrics.coldStart ? "1" : "0";
  }

  const instanceUptimeMs = toMetricValue(metrics.instanceUptimeMs);
  if (instanceUptimeMs) headers["x-analyze-instance-uptime-ms"] = instanceUptimeMs;

  const parseMs = toMetricValue(metrics.parseMs);
  if (parseMs) headers["x-analyze-parse-ms"] = parseMs;

  const lookupMs = toMetricValue(metrics.lookupMs);
  if (lookupMs) headers["x-analyze-lookup-ms"] = lookupMs;

  const computeMs = toMetricValue(metrics.computeMs);
  if (computeMs) headers["x-analyze-compute-ms"] = computeMs;

  const serializeMs = toMetricValue(metrics.serializeMs);
  if (serializeMs) headers["x-analyze-serialize-ms"] = serializeMs;

  if (typeof metrics.responseBytes === "number" && Number.isFinite(metrics.responseBytes)) {
    headers["x-analyze-response-bytes"] = String(Math.max(0, Math.floor(metrics.responseBytes)));
  }

  if (typeof metrics.deckSize === "number" && Number.isFinite(metrics.deckSize)) {
    headers["x-analyze-deck-size"] = String(Math.max(0, Math.floor(metrics.deckSize)));
  }

  if (typeof metrics.knownCards === "number" && Number.isFinite(metrics.knownCards)) {
    headers["x-analyze-known-cards"] = String(Math.max(0, Math.floor(metrics.knownCards)));
  }

  if (typeof metrics.unknownCards === "number" && Number.isFinite(metrics.unknownCards)) {
    headers["x-analyze-unknown-cards"] = String(Math.max(0, Math.floor(metrics.unknownCards)));
  }

  return headers;
}

function maybeLogAnalyzeProfile(requestId: string, metrics: AnalyzeMetricsInput): void {
  if (!ANALYZE_PROFILE_LOG_ENABLED) {
    return;
  }

  console.info("Analyze timing", {
    requestId,
    ...metrics
  });
}

/**
 * POST /api/analyze
 * Orchestrates deck parsing, card resolution, analysis, and bracket reporting.
 */
// Guards optional bracket input from the UI.
function parseOptionalBracket(value: unknown): number | null {
  if (typeof value !== "number") {
    return null;
  }

  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return null;
  }

  return value;
}

// Keeps API tolerant to malformed clients by normalizing to known values only.
function parseExpectedWinTurn(value: unknown): ExpectedWinTurn | null {
  return value === ">=10" || value === "8-9" || value === "6-7" || value === "<=5"
    ? value
    : null;
}

function parseCommanderName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDeckPriceMode(value: unknown): DeckPriceMode {
  return value === "decklist-set" ? "decklist-set" : "oracle-default";
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
  const rows = Array.from(overrides.entries())
    .map(([cardName, row]) => `${cardName}:${row.setCode}:${row.printingId ?? ""}`)
    .sort((a, b) => a.localeCompare(b));
  return rows.join("|");
}

function buildAnalyzeCacheKey(input: {
  decklist: string;
  deckPriceMode: DeckPriceMode;
  commanderName: string | null;
  targetBracket: number | null;
  expectedWinTurn: ExpectedWinTurn | null;
  userCedhFlag: boolean;
  userHighPowerNoGCFlag: boolean;
  setOverrides: Map<string, { setCode: string; printingId: string | null }>;
}): string {
  const keySource = [
    `deck:${input.decklist}`,
    `price:${input.deckPriceMode}`,
    `commander:${input.commanderName ?? ""}`,
    `target:${input.targetBracket ?? ""}`,
    `turn:${input.expectedWinTurn ?? ""}`,
    `cedh:${input.userCedhFlag ? "1" : "0"}`,
    `optimizedNoGc:${input.userHighPowerNoGCFlag ? "1" : "0"}`,
    `setOverrides:${stableSetOverrideKey(input.setOverrides)}`
  ].join("\n");

  return `analyze:${stableHashString(keySource)}`;
}

function getCachedAnalyzePayload(cacheKey: string): unknown | null {
  const now = Date.now();

  for (const [key, entry] of analyzeResponseCache.entries()) {
    if (entry.expiresAt <= now) {
      analyzeResponseCache.delete(key);
    }
  }

  const cached = analyzeResponseCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    analyzeResponseCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function setCachedAnalyzePayload(cacheKey: string, payload: unknown): void {
  if (analyzeResponseCache.size >= ANALYZE_CACHE_MAX_ENTRIES) {
    const oldestKey = analyzeResponseCache.keys().next().value;
    if (typeof oldestKey === "string") {
      analyzeResponseCache.delete(oldestKey);
    }
  }

  analyzeResponseCache.set(cacheKey, {
    expiresAt: Date.now() + ANALYZE_CACHE_TTL_MS,
    payload
  });
}

function normalizeLookupName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function extractCommanderTelemetry(
  payload: unknown
): { commanderSelected: boolean; commanderSource: "section" | "manual" | "auto" | "none" } {
  if (!payload || typeof payload !== "object") {
    return { commanderSelected: false, commanderSource: "none" };
  }

  const row = payload as {
    commander?: {
      selectedName?: string | null;
      selectedNames?: string[] | null;
      source?: "section" | "manual" | "auto" | "none";
    };
  };

  const selectedNames = Array.isArray(row.commander?.selectedNames)
    ? row.commander.selectedNames.filter(
        (name): name is string => typeof name === "string" && name.trim().length > 0
      )
    : [];
  const selectedName =
    selectedNames[0] ??
    (typeof row.commander?.selectedName === "string" && row.commander.selectedName.trim()
      ? row.commander.selectedName
      : null);
  const commanderSource =
    row.commander?.source === "section" ||
    row.commander?.source === "manual" ||
    row.commander?.source === "auto"
      ? row.commander.source
      : "none";

  return {
    commanderSelected: Boolean(selectedName),
    commanderSource
  };
}

function splitCommanderSelection(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/\s+\+\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function dedupeCommanderNames(names: string[]): string[] {
  const unique = new Map<string, string>();
  for (const name of names) {
    const normalized = normalizeLookupName(name);
    if (!normalized || unique.has(normalized)) {
      continue;
    }

    unique.set(normalized, name);
  }

  return [...unique.values()];
}

function buildCommanderDisplayName(names: string[]): string | null {
  return names.length > 0 ? names.join(" + ") : null;
}

function combineColorIdentity(cards: ScryfallCard[]): string[] {
  const order = ["W", "U", "B", "R", "G", "C"];
  return [...new Set(cards.flatMap((card) => card.color_identity ?? []))].sort((left, right) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex === -1 || rightIndex === -1) {
      return left.localeCompare(right);
    }

    return leftIndex - rightIndex;
  });
}

function getPreferredArtUrl(card: ScryfallCard | null): string | null {
  if (!card) {
    return null;
  }

  if (card.image_uris?.art_crop) return card.image_uris.art_crop;
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.image_uris?.large) return card.image_uris.large;
  if (card.image_uris?.png) return card.image_uris.png;

  const firstFace = card.card_faces[0];
  if (firstFace?.image_uris?.art_crop) return firstFace.image_uris.art_crop;
  if (firstFace?.image_uris?.normal) return firstFace.image_uris.normal;
  if (firstFace?.image_uris?.large) return firstFace.image_uris.large;
  if (firstFace?.image_uris?.png) return firstFace.image_uris.png;

  return null;
}

function getPreferredCardPreviewUrl(card: ScryfallCard | null): string | null {
  if (!card) {
    return null;
  }

  if (card.image_uris?.large) return card.image_uris.large;
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.image_uris?.png) return card.image_uris.png;
  if (card.image_uris?.border_crop) return card.image_uris.border_crop;
  if (card.image_uris?.art_crop) return card.image_uris.art_crop;

  const firstFace = card.card_faces[0];
  if (firstFace?.image_uris?.large) return firstFace.image_uris.large;
  if (firstFace?.image_uris?.normal) return firstFace.image_uris.normal;
  if (firstFace?.image_uris?.png) return firstFace.image_uris.png;
  if (firstFace?.image_uris?.border_crop) return firstFace.image_uris.border_crop;
  if (firstFace?.image_uris?.art_crop) return firstFace.image_uris.art_crop;

  return null;
}

function getPreferredManaCost(card: ScryfallCard | null): string | null {
  if (!card) {
    return null;
  }

  if (card.mana_cost) {
    return card.mana_cost;
  }

  const firstFace = card.card_faces[0];
  if (firstFace?.mana_cost) {
    return firstFace.mana_cost;
  }

  return null;
}

function parsePriceNumber(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildCardKingdomSearchUrl(cardName: string | null | undefined): string | null {
  if (typeof cardName !== "string") {
    return null;
  }

  const trimmed = cardName.trim();
  if (!trimmed) {
    return null;
  }

  return `https://www.cardkingdom.com/catalog/search?search=header&filter[name]=${encodeURIComponent(trimmed)}`;
}

function buildDeckPriceSummary(
  cards: DeckCard[],
  options: { pricingMode: DeckPriceMode }
): DeckPriceSummary {
  const totals = {
    usd: 0,
    usdFoil: 0,
    usdEtched: 0,
    tix: 0
  };
  const pricedCardQty = {
    usd: 0,
    usdFoil: 0,
    usdEtched: 0,
    tix: 0
  };
  let totalKnownCardQty = 0;
  let setTaggedCardQty = 0;
  let setMatchedCardQty = 0;
  const matchBreakdown = {
    exactPrint: 0,
    setMatch: 0,
    nameMatch: 0,
    fallback: 0
  };

  for (const entry of cards) {
    totalKnownCardQty += entry.qty;
    const requestedSet =
      typeof entry.setCode === "string" && entry.setCode.trim() ? entry.setCode.trim().toLowerCase() : null;
    if (requestedSet) {
      setTaggedCardQty += entry.qty;
      const resolvedSet = typeof entry.card.set === "string" ? entry.card.set.toLowerCase() : "";
      if (resolvedSet && resolvedSet === requestedSet.toLowerCase()) {
        setMatchedCardQty += entry.qty;
      }
    }

    switch (entry.priceMatch) {
      case "exact-print":
        matchBreakdown.exactPrint += entry.qty;
        break;
      case "set-match":
        matchBreakdown.setMatch += entry.qty;
        break;
      case "name-match":
        matchBreakdown.nameMatch += entry.qty;
        break;
      default:
        matchBreakdown.fallback += entry.qty;
        break;
    }

    const usd = parsePriceNumber(entry.card.prices?.usd);
    const usdFoil = parsePriceNumber(entry.card.prices?.usd_foil);
    const usdEtched = parsePriceNumber(entry.card.prices?.usd_etched);
    const tix = parsePriceNumber(entry.card.prices?.tix);

    if (usd !== null) {
      totals.usd += usd * entry.qty;
      pricedCardQty.usd += entry.qty;
    }
    if (usdFoil !== null) {
      totals.usdFoil += usdFoil * entry.qty;
      pricedCardQty.usdFoil += entry.qty;
    }
    if (usdEtched !== null) {
      totals.usdEtched += usdEtched * entry.qty;
      pricedCardQty.usdEtched += entry.qty;
    }
    if (tix !== null) {
      totals.tix += tix * entry.qty;
      pricedCardQty.tix += entry.qty;
    }
  }

  function finalizeTotal(value: number, pricedQty: number): number | null {
    if (pricedQty === 0) {
      return null;
    }

    return Number(value.toFixed(2));
  }

  function coverage(pricedQty: number): number {
    if (totalKnownCardQty <= 0) {
      return 0;
    }

    return Number((pricedQty / totalKnownCardQty).toFixed(4));
  }

  const usdCoverage = coverage(pricedCardQty.usd);
  const exactishShare =
    totalKnownCardQty > 0
      ? (matchBreakdown.exactPrint + matchBreakdown.setMatch) / totalKnownCardQty
      : 0;
  const resolvedShare =
    totalKnownCardQty > 0
      ? (matchBreakdown.exactPrint + matchBreakdown.setMatch + matchBreakdown.nameMatch) / totalKnownCardQty
      : 0;
  const confidence =
    usdCoverage >= 0.95 && exactishShare >= 0.75
      ? "high"
      : usdCoverage >= 0.85 && resolvedShare >= 0.8
        ? "medium"
        : "low";

  return {
    totals: {
      usd: finalizeTotal(totals.usd, pricedCardQty.usd),
      usdFoil: finalizeTotal(totals.usdFoil, pricedCardQty.usdFoil),
      usdEtched: finalizeTotal(totals.usdEtched, pricedCardQty.usdEtched),
      tix: finalizeTotal(totals.tix, pricedCardQty.tix)
    },
    pricedCardQty,
    totalKnownCardQty,
    coverage: {
      usd: usdCoverage,
      usdFoil: coverage(pricedCardQty.usdFoil),
      usdEtched: coverage(pricedCardQty.usdEtched),
      tix: coverage(pricedCardQty.tix)
    },
    pricingMode: options.pricingMode,
    setTaggedCardQty,
    setMatchedCardQty,
    matchBreakdown,
    confidence,
    disclaimer:
      options.pricingMode === "decklist-set"
        ? "Totals are quantity-weighted Scryfall prices with exact print matching when printing tags are available. Unmatched print hints fall back to looser resolution."
        : "Totals are quantity-weighted Scryfall prices for resolved cards only. Explicit print tags are honored first, then default-name pricing is used as fallback."
  };
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now();
  const requestId = getRequestId(request);
  const runtimeWarmSnapshot = consumeRuntimeColdStart();
  const rateLimit = await checkRateLimit(request, ANALYZE_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Rate limit exceeded. Please retry shortly." },
      { status: 429, requestId, headers: rateLimitHeaders }
    );
  }

  const parsedBody = await parseJsonBody<AnalyzeRequest>(request, { maxBytes: ANALYZE_REQUEST_MAX_BYTES });
  if (!parsedBody.ok) {
    return apiJson(
      { error: parsedBody.error },
      { status: parsedBody.status, requestId, headers: rateLimitHeaders }
    );
  }

  const payload = parsedBody.data;
  const decklist = typeof payload.decklist === "string" ? payload.decklist : "";
  if (!decklist.trim()) {
    return apiJson({ error: "Decklist is required." }, { status: 400, requestId, headers: rateLimitHeaders });
  }

  if (decklist.length > ANALYZE_DECKLIST_MAX_CHARS) {
    return apiJson(
      { error: "Decklist is too large. Reduce size and retry." },
      { status: 413, requestId, headers: rateLimitHeaders }
    );
  }

  try {
    const parseStartedAt = performance.now();
    const deckPriceMode = parseDeckPriceMode(payload.deckPriceMode);
    const targetBracket = parseOptionalBracket(payload.targetBracket);
    const expectedWinTurn = parseExpectedWinTurn(payload.expectedWinTurn);
    const manualCommanderName = parseCommanderName(payload.commanderName);
    const manualCommanderNames = dedupeCommanderNames(splitCommanderSelection(manualCommanderName));
    const userCedhFlag = Boolean(payload.userCedhFlag);
    const userHighPowerNoGCFlag = Boolean(payload.userHighPowerNoGCFlag);
    const {
      entries: parsedDeck,
      commanderFromSection,
      commandersFromSection,
      companionFromSection,
      companionsFromSection
    } = parseDecklistWithCommander(decklist);
    if (parsedDeck.length === 0) {
      return apiJson(
        { error: "No valid deck entries found. Check formatting and try again." },
        { status: 400, requestId, headers: rateLimitHeaders }
      );
    }

    const setOverridesByCardName = parseSetOverrides(payload.setOverrides);
    const sectionCommanderNames = dedupeCommanderNames(commandersFromSection);
    const detectedCommanderFromSection = buildCommanderDisplayName(sectionCommanderNames);
    const selectedCommanderForCache =
      detectedCommanderFromSection ?? buildCommanderDisplayName(manualCommanderNames) ?? null;
    const requestedCommanderSource = sectionCommanderNames.length > 0
      ? "section"
      : manualCommanderNames.length > 0
        ? "manual"
        : "none";
    const cacheKey = buildAnalyzeCacheKey({
      decklist,
      deckPriceMode,
      commanderName: selectedCommanderForCache,
      targetBracket,
      expectedWinTurn,
      userCedhFlag,
      userHighPowerNoGCFlag,
      setOverrides: setOverridesByCardName
    });
    const inputDeckSize = parsedDeck.reduce((sum, card) => sum + card.qty, 0);
    const cachedPayload = getCachedAnalyzePayload(cacheKey);
    if (cachedPayload) {
      const parseCompletedAt = performance.now();
      const serializeStartedAt = performance.now();
      const responseBytes = Buffer.byteLength(JSON.stringify(cachedPayload), "utf8");
      const serializeCompletedAt = performance.now();
      const metrics = {
        cache: "hit" as const,
        coldStart: runtimeWarmSnapshot.coldStart,
        instanceUptimeMs: runtimeWarmSnapshot.instanceUptimeMs,
        totalMs: performance.now() - requestStartedAt,
        parseMs: parseCompletedAt - parseStartedAt,
        serializeMs: serializeCompletedAt - serializeStartedAt,
        responseBytes,
        deckSize: inputDeckSize
      };
      const cachedCommander = extractCommanderTelemetry(cachedPayload);
      maybeLogAnalyzeProfile(requestId, metrics);
      void recordAnalyzeTelemetry({
        requestId,
        ...metrics,
        deckPriceMode,
        setOverrideCount: setOverridesByCardName.size,
        coldStart: runtimeWarmSnapshot.coldStart,
        commanderSelected: cachedCommander.commanderSelected,
        commanderSource: cachedCommander.commanderSource,
        targetBracket,
        expectedWinTurn,
        userCedhFlag,
        userHighPowerNoGCFlag
      });
      return apiJson(cachedPayload, {
        status: 200,
        requestId,
        headers: {
          ...rateLimitHeaders,
          ...buildAnalyzeMetricsHeaders(metrics)
        }
      });
    }

    const effectiveParsedDeck = parsedDeck.map((entry) => {
      const override = setOverridesByCardName.get(normalizeLookupName(entry.name));
      if (!override) {
        return entry;
      }

      if (
        entry.setCode?.toLowerCase() === override.setCode &&
        entry.printingId === override.printingId
      ) {
        return entry;
      }

      return {
        ...entry,
        setCode: override.setCode,
        printingId: override.printingId ?? undefined
      };
    });

    const parseCompletedAt = performance.now();
    // Warm expensive modules while card resolution is in-flight.
    const analyzerPromise = getAnalyzerEngine();
    const detectCombosPromise = getDetectCombosInDeck();

    // Fetch only the cards we can resolve; unknown names are reported separately.
    const lookupStartedAt = performance.now();
    const { knownCards, unknownCards } = await fetchDeckCards(effectiveParsedDeck, 8, { deckPriceMode });
    const lookupCompletedAt = performance.now();
    const computeStartedAt = performance.now();
    const summary = computeDeckSummary(knownCards);
    const analyzer = await analyzerPromise;
    const engineCardByName = (cardName: string) => analyzer.cardDatabase.getCardByName(cardName);
    const behaviorIdByCardName = (cardName: string) => engineCardByName(cardName)?.behaviorId ?? null;
    const roles = computeRoleCounts(knownCards, { engineCardByName, behaviorIdByCardName });
    const roleBreakdown = computeRoleBreakdown(knownCards, { engineCardByName, behaviorIdByCardName });
    const tutorSummary = computeTutorSummary(knownCards, { engineCardByName, behaviorIdByCardName });

    const knownByInputName = new Map(
      knownCards.map((entry) => [entry.name.toLowerCase(), entry])
    );

    const parsedDeckView = effectiveParsedDeck.map((entry) => {
      const resolvedEntry = knownByInputName.get(entry.name.toLowerCase()) ?? null;
      const resolvedCard = resolvedEntry?.card ?? null;
      const resolvedName = resolvedCard?.name ?? null;
      const matchedGameChanger = findGameChangerName(resolvedName ?? entry.name);

      return {
        name: entry.name,
        qty: entry.qty,
        resolvedName,
        previewImageUrl: getPreferredCardPreviewUrl(resolvedCard),
        priceMatch: resolvedEntry?.priceMatch,
        prices: {
          usd: parsePriceNumber(resolvedCard?.prices?.usd),
          usdFoil: parsePriceNumber(resolvedCard?.prices?.usd_foil),
          usdEtched: parsePriceNumber(resolvedCard?.prices?.usd_etched),
          tix: parsePriceNumber(resolvedCard?.prices?.tix)
        },
        sellerLinks: {
          tcgplayer: resolvedCard?.purchase_uris?.tcgplayer ?? null,
          cardKingdom:
            resolvedCard?.purchase_uris?.cardkingdom ??
            buildCardKingdomSearchUrl(resolvedCard?.name ?? resolvedName ?? entry.name)
        },
        known: Boolean(resolvedName),
        isGameChanger: Boolean(matchedGameChanger),
        gameChangerName: matchedGameChanger
      };
    });

    const { gcCount, found: gameChangersFound } = computeGameChangersFromEntries(
      parsedDeckView.map((entry) => ({
        name: entry.name,
        qty: entry.qty,
        aliases: entry.resolvedName ? [entry.resolvedName] : undefined
      }))
    );
    const { count: extraTurnsCount, cards: extraTurnCards } = computeExtraTurns(knownCards);
    const { count: massLandDenialCount, cards: massLandDenialCards } = computeMassLandDenial(knownCards);
    const checksBase = buildDeckChecks(effectiveParsedDeck, unknownCards, knownCards);

    const commanderSelection = deriveCommanderOptions(knownCards, effectiveParsedDeck, inputDeckSize);
    const commanderOptions = commanderSelection.options;
    const autoCommanderCard =
      requestedCommanderSource !== "none" ? null : commanderSelection.suggestedCommanderCard;

    const selectedCommanderNames = sectionCommanderNames.length > 0
      ? sectionCommanderNames
      : manualCommanderNames.length > 0
        ? manualCommanderNames
        : autoCommanderCard
          ? [autoCommanderCard.name]
          : [];
    const selectedCommanderName = buildCommanderDisplayName(selectedCommanderNames);
    const resolvedCommanderSource = sectionCommanderNames.length > 0
      ? "section"
      : manualCommanderNames.length > 0
        ? "manual"
        : autoCommanderCard
          ? "auto"
          : "none";
    const selectedCommanderOverridesByName = new Map(
      selectedCommanderNames.map((name) => [
        name,
        setOverridesByCardName.get(normalizeLookupName(name)) ?? null
      ])
    );
    const knownCommanderCardsByName = new Map(
      selectedCommanderNames.map((name) => [
        name,
        knownCards.find(
          (entry) =>
            normalizeLookupName(entry.name) === normalizeLookupName(name) ||
            normalizeLookupName(entry.card.name) === normalizeLookupName(name)
        )?.card ?? null
      ])
    );
    const selectedCommanderCards = (
      await Promise.all(
        selectedCommanderNames.map(async (name) => {
          const normalizedName = normalizeLookupName(name);
          if (
            autoCommanderCard &&
            normalizeLookupName(autoCommanderCard.name) === normalizedName
          ) {
            return autoCommanderCard;
          }

          const selectedCommanderOverride =
            selectedCommanderOverridesByName.get(name) ?? null;
          const knownCommander = knownCommanderCardsByName.get(name) ?? null;

          if (selectedCommanderOverride?.printingId) {
            return (
              (await getLocalCardByName(name, {
                printingId: selectedCommanderOverride.printingId,
                setCode: selectedCommanderOverride.setCode ?? null
              })) ??
              (await getCardById(selectedCommanderOverride.printingId)) ??
              knownCommander ??
              (await getCardByName(name))
            );
          }

          if (selectedCommanderOverride?.setCode) {
            return (
              (await getLocalCardByName(name, {
                setCode: selectedCommanderOverride.setCode
              })) ??
              (await getCardByNameWithSet(name, selectedCommanderOverride.setCode)) ??
              knownCommander ??
              (await getCardByName(name))
            );
          }

          return (
            knownCommander ??
            (await getLocalCardByName(name)) ??
            (await getCardByName(name))
          );
        })
      )
    ).filter((card): card is ScryfallCard => Boolean(card));
    const allSelectedCommandersResolved =
      selectedCommanderCards.length === selectedCommanderNames.length;
    const selectedCommanderCard = selectedCommanderCards[0] ?? null;
    const selectedCommanderOverride = selectedCommanderCard
      ? selectedCommanderOverridesByName.get(selectedCommanderCard.name) ??
        selectedCommanderOverridesByName.get(selectedCommanderNames[0] ?? "") ??
        null
      : selectedCommanderOverridesByName.get(selectedCommanderNames[0] ?? "") ?? null;
    const commanderColorIdentity = combineColorIdentity(selectedCommanderCards);
    const commanderConfiguration = evaluateCommanderConfiguration(
      selectedCommanderNames,
      selectedCommanderCards,
      allSelectedCommandersResolved
    );
    const selectedCompanionEntry = companionsFromSection[0] ?? null;
    const selectedCompanionCard =
      selectedCompanionEntry
        ? (selectedCompanionEntry.printingId
            ? (await getLocalCardByName(selectedCompanionEntry.name, {
                printingId: selectedCompanionEntry.printingId,
                setCode: selectedCompanionEntry.setCode ?? null
              })) ??
              (await getCardById(selectedCompanionEntry.printingId)) ??
              (await getCardByName(selectedCompanionEntry.name))
            : selectedCompanionEntry.setCode
              ? (await getLocalCardByName(selectedCompanionEntry.name, {
                  setCode: selectedCompanionEntry.setCode,
                  collectorNumber: selectedCompanionEntry.collectorNumber ?? null
                })) ??
                (await getCardByNameWithSet(selectedCompanionEntry.name, selectedCompanionEntry.setCode)) ??
                (await getCardByName(selectedCompanionEntry.name))
              : (await getLocalCardByName(selectedCompanionEntry.name)) ??
                (await getCardByName(selectedCompanionEntry.name)))
        : null;
    const selectedCompanionResolved = Boolean(selectedCompanionEntry ? selectedCompanionCard : null);

    const colorIdentityCheck = selectedCommanderNames.length > 0 && allSelectedCommandersResolved
      ? buildColorIdentityCheck(
          knownCards,
          selectedCommanderName,
          commanderColorIdentity
        )
      : selectedCommanderName
        ? {
            ok: false,
            enabled: false,
            commanderName: selectedCommanderName,
            commanderColorIdentity: commanderColorIdentity,
            offColorCount: 0,
            offColorCards: [],
            message: `Could not resolve commander card data for "${selectedCommanderName}".`
          }
        : checksBase.colorIdentity;

    const checks = {
      ...checksBase,
      colorIdentity: colorIdentityCheck
    };
    const rulesEngine = evaluateCommanderRules({
      parsedDeck: effectiveParsedDeck,
      knownCards,
      unknownCards,
      commander: {
        name: selectedCommanderName,
        names: selectedCommanderNames,
        colorIdentity: commanderColorIdentity,
        resolved: allSelectedCommandersResolved,
        card: selectedCommanderCard,
        cards: selectedCommanderCards
      },
      companion: {
        name: companionFromSection,
        entries: companionsFromSection,
        resolved: selectedCompanionResolved,
        card: selectedCompanionCard
      }
    });
    const roundedSummary = {
      ...summary,
      deckSize: inputDeckSize,
      uniqueCards: parsedDeck.length,
      averageManaValue: Number(summary.averageManaValue.toFixed(2))
    };
    const deckHealth = buildDeckHealthReport({
      counts: {
        lands: roundedSummary.types.land,
        ramp: roles.ramp,
        draw: roles.draw,
        removal: roles.removal,
        wipes: roles.wipes,
        protection: roles.protection,
        finishers: roles.finishers
      },
      deckSize: inputDeckSize,
      unknownCardsCount: unknownCards.length
    });
    const deckPrice = buildDeckPriceSummary(knownCards, {
      pricingMode: deckPriceMode
    });
    const archetypeReport = computeDeckArchetypes(knownCards, inputDeckSize);
    const comboMetadataLookup = (cardName: string) => {
      const card = engineCardByName(cardName);
      if (!card) {
        return null;
      }

      return {
        legalities: card.legalities,
        colorIdentity: card.colorIdentity
      };
    };
    const detectCombosInDeck = await detectCombosPromise;
    const comboReport = detectCombosInDeck(
      parsedDeckView.flatMap((entry) =>
        entry.resolvedName ? [entry.name, entry.resolvedName] : [entry.name]
      ),
      {
        commanderColorIdentity: commanderColorIdentity,
        maxPotentialResults: 15,
        cardMetadataLookup: comboMetadataLookup
      }
    );
    const ruleZero = computePlayerHeuristics({
      deckCards: knownCards,
      averageManaValue: roundedSummary.averageManaValue,
      landCount: roundedSummary.types.land,
      rampCount: roles.ramp,
      drawCount: roles.draw,
      tutorCount: roles.tutors,
      comboDetectedCount: comboReport.detected.length,
      commanderCard: selectedCommanderCard,
      openingHand: null,
      goldfish: null
    });

    const suggestionColorIdentity =
      commanderColorIdentity.length > 0
        ? commanderColorIdentity
        : roundedSummary.colors;

    const improvementSuggestions = {
      colorIdentity: suggestionColorIdentity,
      items: [],
      disclaimer:
        "Suggestions load after the initial report so the first analysis returns faster."
    };

    const estimate = estimateBracket({
      gcCount,
      userCedhFlag,
      userHighPowerNoGCFlag
    });

    const explanation = buildBracketExplanation({
      estimate,
      gcCount,
      extraTurnsCount,
      massLandDenialCount,
      userTargetBracket: targetBracket,
      expectedWinTurn
    });

    const bracketReport = {
      estimatedBracket: estimate.value,
      estimatedLabel: estimate.label,
      gameChangersVersion: GAME_CHANGERS_VERSION,
      gameChangersCount: gcCount,
      bracket3AllowanceText: estimate.value === 3 ? `${gcCount} / 3 allowed in Bracket 3` : null,
      gameChangersFound,
      extraTurnsCount,
      extraTurnCards,
      massLandDenialCount,
      massLandDenialCards,
      notes: explanation.notes,
      warnings: explanation.warnings,
      explanation: explanation.explanation,
      disclaimer: explanation.disclaimer
    };

    // Preserve parsed deck size/unique count even when some cards are unresolved.
    const responsePayload = {
      schemaVersion: "1.0",
      input: {
        deckPriceMode,
        targetBracket,
        expectedWinTurn,
        commanderName: selectedCommanderName,
        userCedhFlag,
        userHighPowerNoGCFlag
      },
      commander: {
        detectedFromSection: detectedCommanderFromSection ?? commanderFromSection,
        selectedName: selectedCommanderName,
        selectedNames: selectedCommanderNames,
        selectedColorIdentity: commanderColorIdentity,
        selectedManaCost:
          selectedCommanderCards.length === 1 ? getPreferredManaCost(selectedCommanderCard) : null,
        selectedCmc:
          selectedCommanderCards.length === 1 &&
          typeof selectedCommanderCard?.cmc === "number" &&
          Number.isFinite(selectedCommanderCard.cmc)
            ? selectedCommanderCard.cmc
            : null,
        selectedArtUrl: getPreferredArtUrl(selectedCommanderCard),
        selectedCardImageUrl: getPreferredCardPreviewUrl(selectedCommanderCard),
        selectedSetCode:
          typeof selectedCommanderCard?.set === "string" && selectedCommanderCard.set
            ? selectedCommanderCard.set
            : selectedCommanderOverride?.setCode ?? null,
        selectedCollectorNumber:
          typeof selectedCommanderCard?.collector_number === "string" &&
          selectedCommanderCard.collector_number
            ? selectedCommanderCard.collector_number
            : null,
        selectedPrintingId:
          typeof selectedCommanderCard?.id === "string" && selectedCommanderCard.id
            ? selectedCommanderCard.id
            : selectedCommanderOverride?.printingId ?? null,
        pairType: commanderConfiguration.ok ? commanderConfiguration.pairType : null,
        source: resolvedCommanderSource,
        options: commanderOptions,
        needsManualSelection:
          !detectedCommanderFromSection && !selectedCommanderName && commanderOptions.length > 0
      },
      companion: {
        detectedFromSection: companionFromSection,
        selectedName: selectedCompanionEntry?.name ?? null,
        selectedManaCost:
          typeof selectedCompanionCard?.mana_cost === "string" && selectedCompanionCard.mana_cost
            ? selectedCompanionCard.mana_cost
            : null,
        selectedCmc:
          typeof selectedCompanionCard?.cmc === "number" && Number.isFinite(selectedCompanionCard.cmc)
            ? selectedCompanionCard.cmc
            : null,
        selectedCardImageUrl: getPreferredCardPreviewUrl(selectedCompanionCard),
        selectedSetCode:
          typeof selectedCompanionCard?.set === "string" && selectedCompanionCard.set
            ? selectedCompanionCard.set
            : selectedCompanionEntry?.setCode ?? null,
        selectedCollectorNumber:
          typeof selectedCompanionCard?.collector_number === "string" && selectedCompanionCard.collector_number
            ? selectedCompanionCard.collector_number
            : selectedCompanionEntry?.collectorNumber ?? null,
        selectedPrintingId:
          typeof selectedCompanionCard?.id === "string" && selectedCompanionCard.id
            ? selectedCompanionCard.id
            : selectedCompanionEntry?.printingId ?? null,
        resolved: selectedCompanionResolved,
        source: selectedCompanionEntry ? "section" : "none"
      },
      parsedDeck: parsedDeckView,
      unknownCards,
      summary: roundedSummary,
      metrics: roundedSummary,
      roles,
      roleBreakdown,
      tutorSummary,
      checks,
      rulesEngine,
      deckHealth,
      deckPrice,
      archetypeReport,
      comboReport,
      ruleZero,
      improvementSuggestions,
      warnings: [...new Set([...deckHealth.warnings, ...explanation.warnings])],
      bracketReport
    };
    const computeCompletedAt = performance.now();
    setCachedAnalyzePayload(cacheKey, responsePayload);

    const serializeStartedAt = performance.now();
    const responseBytes = Buffer.byteLength(JSON.stringify(responsePayload), "utf8");
    const serializeCompletedAt = performance.now();
    const metrics = {
      cache: "miss" as const,
      coldStart: runtimeWarmSnapshot.coldStart,
      instanceUptimeMs: runtimeWarmSnapshot.instanceUptimeMs,
      totalMs: performance.now() - requestStartedAt,
      parseMs: parseCompletedAt - parseStartedAt,
      lookupMs: lookupCompletedAt - lookupStartedAt,
      computeMs: computeCompletedAt - computeStartedAt,
      serializeMs: serializeCompletedAt - serializeStartedAt,
      responseBytes,
      deckSize: inputDeckSize,
      knownCards: knownCards.length,
      unknownCards: unknownCards.length
    };
    maybeLogAnalyzeProfile(requestId, metrics);
    void recordAnalyzeTelemetry({
      requestId,
      ...metrics,
      deckPriceMode,
      setOverrideCount: setOverridesByCardName.size,
      coldStart: runtimeWarmSnapshot.coldStart,
      commanderSelected: selectedCommanderNames.length > 0,
      commanderSource: resolvedCommanderSource,
      targetBracket,
      expectedWinTurn,
      userCedhFlag,
      userHighPowerNoGCFlag
    });

    return apiJson(responsePayload, {
      status: 200,
      requestId,
      headers: {
        ...rateLimitHeaders,
        ...buildAnalyzeMetricsHeaders(metrics)
      }
    });
  } catch (error) {
    reportApiError(error, {
      requestId,
      route: "/api/analyze",
      status: 500
    });
    return apiJson(
      { error: "Analysis failed due to a server error. Please retry." },
      { status: 500, requestId, headers: rateLimitHeaders }
    );
  }
}
