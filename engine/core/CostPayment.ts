import type { ManaColor, ManaPool, PlayerState } from "./types";
import { canSpendAnyColor, manaPoolTotal } from "./ManaSystem";

export type ManaCostBreakdown = {
  generic: number;
  colored: Partial<Record<ManaColor, number>>;
  variableX: number;
  phyrexianSymbols: string[];
};

const COLOR_SYMBOLS: ManaColor[] = ["W", "U", "B", "R", "G", "C"];

export function parseManaCost(manaCost: string): ManaCostBreakdown {
  const breakdown: ManaCostBreakdown = {
    generic: 0,
    colored: {},
    variableX: 0,
    phyrexianSymbols: []
  };

  const symbols = manaCost.match(/\{[^}]+\}/g) ?? [];
  for (const symbol of symbols) {
    const token = symbol.replace(/[{}]/g, "").toUpperCase();
    if (/^\d+$/.test(token)) {
      breakdown.generic += Number(token);
      continue;
    }

    if (token === "X") {
      breakdown.variableX += 1;
      continue;
    }

    if (token.includes("/P")) {
      breakdown.phyrexianSymbols.push(token);
      continue;
    }

    if (COLOR_SYMBOLS.includes(token as ManaColor)) {
      const color = token as ManaColor;
      breakdown.colored[color] = (breakdown.colored[color] ?? 0) + 1;
      continue;
    }

    if (token.includes("/")) {
      // Hybrid symbols are treated as generic fallback in MVP.
      breakdown.generic += 1;
      continue;
    }
  }

  return breakdown;
}

export function withCommanderTax(cost: ManaCostBreakdown, commandZoneCastCount: number): ManaCostBreakdown {
  if (commandZoneCastCount <= 0) {
    return cost;
  }

  return {
    ...cost,
    generic: cost.generic + commandZoneCastCount * 2
  };
}

export function canPayManaCost(pool: ManaPool, cost: ManaCostBreakdown): boolean {
  for (const color of COLOR_SYMBOLS) {
    const required = cost.colored[color] ?? 0;
    if ((pool[color] ?? 0) < required) {
      return false;
    }
  }

  const coloredSpent = COLOR_SYMBOLS.reduce((sum, color) => sum + (cost.colored[color] ?? 0), 0);
  const remaining = manaPoolTotal(pool) - coloredSpent;
  return remaining >= cost.generic && canSpendAnyColor(pool, cost.generic + coloredSpent);
}

export function payManaCost(player: PlayerState, cost: ManaCostBreakdown): PlayerState {
  if (!canPayManaCost(player.manaPool, cost)) {
    return player;
  }

  const pool = { ...player.manaPool };

  for (const color of COLOR_SYMBOLS) {
    const required = cost.colored[color] ?? 0;
    if (required > 0) {
      pool[color] = Math.max(0, pool[color] - required);
    }
  }

  let genericToSpend = cost.generic;
  for (const color of COLOR_SYMBOLS) {
    if (genericToSpend <= 0) {
      break;
    }

    const available = pool[color] ?? 0;
    const spend = Math.min(available, genericToSpend);
    pool[color] = available - spend;
    genericToSpend -= spend;
  }

  return {
    ...player,
    manaPool: pool
  };
}
