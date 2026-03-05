import type { GameState } from "../../core/types";

export function commanderTaxForCard(state: GameState, commanderCardId: string): number {
  const castCount = state.commander.castCountByCommanderId[commanderCardId] ?? 0;
  return castCount * 2;
}

export function markCommanderCastFromCommandZone(state: GameState, commanderCardId: string): GameState {
  return {
    ...state,
    commander: {
      ...state.commander,
      castCountByCommanderId: {
        ...state.commander.castCountByCommanderId,
        [commanderCardId]: (state.commander.castCountByCommanderId[commanderCardId] ?? 0) + 1
      }
    }
  };
}
