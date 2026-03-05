import { isCreature } from "./Card";
import type { GameState, TargetKind } from "./types";

export function legalTargetIds(
  state: GameState,
  controllerId: string,
  targetKind: TargetKind
): string[] {
  if (targetKind === "NONE") {
    return [];
  }

  if (targetKind === "TARGET_PLAYER") {
    return state.players.filter((player) => !player.lost).map((player) => player.id);
  }

  if (targetKind === "TARGET_SPELL") {
    return state.stack.filter((item) => item.kind === "SPELL").map((item) => item.id);
  }

  const creatures = Object.values(state.cardInstances)
    .filter((card) => card.currentZone === "battlefield" && isCreature(card.definition))
    .map((card) => card.id);

  if (targetKind === "TARGET_CREATURE") {
    return creatures;
  }

  if (targetKind === "TARGET_CREATURE_OR_PLAYER") {
    return [
      ...creatures,
      ...state.players.filter((player) => !player.lost).map((player) => player.id)
    ];
  }

  return [];
}

export function targetsAreLegal(
  state: GameState,
  controllerId: string,
  targetKind: TargetKind,
  chosen: string[]
): boolean {
  if (targetKind === "NONE") {
    return chosen.length === 0;
  }

  if (chosen.length === 0) {
    return false;
  }

  const legal = new Set(legalTargetIds(state, controllerId, targetKind));
  return chosen.every((id) => legal.has(id));
}
