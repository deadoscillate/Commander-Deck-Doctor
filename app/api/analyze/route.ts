import { computeDeckSummary, computeRoleCounts } from "@/lib/analysis";
import { computeDeckArchetypes } from "@/lib/archetypes";
import {
  buildBracketExplanation,
  computeExtraTurns,
  computeGameChangersFromEntries,
  computeMassLandDenial,
  estimateBracket
} from "@/lib/brackets";
import type { AnalyzeRequest, DeckPriceSummary, ExpectedWinTurn } from "@/lib/contracts";
import { buildDeckHealthReport } from "@/lib/deckHealth";
import { parseDecklistWithCommander } from "@/lib/decklist";
import { GAME_CHANGERS_VERSION, findGameChangerName } from "@/lib/gameChangers";
import { buildColorIdentityCheck, buildDeckChecks } from "@/lib/checks";
import { detectCombosInDeck } from "@/lib/combos";
import { simulateOpeningHands } from "@/lib/openingHandSimulation";
import { computePlayerHeuristics } from "@/lib/playerHeuristics";
import { buildRoleSuggestions } from "@/lib/suggestions";
import { fetchDeckCards, getCardByName } from "@/lib/scryfall";
import type { ScryfallCard } from "@/lib/types";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";

const ANALYZE_REQUEST_MAX_BYTES = 500_000;
const ANALYZE_DECKLIST_MAX_CHARS = 50_000;
const ANALYZE_RATE_LIMIT = {
  scope: "analyze" as const,
  limit: 45,
  windowSeconds: 60
};

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
  if (card.image_uris?.normal) return card.image_uris.normal;

  const firstFace = card.card_faces[0];
  if (firstFace?.image_uris?.art_crop) return firstFace.image_uris.art_crop;
  if (firstFace?.image_uris?.normal) return firstFace.image_uris.normal;

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

function buildDeckPriceSummary(cards: Array<{ qty: number; card: ScryfallCard }>): DeckPriceSummary {
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

  for (const entry of cards) {
    totalKnownCardQty += entry.qty;

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
    disclaimer: "Totals are quantity-weighted Scryfall prices for resolved cards only and may change over time."
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

    const inputDeckSize = parsedDeck.reduce((sum, card) => sum + card.qty, 0);

    // Fetch only the cards we can resolve; unknown names are reported separately.
    const { knownCards, unknownCards } = await fetchDeckCards(parsedDeck, 8);
    const summary = computeDeckSummary(knownCards);
    const roles = computeRoleCounts(knownCards);

    const knownByInputName = new Map(
      knownCards.map((entry) => [entry.name.toLowerCase(), entry.card.name])
    );

    const parsedDeckView = parsedDeck.map((entry) => {
      const resolvedName = knownByInputName.get(entry.name.toLowerCase()) ?? null;
      const matchedGameChanger = findGameChangerName(resolvedName ?? entry.name);

      return {
        name: entry.name,
        qty: entry.qty,
        resolvedName,
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
    const checksBase = buildDeckChecks(parsedDeck, unknownCards);

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

    const knownCommander = selectedCommanderName
      ? knownCards.find(
          (entry) =>
            normalizeLookupName(entry.name) === normalizeLookupName(selectedCommanderName) ||
            normalizeLookupName(entry.card.name) === normalizeLookupName(selectedCommanderName)
        )?.card
      : null;

    const selectedCommanderCard =
      knownCommander ??
      (selectedCommanderName ? await getCardByName(selectedCommanderName) : null);

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
    const deckPrice = buildDeckPriceSummary(knownCards);
    const archetypeReport = computeDeckArchetypes(knownCards, inputDeckSize);
    const comboReport = detectCombosInDeck(
      parsedDeckView.flatMap((entry) =>
        entry.resolvedName ? [entry.name, entry.resolvedName] : [entry.name]
      )
    );
    const openingHandSimulation = simulateOpeningHands({
      knownCards,
      totalDeckSize: inputDeckSize,
      commanderCmc: selectedCommanderCard?.cmc ?? null
    });
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
        "Suggestions are role-focused and heuristic. They are filtered by color identity and exclude cards already in your list."
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
        checks,
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
    console.error("Analyze route failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    return apiJson(
      { error: "Analysis failed due to a server error. Please retry." },
      { status: 500, requestId, headers: rateLimitHeaders }
    );
  }
}
