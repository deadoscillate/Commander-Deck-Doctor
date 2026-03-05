import { NextResponse } from "next/server";
import { computeDeckSummary, computeRoleCounts } from "@/lib/analysis";
import { computeDeckArchetypes } from "@/lib/archetypes";
import {
  buildBracketExplanation,
  computeExtraTurns,
  computeGameChangersFromEntries,
  computeMassLandDenial,
  estimateBracket
} from "@/lib/brackets";
import type { AnalyzeRequest, ExpectedWinTurn } from "@/lib/contracts";
import { buildDeckHealthReport } from "@/lib/deckHealth";
import { parseDecklistWithCommander } from "@/lib/decklist";
import { GAME_CHANGERS_VERSION, findGameChangerName } from "@/lib/gameChangers";
import { buildColorIdentityCheck, buildDeckChecks } from "@/lib/checks";
import { buildRoleSuggestions } from "@/lib/suggestions";
import { fetchDeckCards, getCardByName } from "@/lib/scryfall";

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

export async function POST(request: Request) {
  let payload: AnalyzeRequest;

  try {
    payload = (await request.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const decklist = typeof payload.decklist === "string" ? payload.decklist : "";
  if (!decklist.trim()) {
    return NextResponse.json({ error: "Decklist is required." }, { status: 400 });
  }

  const { entries: parsedDeck, commanderFromSection } = parseDecklistWithCommander(decklist);
  if (parsedDeck.length === 0) {
    return NextResponse.json(
      { error: "No valid deck entries found. Check formatting and try again." },
      { status: 400 }
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
  const archetypeReport = computeDeckArchetypes(knownCards, inputDeckSize);

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
  return NextResponse.json({
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
    archetypeReport,
    improvementSuggestions,
    warnings: [...new Set([...deckHealth.warnings, ...explanation.warnings])],
    bracketReport
  });
}
