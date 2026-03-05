import type { CommanderState, GameState } from "../../core/types";

export function getCommanderState(state: GameState): CommanderState {
  return state.commander;
}

export function isCommanderCard(state: GameState, cardId: string): boolean {
  return Object.values(state.commander.commanderIdsByPlayer).some((ids) => ids.includes(cardId));
}

export function commanderOwner(state: GameState, cardId: string): string | null {
  for (const [playerId, ids] of Object.entries(state.commander.commanderIdsByPlayer)) {
    if (ids.includes(cardId)) {
      return playerId;
    }
  }

  return null;
}
