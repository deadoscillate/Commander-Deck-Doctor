import { DeckCard, DeckSummary, RoleCounts, TypeCounts } from "./types";
import type { RoleBreakdown } from "./contracts";

/**
 * Lightweight statistical/heuristic deck analysis.
 */
// Keep WUBRG ordering stable in UI output.
const COLORS_IN_ORDER = ["W", "U", "B", "R", "G"];
const CURVE_BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7+"];

function includesType(typeLine: string, typeName: string): boolean {
  return typeLine.toLowerCase().includes(typeName.toLowerCase());
}

function emptyTypeCounts(): TypeCounts {
  return {
    creature: 0,
    instant: 0,
    sorcery: 0,
    artifact: 0,
    enchantment: 0,
    planeswalker: 0,
    land: 0,
    battle: 0
  };
}

function emptyRoleCounts(): RoleCounts {
  return {
    ramp: 0,
    draw: 0,
    removal: 0,
    wipes: 0,
    tutors: 0,
    protection: 0,
    finishers: 0
  };
}

function emptyRoleBreakdown(): RoleBreakdown {
  return {
    ramp: [],
    draw: [],
    removal: [],
    wipes: [],
    tutors: [],
    protection: [],
    finishers: []
  };
}

function toCurveBucket(cmc: number): string {
  if (cmc >= 7) {
    return "7+";
  }

  return String(Math.max(0, Math.floor(cmc)));
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function roleFlags(card: DeckCard): Record<keyof RoleCounts, boolean> {
  const typeLine = card.card.type_line.toLowerCase();
  const text = card.card.oracle_text.toLowerCase();

  const ramp = matchesAny(text, [
    /search your library for (a |an )?(basic )?land/,
    /\badd\b[\s\S]{0,50}\bmana\b/,
    /for each land you control, add/
  ]);

  const draw = matchesAny(text, [
    /\bdraw\b[\s\S]{0,20}\bcard/,
    /whenever you draw/,
    /\bconnive\b/,
    /\bsurveil\b/
  ]);

  const removal = matchesAny(text, [
    /\bdestroy target\b/,
    /\bexile target\b/,
    /\bcounter target\b/,
    /\btarget .* gets -\d/,
    /\bdeals \d+ damage to target\b/,
    /\breturn target .* to .* hand\b/
  ]);

  const wipes = matchesAny(text, [
    /\bdestroy all\b/,
    /\bexile all\b/,
    /\beach creature\b/,
    /\beach opponent sacrifices\b[\s\S]{0,30}\bcreature\b/,
    /\ball creatures get -\d/
  ]);

  const tutors = matchesAny(text, [
    /\bsearch your library for a card\b/,
    /\bsearch your library for (an?|any) [^\.]* card\b/
  ]);

  const protection = matchesAny(text, [
    /\bindestructible\b/,
    /\bhexproof\b/,
    /\bphases? out\b/,
    /\bprotection from\b/,
    /\bcannot be countered\b/,
    /\bprevent all\b[\s\S]{0,20}\bdamage\b/
  ]);

  const finishers = matchesAny(text, [
    /\byou win the game\b/,
    /\beach opponent loses\b/,
    /\bdouble .* power\b/,
    /\bextra combat phase\b/,
    /\binfect\b/,
    /\btrample\b[\s\S]{0,20}\bdouble strike\b/
  ]);

  // Catch simple mana-rock style cards that do not explicitly say "mana" nearby.
  const manaRockLike = !typeLine.includes("land") && typeLine.includes("artifact") && /\badd\b/.test(text);

  return {
    ramp: ramp || manaRockLike,
    draw,
    removal,
    wipes,
    tutors,
    protection,
    finishers
  };
}

/**
 * Aggregates deck-level summary metrics used by dashboard cards.
 */
export function computeDeckSummary(cards: DeckCard[]): DeckSummary {
  const typeCounts = emptyTypeCounts();
  const manaCurve = Object.fromEntries(CURVE_BUCKETS.map((bucket) => [bucket, 0])) as Record<
    string,
    number
  >;
  const colorIdentity = new Set<string>();

  let deckSize = 0;
  let nonLandSpellQty = 0;
  let totalNonLandCmc = 0;

  for (const entry of cards) {
    const { qty, card } = entry;
    deckSize += qty;

    for (const color of card.color_identity) {
      colorIdentity.add(color);
    }

    if (includesType(card.type_line, "Creature")) typeCounts.creature += qty;
    if (includesType(card.type_line, "Instant")) typeCounts.instant += qty;
    if (includesType(card.type_line, "Sorcery")) typeCounts.sorcery += qty;
    if (includesType(card.type_line, "Artifact")) typeCounts.artifact += qty;
    if (includesType(card.type_line, "Enchantment")) typeCounts.enchantment += qty;
    if (includesType(card.type_line, "Planeswalker")) typeCounts.planeswalker += qty;
    if (includesType(card.type_line, "Land")) typeCounts.land += qty;
    if (includesType(card.type_line, "Battle")) typeCounts.battle += qty;

    const isLand = includesType(card.type_line, "Land");
    if (!isLand) {
      totalNonLandCmc += card.cmc * qty;
      nonLandSpellQty += qty;
      manaCurve[toCurveBucket(card.cmc)] += qty;
    }
  }

  const averageManaValue = nonLandSpellQty === 0 ? 0 : totalNonLandCmc / nonLandSpellQty;
  const colors = COLORS_IN_ORDER.filter((color) => colorIdentity.has(color));

  return {
    deckSize,
    uniqueCards: cards.length,
    colors,
    averageManaValue,
    types: typeCounts,
    manaCurve
  };
}

/**
 * Computes role counts by applying lightweight oracle-text heuristics.
 */
export function computeRoleCounts(cards: DeckCard[]): RoleCounts {
  const roles = emptyRoleCounts();

  for (const entry of cards) {
    const flags = roleFlags(entry);
    for (const [role, active] of Object.entries(flags) as [keyof RoleCounts, boolean][]) {
      if (active) {
        roles[role] += entry.qty;
      }
    }
  }

  return roles;
}

/**
 * Returns the specific cards tagged for each heuristic role bucket.
 */
export function computeRoleBreakdown(cards: DeckCard[]): RoleBreakdown {
  const breakdown = emptyRoleBreakdown();

  for (const entry of cards) {
    const flags = roleFlags(entry);
    for (const [role, active] of Object.entries(flags) as [keyof RoleCounts, boolean][]) {
      if (!active) {
        continue;
      }

      breakdown[role].push({
        name: entry.card.name,
        qty: entry.qty
      });
    }
  }

  for (const role of Object.keys(breakdown) as Array<keyof RoleBreakdown>) {
    breakdown[role].sort((a, b) => {
      if (b.qty !== a.qty) {
        return b.qty - a.qty;
      }

      return a.name.localeCompare(b.name);
    });
  }

  return breakdown;
}
