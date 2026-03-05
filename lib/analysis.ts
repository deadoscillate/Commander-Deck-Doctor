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

type RoleComputationOptions = {
  behaviorIdByCardName?: (cardName: string) => string | null;
};

const ROLE_HINTS_BY_BEHAVIOR_ID: Record<string, Array<keyof RoleCounts>> = {
  TAP_ADD_W: ["ramp"],
  TAP_ADD_U: ["ramp"],
  TAP_ADD_B: ["ramp"],
  TAP_ADD_R: ["ramp"],
  TAP_ADD_G: ["ramp"],
  TAP_ADD_C2: ["ramp"],
  TAP_ADD_ANY: ["ramp"],
  ETB_DRAW_1: ["draw"],
  DRAW_1: ["draw"],
  DRAW_2: ["draw"],
  DAMAGE_2: ["removal"],
  DAMAGE_3: ["removal"],
  DAMAGE_5: ["removal"],
  DESTROY_TARGET_CREATURE: ["removal"],
  SORCERY_DESTROY_TARGET_CREATURE: ["removal"],
  COUNTER_TARGET_SPELL: ["removal"]
};

function toCurveBucket(cmc: number): string {
  if (cmc >= 7) {
    return "7+";
  }

  return String(Math.max(0, Math.floor(cmc)));
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function isBoardWipeByText(text: string): boolean {
  return matchesAny(text, [
    /\bdestroy\s+(?:all|each)\s+[^.]{0,80}\b(?:creatures?|artifacts?|enchantments?|planeswalkers?|nonland permanents?|permanents?)\b/,
    /\bexile\s+(?:all|each)\s+[^.]{0,80}\b(?:creatures?|artifacts?|enchantments?|planeswalkers?|nonland permanents?|permanents?|graveyards?)\b/,
    /\breturn\s+(?:all|each)\s+[^.]{0,80}\b(?:creatures?|artifacts?|enchantments?|planeswalkers?|nonland permanents?|permanents?)\b[^.]{0,80}\bto\s+(?:its|their)\s+owner'?s\s+hand\b/,
    /\b(?:all|each)\s+creatures?\s+get\s+-\d+\/-\d+/,
    /\bdeals?\s+(?:x|\d+)\s+damage\s+to\s+each\s+creature\b/,
    /\beach\s+player\s+sacrifices\s+(?:all\s+)?(?:creatures?|artifacts?|enchantments?|planeswalkers?)\b/
  ]);
}

function searchClauses(text: string): string[] {
  const clauses: string[] = [];
  const pattern = /search your library for ([^.]+)/g;
  for (const match of text.matchAll(pattern)) {
    const clause = match[1]?.trim();
    if (clause) {
      clauses.push(clause);
    }
  }

  return clauses;
}

function isLandOnlySearchClause(clause: string): boolean {
  if (/\bnonland\b/.test(clause)) {
    return false;
  }

  return matchesAny(clause, [
    /\bbasic land\b/,
    /\bland cards?\b/,
    /\b(?:plains|island|swamp|mountain|forest|wastes) cards?\b/
  ]);
}

function isTutorByText(text: string): boolean {
  const clauses = searchClauses(text);
  if (clauses.length === 0) {
    return false;
  }

  return clauses.some((clause) => {
    if (/\b(any|a)\s+card\b/.test(clause)) {
      return true;
    }

    if (isLandOnlySearchClause(clause)) {
      return false;
    }

    return /\b(?:artifact|battle|creature|enchantment|instant|planeswalker|sorcery|nonland)\s+card\b/.test(clause);
  });
}

function isRampByText(typeLine: string, text: string): boolean {
  const manaRockLike = !typeLine.includes("land") && typeLine.includes("artifact") && /\badd\b/.test(text);
  if (manaRockLike) {
    return true;
  }

  return matchesAny(text, [
    /search your library for (?:up to )?\d*\s*(?:basic )?land/,
    /search your library for [^.]{0,80}\b(?:plains|island|swamp|mountain|forest|wastes)\b/,
    /put (?:that|those|a|an) [^\.]*land[^\.]* onto the battlefield/,
    /\{t\}:\s*add\s+\{[wubrgc]/,
    /\badd\b[\s\S]{0,50}\bmana\b/,
    /\bcreate\b[\s\S]{0,30}\btreasure\b/,
    /for each land you control, add/
  ]);
}

function isDrawByText(text: string): boolean {
  return matchesAny(text, [
    /\bdraw\b[\s\S]{0,20}\bcard/,
    /whenever you draw/,
    /\bconnive\b/,
    /\bsurveil\b/,
    /\binvestigate\b/
  ]);
}

function isRemovalByText(text: string): boolean {
  return matchesAny(text, [
    /\bdestroy target\b/,
    /\bexile target\b/,
    /\bcounter target\b/,
    /\btarget .* gets -\d+\/-\d+/,
    /\bdeals? (?:x|\d+) damage to target\b/,
    /\breturn target .* to .* hand\b/,
    /\btarget player sacrifices\b[\s\S]{0,30}\bcreature\b/,
    /\bfight target\b/
  ]);
}

function isProtectionByText(text: string): boolean {
  return matchesAny(text, [
    /\bindestructible\b/,
    /\bhexproof\b/,
    /\bward\b/,
    /\bphases? out\b/,
    /\bprotection from\b/,
    /\bcannot be countered\b/,
    /\bcan't be countered\b/,
    /\bprevent all\b[\s\S]{0,20}\bdamage\b/,
    /\bcounter target spell that targets\b/
  ]);
}

function isFinisherByText(text: string): boolean {
  return matchesAny(text, [
    /\byou win the game\b/,
    /\beach opponent loses (?:x|[2-9]|\d{2,}) life\b/,
    /\beach opponent loses life equal to\b/,
    /\bdouble damage\b/,
    /\bextra combat phase\b/,
    /\bcreatures you control gain trample and get \+[x\d]+\/\+[x\d]+\b/,
    /\bcreatures you control get \+[x\d]+\/\+[x\d]+ and gain trample\b/
  ]);
}

function roleFlags(
  card: DeckCard,
  options?: RoleComputationOptions
): Record<keyof RoleCounts, boolean> {
  const typeLine = card.card.type_line.toLowerCase();
  const text = card.card.oracle_text.toLowerCase();
  const behaviorId = options?.behaviorIdByCardName?.(card.card.name) ?? null;
  const behaviorHints = behaviorId ? ROLE_HINTS_BY_BEHAVIOR_ID[behaviorId] ?? [] : [];

  const rampByText = isRampByText(typeLine, text);
  const drawByText = isDrawByText(text);
  const removalByText = isRemovalByText(text);

  const wipesByText = isBoardWipeByText(text);

  const tutorsByText = isTutorByText(text);
  const protectionByText = isProtectionByText(text);
  const finishersByText = isFinisherByText(text);

  return {
    ramp: behaviorHints.includes("ramp") || rampByText,
    draw: behaviorHints.includes("draw") || drawByText,
    removal: behaviorHints.includes("removal") || removalByText,
    wipes: behaviorHints.includes("wipes") || wipesByText,
    tutors: behaviorHints.includes("tutors") || tutorsByText,
    protection: behaviorHints.includes("protection") || protectionByText,
    finishers: behaviorHints.includes("finishers") || finishersByText
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
export function computeRoleCounts(cards: DeckCard[], options?: RoleComputationOptions): RoleCounts {
  const roles = emptyRoleCounts();

  for (const entry of cards) {
    const flags = roleFlags(entry, options);
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
export function computeRoleBreakdown(cards: DeckCard[], options?: RoleComputationOptions): RoleBreakdown {
  const breakdown = emptyRoleBreakdown();

  for (const entry of cards) {
    const flags = roleFlags(entry, options);
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
