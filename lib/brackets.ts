import { findGameChangerName } from "./gameChangers";
import type { NamedCount } from "./contracts";
import type { BracketEstimate, DeckCard } from "./types";

/**
 * Commander Brackets heuristics for MVP reporting.
 */
export const BRACKET_LABELS: Record<1 | 2 | 3 | 4 | 5, BracketEstimate["label"]> = {
  1: "Exhibition",
  2: "Core",
  3: "Upgraded",
  4: "Optimized",
  5: "cEDH"
};

type BracketInputs = {
  gcCount: number;
  userCedhFlag?: boolean;
  userHighPowerNoGCFlag?: boolean;
};

type ExplanationInputs = {
  estimate: BracketEstimate;
  gcCount: number;
  extraTurnsCount: number;
  massLandDenialCount: number;
  userTargetBracket?: number | null;
  expectedWinTurn?: string | null;
};
type GameChangerEntry = {
  name: string;
  qty: number;
  aliases?: string[];
};

// Intentionally heuristic patterns; this is not a full rules engine.
const massLandDenialPatterns = [
  /destroy all lands/i,
  /exile all lands/i,
  /return all lands to (their|its) owners' hands/i,
  /lands don(?:'|\u2019)?t untap/i,
  /players can(?:'|\u2019)?t untap more than .* lands?/i,
  /each player sacrifices .* lands?/i,
  /nonbasic lands are/i
];

function foldCounts(rows: NamedCount[]): NamedCount[] {
  const merged = new Map<string, NamedCount>();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.qty += row.qty;
      continue;
    }
    merged.set(key, { ...row });
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Finds deck entries that match the curated Game Changers list.
 */
export function computeGameChangers(deckCards: DeckCard[]): { gcCount: number; found: NamedCount[] } {
  return computeGameChangersFromEntries(
    deckCards.map((entry) => ({
      name: entry.name,
      qty: entry.qty,
      aliases: [entry.card.name, ...entry.card.name.split(" // ").map((part) => part.trim())]
    }))
  );
}

/**
 * Generic variant used by API route for parsed deck + canonical card names.
 */
export function computeGameChangersFromEntries(
  entries: GameChangerEntry[]
): { gcCount: number; found: NamedCount[] } {
  const found: NamedCount[] = [];

  for (const entry of entries) {
    const candidates = new Set<string>([entry.name, ...(entry.aliases ?? [])]);
    for (const candidate of candidates) {
      const canonical = findGameChangerName(candidate);
      if (canonical) {
        found.push({ name: canonical, qty: entry.qty });
        break;
      }
    }
  }

  const merged = foldCounts(found);
  const gcCount = merged.reduce((sum, item) => sum + item.qty, 0);
  return { gcCount, found: merged };
}

/**
 * Counts cards containing "take an extra turn" in oracle text.
 */
export function computeExtraTurns(deckCards: DeckCard[]): { count: number; cards: NamedCount[] } {
  const found: NamedCount[] = [];

  for (const entry of deckCards) {
    if (/take an extra turn/i.test(entry.card.oracle_text)) {
      found.push({ name: entry.card.name, qty: entry.qty });
    }
  }

  const cards = foldCounts(found);
  const count = cards.reduce((sum, item) => sum + item.qty, 0);
  return { count, cards };
}

/**
 * Flags potential mass land denial cards using regex heuristics.
 */
export function computeMassLandDenial(deckCards: DeckCard[]): { count: number; cards: NamedCount[] } {
  const found: NamedCount[] = [];

  for (const entry of deckCards) {
    if (massLandDenialPatterns.some((pattern) => pattern.test(entry.card.oracle_text))) {
      found.push({ name: entry.card.name, qty: entry.qty });
    }
  }

  const cards = foldCounts(found);
  const count = cards.reduce((sum, item) => sum + item.qty, 0);
  return { count, cards };
}

/**
 * Applies the MVP bracket decision table.
 */
export function estimateBracket({
  gcCount,
  userCedhFlag,
  userHighPowerNoGCFlag
}: BracketInputs): BracketEstimate {
  if (userCedhFlag) {
    return {
      value: 5,
      label: BRACKET_LABELS[5],
      rationale: "Marked as built for cEDH pods/tournament metas."
    };
  }

  if (gcCount >= 4) {
    return {
      value: 4,
      label: BRACKET_LABELS[4],
      rationale: "Four or more Game Changers points toward Optimized expectations."
    };
  }

  if (gcCount >= 1 && gcCount <= 3) {
    return {
      value: 3,
      label: BRACKET_LABELS[3],
      rationale: "One to three Game Changers aligns with Upgraded expectations."
    };
  }

  if (gcCount === 0 && userHighPowerNoGCFlag) {
    return {
      value: 4,
      label: BRACKET_LABELS[4],
      rationale: "No Game Changers, but marked as highly optimized anyway."
    };
  }

  return {
    value: 2,
    label: BRACKET_LABELS[2],
    rationale: "No Game Changers found, so Core is the default starting point."
  };
}

/**
 * Builds human-readable notes/warnings for the bracket report panel.
 */
export function buildBracketExplanation({
  estimate,
  gcCount,
  extraTurnsCount,
  massLandDenialCount,
  userTargetBracket,
  expectedWinTurn
}: ExplanationInputs): { explanation: string; notes: string[]; warnings: string[]; disclaimer: string } {
  const notes: string[] = [];
  const warnings: string[] = [];
  let explanation = estimate.rationale;

  if (gcCount >= 1 && gcCount <= 3) {
    notes.push("Up to three Game Changers fits Bracket 3 expectations.");
    explanation = `You have ${gcCount} Game Changer${
      gcCount === 1 ? "" : "s"
    } -> Upgraded (3) candidate.`;
  } else if (gcCount >= 4) {
    notes.push("Four or more Game Changers usually indicates an Optimized-style deck.");
    explanation = `You have ${gcCount} Game Changers -> Optimized (4) candidate.`;
  } else if (gcCount === 0 && estimate.value === 2) {
    notes.push("No Game Changers found, so Core is the default estimate.");
    explanation = "You have 0 Game Changers -> Core (2) by default.";
  } else if (gcCount === 0 && estimate.value === 4) {
    notes.push("Strong decks can still be Bracket 4 even without Game Changers.");
    explanation = "No Game Changers, but marked highly optimized -> Optimized (4) candidate.";
  }

  if (estimate.value === 5) {
    explanation = "Marked as cEDH pod/tournament intent -> cEDH (5) candidate.";
  }

  notes.push(`Extra turns detected: ${extraTurnsCount}.`);
  notes.push(`Mass land denial flags: ${massLandDenialCount} (heuristic).`);

  if (massLandDenialCount > 0 && estimate.value <= 3) {
    warnings.push("Mass land denial is generally not expected in Brackets 1-3.");
  }

  if (extraTurnsCount >= 3) {
    warnings.push("Multiple extra-turn spells may push expectations upward; discuss with your pod.");
  }

  if (typeof userTargetBracket === "number" && userTargetBracket >= 1 && userTargetBracket <= 5) {
    if (userTargetBracket === estimate.value) {
      notes.push(`Your target bracket (${userTargetBracket}) matches this estimate.`);
    } else {
      notes.push(`Your target bracket is ${userTargetBracket}; estimate is ${estimate.value}.`);
    }
  }

  if (expectedWinTurn) {
    notes.push(`Selected expected win/lock turn: ${expectedWinTurn}.`);
  }

  return {
    explanation,
    notes,
    warnings,
    disclaimer: "Commander Brackets are a pregame conversation tool; this is a heuristic estimate."
  };
}
