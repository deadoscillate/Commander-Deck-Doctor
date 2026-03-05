import type { ManaColor, ManaPool, PlayerState } from "./types";

export function emptyManaPool(): ManaPool {
  return {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0
  };
}

export function addMana(pool: ManaPool, color: ManaColor, amount = 1): ManaPool {
  return {
    ...pool,
    [color]: Math.max(0, (pool[color] ?? 0) + amount)
  };
}

export function addManaToPlayer(player: PlayerState, color: ManaColor, amount = 1): PlayerState {
  return {
    ...player,
    manaPool: addMana(player.manaPool, color, amount)
  };
}

export function clearManaPool(player: PlayerState): PlayerState {
  return {
    ...player,
    manaPool: emptyManaPool()
  };
}

export function manaPoolTotal(pool: ManaPool): number {
  return pool.W + pool.U + pool.B + pool.R + pool.G + pool.C;
}

export function canSpendAnyColor(pool: ManaPool, amount: number): boolean {
  return manaPoolTotal(pool) >= amount;
}
