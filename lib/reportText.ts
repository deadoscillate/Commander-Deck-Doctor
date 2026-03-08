import type { AnalyzeResponse } from "./contracts";

function lineBreakJoin(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeComboText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isRedundantComboCardList(comboName: string, cards: string[]): boolean {
  const normalizedName = normalizeComboText(comboName);
  if (!normalizedName) {
    return false;
  }

  const normalizedCards = normalizeComboText(cards.join(" + "));
  return Boolean(normalizedCards) && normalizedCards === normalizedName;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `$${value.toFixed(2)}`;
}

function formatTix(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)} tix`;
}

function formatPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0.0%";
  }

  const bounded = Math.max(0, Math.min(100, value));
  return `${bounded.toFixed(1)}%`;
}

function formatTurn(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `Turn ${value.toFixed(1)}`;
}

function formatFixedNumber(value: unknown, digits: number, fallback = "N/A"): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : fallback;
}

/**
 * Generates share-friendly plaintext for clipboard export.
 */
export function buildPlaintextReport(result: AnalyzeResponse): string {
  const deckPriceMode = result.deckPrice?.pricingMode === "decklist-set" ? "Decklist [SET] tags" : "Oracle default";
  const setTaggedCardQty = Math.max(0, result.deckPrice?.setTaggedCardQty ?? 0);
  const setMatchedCardQty = Math.max(0, result.deckPrice?.setMatchedCardQty ?? 0);
  const archetypeReport = result.archetypeReport ?? {
    primary: null,
    secondary: null,
    confidence: 0,
    counts: [],
    disclaimer: "Archetype detection is pattern-based and directional."
  };
  const comboReport = result.comboReport ?? {
    detected: [],
    conditional: [],
    potential: [],
    databaseSize: 0,
    disclaimer: "Combo detection uses an offline Commander Spellbook-derived combo snapshot."
  };
  const fallbackRuleZero = {
    winStyle: {
      primary: "COMBAT",
      secondary: null,
      evidence: []
    },
    speedBand: {
      value: "MID",
      turnBand: "7-9",
      explanation: "No speed signals available."
    },
    consistency: {
      score: 0,
      bucket: "LOW",
      commanderEngine: false,
      explanation: "No consistency signals available."
    },
    tableImpact: {
      flags: [],
      extraTurnsCount: 0,
      massLandDenialCount: 0,
      staxPiecesCount: 0,
      freeInteractionCount: 0,
      fastManaCount: 0
    },
    disclaimer: "Rule 0 Snapshot is a conversation layer built from deck signals."
  };
  const rawRuleZero = (result as { ruleZero?: unknown }).ruleZero;
  const ruleZeroRecord =
    rawRuleZero && typeof rawRuleZero === "object" ? (rawRuleZero as Record<string, unknown>) : {};
  const rawWinStyle =
    ruleZeroRecord.winStyle && typeof ruleZeroRecord.winStyle === "object"
      ? (ruleZeroRecord.winStyle as Record<string, unknown>)
      : {};
  const rawSpeedBand =
    ruleZeroRecord.speedBand && typeof ruleZeroRecord.speedBand === "object"
      ? (ruleZeroRecord.speedBand as Record<string, unknown>)
      : {};
  const rawConsistency =
    ruleZeroRecord.consistency && typeof ruleZeroRecord.consistency === "object"
      ? (ruleZeroRecord.consistency as Record<string, unknown>)
      : {};
  const rawTableImpact =
    ruleZeroRecord.tableImpact && typeof ruleZeroRecord.tableImpact === "object"
      ? (ruleZeroRecord.tableImpact as Record<string, unknown>)
      : {};
  const tableImpactFlags = Array.isArray(rawTableImpact.flags)
    ? rawTableImpact.flags
        .filter((flag): flag is Record<string, unknown> => Boolean(flag) && typeof flag === "object")
        .map((flag, index) => ({
          kind: typeof flag.kind === "string" && flag.kind ? flag.kind : `impact-${index}`,
          severity: flag.severity === "WARN" ? "WARN" : "INFO",
          message:
            typeof flag.message === "string" && flag.message.trim()
              ? flag.message
              : "Potential table-impact signal detected.",
          cards: toStringArray(flag.cards)
        }))
    : [];

  const ruleZero = {
    winStyle: {
      primary:
        typeof rawWinStyle.primary === "string" && rawWinStyle.primary
          ? rawWinStyle.primary
          : fallbackRuleZero.winStyle.primary,
      secondary:
        typeof rawWinStyle.secondary === "string" && rawWinStyle.secondary ? rawWinStyle.secondary : null,
      evidence: toStringArray(rawWinStyle.evidence).slice(0, 8)
    },
    speedBand: {
      value:
        typeof rawSpeedBand.value === "string" && rawSpeedBand.value
          ? rawSpeedBand.value
          : fallbackRuleZero.speedBand.value,
      turnBand:
        typeof rawSpeedBand.turnBand === "string" && rawSpeedBand.turnBand
          ? rawSpeedBand.turnBand
          : fallbackRuleZero.speedBand.turnBand,
      explanation:
        typeof rawSpeedBand.explanation === "string" && rawSpeedBand.explanation
          ? rawSpeedBand.explanation
          : fallbackRuleZero.speedBand.explanation
    },
    consistency: {
      score: toFiniteNumber(rawConsistency.score, fallbackRuleZero.consistency.score),
      bucket:
        typeof rawConsistency.bucket === "string" && rawConsistency.bucket
          ? rawConsistency.bucket
          : fallbackRuleZero.consistency.bucket,
      explanation:
        typeof rawConsistency.explanation === "string" && rawConsistency.explanation
          ? rawConsistency.explanation
          : fallbackRuleZero.consistency.explanation
    },
    tableImpact: {
      flags: tableImpactFlags,
      extraTurnsCount: toFiniteNumber(rawTableImpact.extraTurnsCount, fallbackRuleZero.tableImpact.extraTurnsCount),
      massLandDenialCount: toFiniteNumber(
        rawTableImpact.massLandDenialCount,
        fallbackRuleZero.tableImpact.massLandDenialCount
      ),
      staxPiecesCount: toFiniteNumber(rawTableImpact.staxPiecesCount, fallbackRuleZero.tableImpact.staxPiecesCount),
      freeInteractionCount: toFiniteNumber(
        rawTableImpact.freeInteractionCount,
        fallbackRuleZero.tableImpact.freeInteractionCount
      ),
      fastManaCount: toFiniteNumber(rawTableImpact.fastManaCount, fallbackRuleZero.tableImpact.fastManaCount)
    },
    disclaimer:
      typeof ruleZeroRecord.disclaimer === "string" && ruleZeroRecord.disclaimer
        ? ruleZeroRecord.disclaimer
        : fallbackRuleZero.disclaimer
  };

  const summaryLines = [
    "Summary",
    `- Commander: ${result.commander.selectedName ?? "Not selected"}`,
    `- Deck Size: ${result.summary.deckSize}`,
    `- Unique Cards: ${result.summary.uniqueCards}`,
    `- Avg Mana Value: ${formatFixedNumber(result.summary.averageManaValue, 2)}`,
    `- Colors: ${result.summary.colors.length > 0 ? result.summary.colors.join(", ") : "Colorless"}`,
    `- Deck Price (USD): ${formatUsd(result.deckPrice?.totals.usd)}`,
    `- Deck Price (Foil): ${formatUsd(result.deckPrice?.totals.usdFoil)}`,
    `- Deck Price (MTGO): ${formatTix(result.deckPrice?.totals.tix)}`,
    `- Pricing Mode: ${deckPriceMode}`,
    ...(result.deckPrice?.pricingMode === "decklist-set"
      ? [`- Set Tag Matches: ${setMatchedCardQty}/${setTaggedCardQty}`]
      : [])
  ];

  const archetypeLines = [
    "Deck Archetype",
    `- Primary: ${archetypeReport.primary?.archetype ?? "Not enough signal detected"}`,
    `- Secondary: ${archetypeReport.secondary?.archetype ?? "Not enough signal detected"}`,
    `- Confidence: ${Math.round(archetypeReport.confidence * 100)}%`,
    ...(archetypeReport.counts.length > 0
      ? [`- Top Tags: ${archetypeReport.counts.slice(0, 4).map((item) => `${item.archetype} (${item.tagCount})`).join(", ")}`]
      : [])
  ];

  const roleBreakdownRecord =
    (result as { roleBreakdown?: unknown }).roleBreakdown &&
    typeof (result as { roleBreakdown?: unknown }).roleBreakdown === "object"
      ? ((result as { roleBreakdown?: unknown }).roleBreakdown as Record<string, unknown>)
      : {};

  const roleLines = [
    "Recommended Counts",
    ...result.deckHealth.rows.flatMap((row) => {
      const roleCards = Array.isArray(roleBreakdownRecord[row.key])
        ? (roleBreakdownRecord[row.key] as Array<Record<string, unknown>>)
            .map((entry) => ({
              name: typeof entry.name === "string" ? entry.name.trim() : "",
              qty: Math.max(0, Math.floor(toFiniteNumber(entry.qty, 0)))
            }))
            .filter((entry) => entry.name.length > 0 && entry.qty > 0)
        : [];

      if (roleCards.length === 0) {
        return [`- ${row.label}: ${row.value} (${row.status}) | Recommended ${row.recommendedText}`];
      }

      return [
        `- ${row.label}: ${row.value} (${row.status}) | Recommended ${row.recommendedText}`,
        `  - Tagged cards: ${roleCards.map((entry) => `${entry.name}${entry.qty > 1 ? ` x${entry.qty}` : ""}`).join(", ")}`
      ];
    })
  ];

  const tutorSummaryRecord =
    (result as { tutorSummary?: unknown }).tutorSummary &&
    typeof (result as { tutorSummary?: unknown }).tutorSummary === "object"
      ? ((result as { tutorSummary?: unknown }).tutorSummary as Record<string, unknown>)
      : null;
  const tutorSummaryLines = tutorSummaryRecord
    ? [
        "Tutor Classification",
        `- True tutors: ${toFiniteNumber(tutorSummaryRecord.trueTutors, result.roles.tutors)}`,
        `- Tutor-signal cards: ${Math.max(
          0,
          toFiniteNumber(tutorSummaryRecord.tutorSignals, result.roles.tutors) -
            toFiniteNumber(tutorSummaryRecord.trueTutors, result.roles.tutors)
        )}`,
        ...(Array.isArray(tutorSummaryRecord.trueTutorBreakdown) && tutorSummaryRecord.trueTutorBreakdown.length > 0
          ? [
              `- True tutor cards: ${(tutorSummaryRecord.trueTutorBreakdown as Array<Record<string, unknown>>)
                .map((row) => {
                  const name = typeof row.name === "string" ? row.name.trim() : "";
                  const qty = Math.max(0, Math.floor(toFiniteNumber(row.qty, 0)));
                  return name && qty > 0 ? `${name}${qty > 1 ? ` x${qty}` : ""}` : "";
                })
                .filter(Boolean)
                .slice(0, 20)
                .join(", ")}`
            ]
          : [])
      ]
    : [];

  const comboLines = [
    "Combo Detection",
    ...(comboReport.detected.length > 0
      ? comboReport.detected.map(
          (combo) =>
            isRedundantComboCardList(combo.comboName, combo.cards)
              ? `- ${combo.comboName} (${combo.commanderSpellbookUrl})`
              : `- ${combo.comboName}: ${combo.cards.join(" + ")} (${combo.commanderSpellbookUrl})`
        )
      : ["- No known combos detected."]),
    ...(comboReport.conditional.length > 0
      ? comboReport.conditional.slice(0, 10).map((combo) => {
          const requires = combo.requires.length > 0 ? ` | requires: ${combo.requires.join("; ")}` : "";
          return `- Conditional: ${combo.comboName} (${combo.commanderSpellbookUrl})${requires}`;
        })
      : []),
    ...(comboReport.potential.length > 0
      ? comboReport.potential.slice(0, 10).map((combo) => {
          const requires = combo.isConditional && combo.requires.length > 0 ? ` | requires: ${combo.requires.join("; ")}` : "";
          return `- Potential: ${combo.comboName} | missing: ${combo.missingCards.join(" + ")} | matched ${combo.matchCount}/${combo.cards.length}${requires} (${combo.commanderSpellbookUrl})`;
        })
      : []),
    `- Live combos: ${comboReport.detected.length} | Conditional combos: ${comboReport.conditional.length} | Potential shown: ${comboReport.potential.length} / ${comboReport.databaseSize} tracked`
  ];

  const ruleZeroLines = [
    "Rule 0 Snapshot",
    `- Estimated speed: ${ruleZero.speedBand.value} (${ruleZero.speedBand.turnBand})`,
    `- Primary win: ${ruleZero.winStyle.primary}`,
    ...(ruleZero.winStyle.secondary ? [`- Secondary win: ${ruleZero.winStyle.secondary}`] : []),
    `- Consistency: ${ruleZero.consistency.bucket} (${ruleZero.consistency.score})`,
    `- Speed reasoning: ${ruleZero.speedBand.explanation}`,
    `- Consistency reasoning: ${ruleZero.consistency.explanation}`,
    ...(ruleZero.winStyle.evidence.length > 0
      ? [`- Evidence cards: ${ruleZero.winStyle.evidence.slice(0, 8).join(", ")}`]
      : [])
  ];

  const tableImpactLines = [
    "Table Impact",
    ...(ruleZero.tableImpact.flags.length > 0
      ? ruleZero.tableImpact.flags.map((flag) => {
          const cards = flag.cards.length > 0 ? ` [${flag.cards.slice(0, 6).join(", ")}]` : "";
          return `- ${flag.severity}: ${flag.message}${cards}`;
        })
      : ["- No major table-impact flags detected."]),
    `- Counts: extraTurns=${ruleZero.tableImpact.extraTurnsCount}, massLandDenial=${ruleZero.tableImpact.massLandDenialCount}, stax=${ruleZero.tableImpact.staxPiecesCount}, freeInteraction=${ruleZero.tableImpact.freeInteractionCount}, fastMana=${ruleZero.tableImpact.fastManaCount}`
  ];

  const openingHandSimulationRecord =
    result.openingHandSimulation && typeof result.openingHandSimulation === "object"
      ? (result.openingHandSimulation as Record<string, unknown>)
      : null;
  const openingHandLines = openingHandSimulationRecord
    ? [
        "Opening Hand Simulation",
        `- Simulations: ${toFiniteNumber(openingHandSimulationRecord.simulations, 0)}`,
        `- Playable hands: ${formatPercent(openingHandSimulationRecord.playablePct)}`,
        `- Dead hands: ${formatPercent(openingHandSimulationRecord.deadPct)}`,
        `- Ramp in opening: ${formatPercent(openingHandSimulationRecord.rampInOpeningPct)}`,
        `- Average first spell turn: ${formatTurn(openingHandSimulationRecord.averageFirstSpellTurn)}`,
        `- Estimated commander cast turn: ${formatTurn(openingHandSimulationRecord.estimatedCommanderCastTurn)}`
      ]
    : [];

  const gameChangerLines =
    result.bracketReport.gameChangersFound.length > 0
      ? result.bracketReport.gameChangersFound.map(
          (card) => `  - ${card.name}${card.qty > 1 ? ` x${card.qty}` : ""}`
        )
      : ["  - None"];

  const bracketLines = [
    "Commander Brackets",
    `- Estimated: ${result.bracketReport.estimatedBracket} (${result.bracketReport.estimatedLabel})`,
    `- Game Changers: ${result.bracketReport.gameChangersCount}${
      result.bracketReport.bracket3AllowanceText ? ` (${result.bracketReport.bracket3AllowanceText})` : ""
    }`,
    "- Game Changer List:",
    ...gameChangerLines,
    `- Extra turns: ${result.bracketReport.extraTurnsCount}`,
    `- Mass land denial flags: ${result.bracketReport.massLandDenialCount}`
  ];

  const suggestionLines = [
    "Deck Improvement Suggestions",
    ...(
      result.improvementSuggestions.items.length > 0
        ? result.improvementSuggestions.items.flatMap((item) => [
            `- Suggested ${item.direction === "CUT" ? "cuts" : "adds"} for ${item.label} (Current ${item.currentCount}, Recommended ${item.recommendedRange}):`,
            ...(item.suggestions.length > 0
              ? item.suggestions.map((name) => `  - ${name}`)
              : [
                  item.direction === "CUT"
                    ? "  - No clear cut candidates found for this role"
                    : "  - No matching additions for this color identity"
                ])
          ])
        : ["- No add/cut role suggestions right now."]
    )
  ];

  const checkLines = [
    "Checks",
    `- Deck Size: ${result.checks.deckSize.ok ? "OK" : "WARN"} - ${result.checks.deckSize.message}`,
    `- Unknown Cards: ${result.checks.unknownCards.ok ? "OK" : "WARN"} - ${result.checks.unknownCards.message}`,
    `- Singleton: ${result.checks.singleton.ok ? "OK" : "WARN"} - ${result.checks.singleton.message}`,
    `- Color Identity: ${
      result.checks.colorIdentity.ok ? "OK" : result.checks.colorIdentity.enabled ? "WARN" : "PENDING"
    } - ${result.checks.colorIdentity.message}`
  ];

  const rulesEngineRecord =
    result.rulesEngine && typeof result.rulesEngine === "object"
      ? (result.rulesEngine as Record<string, unknown>)
      : null;
  const failedRuleLines =
    rulesEngineRecord && Array.isArray(rulesEngineRecord.rules)
      ? rulesEngineRecord.rules
          .filter((rule): rule is Record<string, unknown> => Boolean(rule) && typeof rule === "object")
          .filter((rule) => rule.outcome === "FAIL")
          .map((rule) => {
            const name = typeof rule.name === "string" && rule.name ? rule.name : "Unnamed Rule";
            const message = typeof rule.message === "string" && rule.message ? rule.message : "Rule failed.";
            return `  - ${name}: ${message}`;
          })
      : [];
  const rulesEngineLines = rulesEngineRecord
    ? [
        "Rules Engine",
        `- Status: ${rulesEngineRecord.status === "FAIL" ? "FAIL" : "PASS"}`,
        `- Pass: ${toFiniteNumber(rulesEngineRecord.passedRules, 0)} | Fail: ${toFiniteNumber(
          rulesEngineRecord.failedRules,
          0
        )} | Skip: ${toFiniteNumber(rulesEngineRecord.skippedRules, 0)}`,
        `- Version: ${typeof rulesEngineRecord.engineVersion === "string" ? rulesEngineRecord.engineVersion : "unknown"}`,
        ...(failedRuleLines.length > 0 ? ["- Failing Rules:", ...failedRuleLines] : [])
      ]
    : [];

  const warningLines = [
    "Warnings",
    ...new Set([...result.deckHealth.warnings, ...result.bracketReport.warnings])
  ];

  return lineBreakJoin([
    "Commander Deck Doctor Report",
    "",
    ...summaryLines,
    "",
    ...archetypeLines,
    "",
    ...comboLines,
    "",
    ...ruleZeroLines,
    "",
    ...tableImpactLines,
    "",
    ...openingHandLines,
    ...(openingHandLines.length > 0 ? [""] : []),
    ...roleLines,
    ...(tutorSummaryLines.length > 0 ? ["", ...tutorSummaryLines] : []),
    "",
    ...bracketLines,
    "",
    ...checkLines,
    "",
    ...rulesEngineLines,
    ...(rulesEngineLines.length > 0 ? [""] : []),
    ...suggestionLines,
    "",
    ...warningLines,
    "",
    `Game Changers version: ${result.bracketReport.gameChangersVersion}`,
    result.bracketReport.disclaimer,
    ruleZero.disclaimer
  ]);
}
