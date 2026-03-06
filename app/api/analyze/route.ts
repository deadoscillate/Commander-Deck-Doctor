import { computeDeckSummary, computeRoleBreakdown, computeRoleCounts, computeTutorSummary } from "@/lib/analysis";
import { CardDatabase, createEngine } from "@/engine";
import { computeDeckArchetypes } from "@/lib/archetypes";
import {
  buildBracketExplanation,
  computeExtraTurns,
  computeGameChangersFromEntries,
  computeMassLandDenial,
  estimateBracket
} from "@/lib/brackets";
import type { AnalyzeRequest, DeckPriceMode, DeckPriceSummary, ExpectedWinTurn } from "@/lib/contracts";
import { buildDeckHealthReport } from "@/lib/deckHealth";
import { parseDecklistWithCommander } from "@/lib/decklist";
import { GAME_CHANGERS_VERSION, findGameChangerName } from "@/lib/gameChangers";
import { buildColorIdentityCheck, buildDeckChecks } from "@/lib/checks";
import { detectCombosInDeck } from "@/lib/combos";
import { computePlayerHeuristics } from "@/lib/playerHeuristics";
import { buildRoleSuggestions } from "@/lib/suggestions";
import { evaluateCommanderRules } from "@/lib/rulesEngine";
import { fetchDeckCards, getCardById, getCardByName, getCardByNameWithSet } from "@/lib/scryfall";
import type { ScryfallCard } from "@/lib/types";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { reportApiError } from "@/lib/api/monitoring";

export const runtime = "nodejs";

const ANALYZE_REQUEST_MAX_BYTES = 500_000;
const ANALYZE_DECKLIST_MAX_CHARS = 50_000;
const ANALYZE_RATE_LIMIT = {
  scope: "analyze" as const,
  limit: 45,
  windowSeconds: 60
};

let analyzerEngine: ReturnType<typeof createEngine> | null = null;

function getAnalyzerEngine() {
  if (analyzerEngine) {
    return analyzerEngine;
  }

  try {
    analyzerEngine = createEngine();
    return analyzerEngine;
  } catch {
    analyzerEngine = createEngine({
      cardDatabase: CardDatabase.createWithEngineSet()
    });
    return analyzerEngine;
  }
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

function normalizeLookupName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isLegendaryCreature(typeLine: string): boolean {
  const lower = typeLine.toLowerCase();
  return lower.includes("legendary") && lower.includes("creature");
}

function getPreferredArtUrl(card: ScryfallCard | null): string | null {
  if (!card) {
    return null;
  }

  if (card.image_uris?.art_crop) return card.image_uris.art_crop;
  if (card.image_uris?.border_crop) return card.image_uris.border_crop;
  if (card.image_uris?.large) return card.image_uris.large;
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.image_uris?.png) return card.image_uris.png;

  const firstFace = card.card_faces[0];
  if (firstFace?.image_uris?.art_crop) return firstFace.image_uris.art_crop;
  if (firstFace?.image_uris?.border_crop) return firstFace.image_uris.border_crop;
  if (firstFace?.image_uris?.large) return firstFace.image_uris.large;
  if (firstFace?.image_uris?.normal) return firstFace.image_uris.normal;
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

function stableSimulationSeed(
  parsedDeck: Array<{ name: string; qty: number; resolvedName: string | null }>,
  commanderName: string | null
): string {
  const normalized = parsedDeck
    .map((entry) => `${entry.qty}x:${(entry.resolvedName ?? entry.name).trim().toLowerCase()}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
  const input = `${normalized}|commander:${(commanderName ?? "none").trim().toLowerCase()}`;

  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `analyze-${(hash >>> 0).toString(16)}`;
}

function buildDeckPriceSummary(
  cards: Array<{ name: string; qty: number; card: ScryfallCard }>,
  options: { pricingMode: DeckPriceMode; requestedSetCodeByCardName: Map<string, string | null> }
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

  for (const entry of cards) {
    totalKnownCardQty += entry.qty;
    const requestedSet = options.requestedSetCodeByCardName.get(entry.name.toLowerCase()) ?? null;
    if (requestedSet) {
      setTaggedCardQty += entry.qty;
      const resolvedSet = typeof entry.card.set === "string" ? entry.card.set.toLowerCase() : "";
      if (resolvedSet && resolvedSet === requestedSet.toLowerCase()) {
        setMatchedCardQty += entry.qty;
      }
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
      usd: coverage(pricedCardQty.usd),
      usdFoil: coverage(pricedCardQty.usdFoil),
      usdEtched: coverage(pricedCardQty.usdEtched),
      tix: coverage(pricedCardQty.tix)
    },
    pricingMode: options.pricingMode,
    setTaggedCardQty,
    setMatchedCardQty,
    disclaimer:
      options.pricingMode === "decklist-set"
        ? "Totals are quantity-weighted Scryfall prices with set-aware lookup when [SET] tags are present. Unmatched tags fall back to named lookup."
        : "Totals are quantity-weighted Scryfall prices for resolved cards only and may change over time."
  };
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
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
    const { entries: parsedDeck, commanderFromSection } = parseDecklistWithCommander(decklist);
    if (parsedDeck.length === 0) {
      return apiJson(
        { error: "No valid deck entries found. Check formatting and try again." },
        { status: 400, requestId, headers: rateLimitHeaders }
      );
    }

    const setOverridesByCardName = parseSetOverrides(payload.setOverrides);
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

    const inputDeckSize = effectiveParsedDeck.reduce((sum, card) => sum + card.qty, 0);
    const deckPriceMode = parseDeckPriceMode(payload.deckPriceMode);
    const requestedSetCodeByCardName = new Map(
      effectiveParsedDeck.map((entry) => [entry.name.toLowerCase(), entry.setCode?.toLowerCase() ?? null])
    );

    // Fetch only the cards we can resolve; unknown names are reported separately.
    const { knownCards, unknownCards } = await fetchDeckCards(effectiveParsedDeck, 8, { deckPriceMode });
    const summary = computeDeckSummary(knownCards);
    const analyzer = getAnalyzerEngine();
    const engineCardByName = (cardName: string) => analyzer.cardDatabase.getCardByName(cardName);
    const behaviorIdByCardName = (cardName: string) => engineCardByName(cardName)?.behaviorId ?? null;
    const roles = computeRoleCounts(knownCards, { engineCardByName, behaviorIdByCardName });
    const roleBreakdown = computeRoleBreakdown(knownCards, { engineCardByName, behaviorIdByCardName });
    const tutorSummary = computeTutorSummary(knownCards, { engineCardByName, behaviorIdByCardName });

    const knownByInputName = new Map(
      knownCards.map((entry) => [entry.name.toLowerCase(), entry.card])
    );

    const parsedDeckView = effectiveParsedDeck.map((entry) => {
      const resolvedCard = knownByInputName.get(entry.name.toLowerCase()) ?? null;
      const resolvedName = resolvedCard?.name ?? null;
      const matchedGameChanger = findGameChangerName(resolvedName ?? entry.name);

      return {
        name: entry.name,
        qty: entry.qty,
        resolvedName,
        previewImageUrl: getPreferredCardPreviewUrl(resolvedCard),
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
    const checksBase = buildDeckChecks(effectiveParsedDeck, unknownCards);

    const commanderOptions = [
      ...new Map(
        knownCards
          .filter((entry) => isLegendaryCreature(entry.card.type_line))
          .map((entry) => [
            normalizeLookupName(entry.card.name),
            {
              name: entry.card.name,
              colorIdentity: entry.card.color_identity
            }
          ])
      ).values()
    ].sort((a, b) => a.name.localeCompare(b.name));

    const manualCommanderName = parseCommanderName(payload.commanderName);
    const selectedCommanderName =
      commanderFromSection ?? (!commanderFromSection && manualCommanderName ? manualCommanderName : null);
    const commanderSource = commanderFromSection
      ? "section"
      : manualCommanderName
        ? "manual"
        : "none";
    const selectedCommanderOverride = selectedCommanderName
      ? setOverridesByCardName.get(normalizeLookupName(selectedCommanderName)) ?? null
      : null;

    const knownCommander = selectedCommanderName
      ? knownCards.find(
          (entry) =>
            normalizeLookupName(entry.name) === normalizeLookupName(selectedCommanderName) ||
            normalizeLookupName(entry.card.name) === normalizeLookupName(selectedCommanderName)
        )?.card
      : null;

    const selectedCommanderCard =
      knownCommander ??
      (selectedCommanderName
        ? selectedCommanderOverride?.printingId
          ? await getCardById(selectedCommanderOverride.printingId)
          : selectedCommanderOverride?.setCode
            ? await getCardByNameWithSet(selectedCommanderName, selectedCommanderOverride.setCode)
            : await getCardByName(selectedCommanderName)
        : null);

    const colorIdentityCheck = selectedCommanderCard
      ? buildColorIdentityCheck(
          knownCards,
          selectedCommanderCard.name,
          selectedCommanderCard.color_identity
        )
      : selectedCommanderName
        ? {
            ok: false,
            enabled: false,
            commanderName: selectedCommanderName,
            commanderColorIdentity: [],
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
        name: selectedCommanderCard?.name ?? selectedCommanderName,
        colorIdentity: selectedCommanderCard?.color_identity ?? [],
        resolved: Boolean(selectedCommanderCard)
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
      pricingMode: deckPriceMode,
      requestedSetCodeByCardName
    });
    const archetypeReport = computeDeckArchetypes(knownCards, inputDeckSize);
    const comboReport = detectCombosInDeck(
      parsedDeckView.flatMap((entry) =>
        entry.resolvedName ? [entry.name, entry.resolvedName] : [entry.name]
      )
    );
    const simulationDeck = parsedDeckView.map((entry) => ({
      name: entry.resolvedName ?? entry.name,
      qty: entry.qty
    }));
    const simulationSeed = stableSimulationSeed(
      parsedDeckView,
      selectedCommanderCard?.name ?? selectedCommanderName
    );
    const simulationCommander = selectedCommanderCard?.name ?? selectedCommanderName ?? undefined;
    const openingSimulation = analyzer.simulate({
      type: "OPENING_HAND",
      deck: simulationDeck,
      runs: 1000,
      seed: simulationSeed,
      commander: simulationCommander
    });
    const goldfishSimulation = analyzer.simulate({
      type: "GOLDFISH",
      deck: simulationDeck,
      runs: 1000,
      seed: simulationSeed,
      commander: simulationCommander
    });
    const knownCardQty = knownCards.reduce((sum, entry) => sum + entry.qty, 0);
    const manaRocks = knownCards.reduce((sum, entry) => {
      const engineCard = engineCardByName(entry.card.name);
      const behaviorId = engineCard?.behaviorId ?? "";
      const typeLine = (engineCard?.typeLine ?? entry.card.type_line).toLowerCase();
      const text = (engineCard?.oracleText ?? entry.card.oracle_text).toLowerCase();
      const manaRockLike =
        !typeLine.includes("land") &&
        typeLine.includes("artifact") &&
        (behaviorId.startsWith("TAP_ADD_") ||
          /\{t\}:\s*add\s+\{[wubrgc]/.test(text) ||
          /\badd\b[\s\S]{0,50}\bmana\b/.test(text));
      return manaRockLike ? sum + entry.qty : sum;
    }, 0);
    const openingHandSimulation =
      openingSimulation.type === "OPENING_HAND" && goldfishSimulation.type === "GOLDFISH"
        ? {
            simulations: openingSimulation.runs,
            playableHands: openingSimulation.playableHands,
            deadHands: openingSimulation.deadHands,
            rampInOpening: Math.max(
              0,
              Math.round((openingSimulation.rampInOpeningPct / 100) * openingSimulation.runs)
            ),
            playablePct: openingSimulation.playableHandsPct,
            deadPct: openingSimulation.deadHandsPct,
            rampInOpeningPct: openingSimulation.rampInOpeningPct,
            averageFirstSpellTurn: goldfishSimulation.avgFirstSpellTurn,
            estimatedCommanderCastTurn: goldfishSimulation.avgCommanderCastTurn,
            cardCounts: {
              lands: roundedSummary.types.land,
              rampCards: roles.ramp,
              manaRocks: manaRocks
            },
            totalDeckSize: inputDeckSize,
            unknownCardCount: Math.max(0, inputDeckSize - knownCardQty),
            disclaimer:
              "Deterministic seeded engine simulation (opening hand + simplified goldfish). " +
              "Cards outside current behavior templates use metadata-level approximations."
          }
        : null;
    const ruleZero = computePlayerHeuristics({
      deckCards: knownCards,
      averageManaValue: roundedSummary.averageManaValue,
      drawCount: roles.draw,
      tutorCount: roles.tutors,
      comboDetectedCount: comboReport.detected.length,
      commanderCard: selectedCommanderCard
    });

    const suggestionColorIdentity =
      selectedCommanderCard?.color_identity && selectedCommanderCard.color_identity.length > 0
        ? selectedCommanderCard.color_identity
        : roundedSummary.colors;

    const improvementSuggestions = {
      colorIdentity: suggestionColorIdentity,
      items: buildRoleSuggestions({
        lowRoles: deckHealth.rows,
        deckColorIdentity: suggestionColorIdentity,
        existingCardNames: parsedDeckView.flatMap((entry) =>
          entry.resolvedName ? [entry.name, entry.resolvedName] : [entry.name]
        ),
        limit: 5
      }),
      disclaimer:
        "Suggestions are role-focused and filtered by commander color identity. Existing deck cards are excluded."
    };

    const userCedhFlag = Boolean(payload.userCedhFlag);
    const userHighPowerNoGCFlag = Boolean(payload.userHighPowerNoGCFlag);
    const estimate = estimateBracket({
      gcCount,
      userCedhFlag,
      userHighPowerNoGCFlag
    });

    const targetBracket = parseOptionalBracket(payload.targetBracket);
    const expectedWinTurn = parseExpectedWinTurn(payload.expectedWinTurn);

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
    return apiJson(
      {
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
          detectedFromSection: commanderFromSection,
          selectedName: selectedCommanderCard?.name ?? selectedCommanderName,
          selectedColorIdentity: selectedCommanderCard?.color_identity ?? [],
          selectedManaCost: getPreferredManaCost(selectedCommanderCard),
          selectedCmc:
            typeof selectedCommanderCard?.cmc === "number" && Number.isFinite(selectedCommanderCard.cmc)
              ? selectedCommanderCard.cmc
              : null,
          selectedArtUrl: getPreferredArtUrl(selectedCommanderCard),
          source: commanderSource,
          options: commanderOptions,
          needsManualSelection: !commanderFromSection && !selectedCommanderName && commanderOptions.length > 0
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
        openingHandSimulation,
        archetypeReport,
        comboReport,
        ruleZero,
        improvementSuggestions,
        warnings: [...new Set([...deckHealth.warnings, ...explanation.warnings])],
        bracketReport
      },
      { status: 200, requestId, headers: rateLimitHeaders }
    );
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
