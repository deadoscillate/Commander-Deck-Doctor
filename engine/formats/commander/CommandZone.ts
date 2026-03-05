import type { GameState } from "../../core/types";

export function isInCommandZone(state: GameState, cardId: string): boolean {
  const card = state.cardInstances[cardId];
  return card?.currentZone === "command";
}

export function commandersForPlayer(state: GameState, playerId: string): string[] {
  return state.commander.commanderIdsByPlayer[playerId] ?? [];
}

export function canCastCommanderFromCommandZone(state: GameState, playerId: string, cardId: string): boolean {
  const commanderIds = commandersForPlayer(state, playerId);
  if (!commanderIds.includes(cardId)) {
    return false;
  }

  return isInCommandZone(state, cardId);
}
