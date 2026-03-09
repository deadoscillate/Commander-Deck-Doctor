import { parseDecklistWithCommander } from "@/lib/decklist";
import type { RecommendedCountRow } from "@/lib/contracts";

export type BuilderDeckCard = {
  name: string;
  qty: number;
};

export type BuilderCommanderSelection = {
  primary: string;
  secondary?: string | null;
};

export type PreconSimilaritySummary = {
  slug: string;
  name: string;
  releaseDate: string;
  overlapCount: number;
  overlapPct: number;
};

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function totalDeckCardCount(cards: BuilderDeckCard[]): number {
  return cards.reduce((sum, card) => sum + card.qty, 0);
}

export function buildBuilderDecklist(
  commander: BuilderCommanderSelection,
  cards: BuilderDeckCard[]
): string {
  const lines = ["Commander", `1 ${commander.primary}`];
  if (commander.secondary?.trim()) {
    lines.push(`1 ${commander.secondary.trim()}`);
  }

  lines.push("", "Deck");

  for (const card of cards) {
    lines.push(`${card.qty} ${card.name}`);
  }

  return lines.join("\n");
}

export function extractNeeds(rows: RecommendedCountRow[]): Array<{
  key: string;
  label: string;
  deficit: number;
  current: number;
  recommendedMin: number;
}> {
  return rows
    .filter((row) => row.status === "LOW" && row.value < row.recommendedMin)
    .map((row) => ({
      key: row.key,
      label: row.label,
      deficit: row.recommendedMin - row.value,
      current: row.value,
      recommendedMin: row.recommendedMin
    }))
    .sort((left, right) => right.deficit - left.deficit || left.label.localeCompare(right.label));
}

export function computePreconSimilarity(
  currentCards: BuilderDeckCard[],
  precon: {
    slug: string;
    name: string;
    releaseDate: string;
    decklist: string;
  }
): PreconSimilaritySummary {
  const currentCardNames = new Set(currentCards.map((card) => normalizeName(card.name)));
  const preconDeck = parseDecklistWithCommander(precon.decklist);
  const overlapCount = preconDeck.entries.reduce((sum, entry) => {
    return sum + (currentCardNames.has(normalizeName(entry.name)) ? 1 : 0);
  }, 0);
  const overlapPct =
    preconDeck.entries.length === 0 ? 0 : Math.round((overlapCount / preconDeck.entries.length) * 100);

  return {
    slug: precon.slug,
    name: precon.name,
    releaseDate: precon.releaseDate,
    overlapCount,
    overlapPct
  };
}
