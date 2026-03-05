import type { ContinuousEffect, GameState } from "./types";

export function registerContinuousEffect(state: GameState, effect: ContinuousEffect): GameState {
  return {
    ...state,
    continuousEffects: [...state.continuousEffects, effect]
  };
}

export function removeContinuousEffectsBySource(state: GameState, sourceCardId: string): GameState {
  return {
    ...state,
    continuousEffects: state.continuousEffects.filter((effect) => effect.sourceCardId !== sourceCardId)
  };
}

export function pruneExpiredContinuousEffects(state: GameState): GameState {
  return {
    ...state,
    continuousEffects: state.continuousEffects.filter((effect) => {
      if (effect.expiresAtTurn === null) {
        return true;
      }

      return state.turnNumber <= effect.expiresAtTurn;
    })
  };
}
