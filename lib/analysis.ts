import { classifyCardRoles, classifyTypeBuckets, type RoleClassifierCardInput } from "@/engine/cards/roleClassifier";
import type { CardDefinition as EngineCardDefinition } from "@/engine/core/types";
import { DeckCard, DeckSummary, RoleCounts, TypeCounts } from "./types";
import type { RoleBreakdown } from "./contracts";

const COLORS_IN_ORDER = ["W", "U", "B", "R", "G"];
const CURVE_BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7+"];

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
  engineCardByName?: (cardName: string) => EngineCardDefinition | null;
  behaviorIdByCardName?: (cardName: string) => string | null;
};

function toCurveBucket(cmc: number): string {
  if (cmc >= 7) {
    return "7+";
  }

  return String(Math.max(0, Math.floor(cmc)));
}

function scryfallKeywords(card: DeckCard["card"]): string[] {
  const value = (card as { keywords?: unknown }).keywords;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toRoleClassifierInput(
  card: DeckCard,
  options?: RoleComputationOptions
): RoleClassifierCardInput {
  const engineCard = options?.engineCardByName?.(card.card.name) ?? null;
  if (engineCard) {
    return {
      typeLine: engineCard.typeLine,
      oracleText: engineCard.oracleText,
      keywords: engineCard.keywords,
      behaviorId: engineCard.behaviorId ?? null
    };
  }

  return {
    typeLine: card.card.type_line,
    oracleText: card.card.oracle_text,
    keywords: scryfallKeywords(card.card),
    behaviorId: options?.behaviorIdByCardName?.(card.card.name) ?? null
  };
}

function roleFlags(
  card: DeckCard,
  options?: RoleComputationOptions
): Record<keyof RoleCounts, boolean> {
  return classifyCardRoles(toRoleClassifierInput(card, options));
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

    const typeFlags = classifyTypeBuckets(card.type_line);
    if (typeFlags.creature) typeCounts.creature += qty;
    if (typeFlags.instant) typeCounts.instant += qty;
    if (typeFlags.sorcery) typeCounts.sorcery += qty;
    if (typeFlags.artifact) typeCounts.artifact += qty;
    if (typeFlags.enchantment) typeCounts.enchantment += qty;
    if (typeFlags.planeswalker) typeCounts.planeswalker += qty;
    if (typeFlags.land) typeCounts.land += qty;
    if (typeFlags.battle) typeCounts.battle += qty;

    if (!typeFlags.land) {
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
 * Computes role counts from engine card behaviors plus structured oracle-pattern rules.
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
 * Returns specific cards tagged in each role bucket.
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
