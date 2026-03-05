import type { DeckHealthReport, RecommendedCountRow } from "./contracts";
import { getStatus } from "./status";
import { COUNT_KEY_ORDER, COUNT_THRESHOLDS, type CountKey } from "./thresholds";

type CountSnapshot = Record<CountKey, number>;

type BuildDeckHealthInput = {
  counts: CountSnapshot;
  deckSize: number;
  unknownCardsCount: number;
};

function recText(min: number, max: number): string {
  return `${min}-${max}`;
}

function deficitRange(value: number, min: number, max: number): string {
  const low = Math.max(1, min - value);
  const high = Math.max(low, max - value);
  return `${low}-${high}`;
}

function excessRange(value: number, min: number, max: number): string {
  const low = Math.max(1, value - max);
  const high = Math.max(low, value - min);
  return `${low}-${high}`;
}

function diagnosticForRow(row: RecommendedCountRow): string {
  const { label, value, status, recommendedMin, recommendedMax, key } = row;
  const recommended = recText(recommendedMin, recommendedMax);

  if (status === "LOW") {
    const addRange = deficitRange(value, recommendedMin, recommendedMax);
    if (key === "draw") {
      return `Low Card Draw (${value}). Recommended ${recommended}. Add ${addRange} more draw/advantage sources.`;
    }

    if (key === "ramp") {
      return `Low Ramp (${value}). Recommended ${recommended}. Add ${addRange} more ramp sources.`;
    }

    if (key === "lands") {
      return `Low Lands (${value}). Recommended ${recommended}. Add ${addRange} more lands.`;
    }

    if (key === "wipes") {
      return `Low Board Wipes (${value}). Recommended ${recommended}. Add ${addRange} more sweepers.`;
    }

    return `Low ${label} (${value}). Recommended ${recommended}. Add ${addRange} more ${label.toLowerCase()} slots.`;
  }

  if (status === "HIGH") {
    const trimRange = excessRange(value, recommendedMin, recommendedMax);
    return `High ${label} (${value}). Recommended ${recommended}. Consider trimming ${trimRange} slots.`;
  }

  return `${label} is OK (${value}). Recommended ${recommended}.`;
}

/**
 * Builds deck-health diagnostics plus status rows used by the recommendation table.
 */
export function buildDeckHealthReport({
  counts,
  deckSize,
  unknownCardsCount
}: BuildDeckHealthInput): DeckHealthReport {
  const rows: RecommendedCountRow[] = COUNT_KEY_ORDER.map((key) => {
    const threshold = COUNT_THRESHOLDS[key];
    const value = counts[key] ?? 0;
    const status = getStatus(value, threshold.lowMin, threshold.highMax);

    const row: RecommendedCountRow = {
      key,
      label: threshold.label,
      value,
      status,
      recommendedMin: threshold.recommendedMin,
      recommendedMax: threshold.recommendedMax,
      recommendedText: recText(threshold.recommendedMin, threshold.recommendedMax),
      diagnostic: ""
    };

    row.diagnostic = diagnosticForRow(row);
    return row;
  });

  const warnings = rows.filter((row) => row.status !== "OK").map((row) => row.diagnostic);
  const okays = rows.filter((row) => row.status === "OK").map((row) => row.diagnostic);

  if (deckSize !== 100) {
    warnings.unshift(`Deck size is ${deckSize}; Commander decks are typically 100 cards.`);
  } else {
    okays.unshift("Deck size is OK (100).");
  }

  if (unknownCardsCount > 0) {
    warnings.push(
      `${unknownCardsCount} unknown card name${unknownCardsCount === 1 ? "" : "s"} found; review names for accurate diagnostics.`
    );
  } else {
    okays.push("No unknown card names detected.");
  }

  return {
    rows,
    warnings,
    okays,
    disclaimer: "Role counts are heuristic and can overlap across categories."
  };
}
