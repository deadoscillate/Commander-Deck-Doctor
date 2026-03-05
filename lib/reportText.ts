import type { AnalyzeResponse } from "./contracts";

function lineBreakJoin(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}

/**
 * Generates share-friendly plaintext for clipboard export.
 */
export function buildPlaintextReport(result: AnalyzeResponse): string {
  const summaryLines = [
    "Summary",
    `- Commander: ${result.commander.selectedName ?? "Not selected"}`,
    `- Deck Size: ${result.summary.deckSize}`,
    `- Unique Cards: ${result.summary.uniqueCards}`,
    `- Avg Mana Value: ${result.summary.averageManaValue.toFixed(2)}`,
    `- Colors: ${result.summary.colors.length > 0 ? result.summary.colors.join(", ") : "Colorless"}`
  ];

  const roleLines = [
    "Recommended Counts",
    ...result.deckHealth.rows.map(
      (row) => `- ${row.label}: ${row.value} (${row.status}) | Recommended ${row.recommendedText}`
    )
  ];

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
            `- Suggested ${item.label} (Current ${item.currentCount}, Recommended ${item.recommendedRange}):`,
            ...(item.suggestions.length > 0
              ? item.suggestions.map((name) => `  - ${name}`)
              : ["  - No matching suggestions for this color identity"])
          ])
        : ["- No LOW role suggestions right now."]
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

  const warningLines = [
    "Warnings",
    ...new Set([...result.deckHealth.warnings, ...result.bracketReport.warnings])
  ];

  return lineBreakJoin([
    "Commander Deck Doctor Report",
    "",
    ...summaryLines,
    "",
    ...roleLines,
    "",
    ...bracketLines,
    "",
    ...checkLines,
    "",
    ...suggestionLines,
    "",
    ...warningLines,
    "",
    `Game Changers version: ${result.bracketReport.gameChangersVersion}`,
    result.bracketReport.disclaimer
  ]);
}
