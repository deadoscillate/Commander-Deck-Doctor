import type { GameState } from "./types";

function activePlayerId(state: GameState): string {
  return state.players[state.activePlayerIndex]?.id ?? "";
}

export function resetPriorityToActivePlayer(state: GameState): GameState {
  return {
    ...state,
    priorityHolderPlayerId: activePlayerId(state),
    passedPriorityPlayerIds: []
  };
}

export function setPriorityHolder(state: GameState, playerId: string | null): GameState {
  return {
    ...state,
    priorityHolderPlayerId: playerId,
    passedPriorityPlayerIds: []
  };
}

export function markPriorityPassed(state: GameState, playerId: string): GameState {
  if (state.passedPriorityPlayerIds.includes(playerId)) {
    return state;
  }

  return {
    ...state,
    passedPriorityPlayerIds: [...state.passedPriorityPlayerIds, playerId]
  };
}

export function allPlayersPassed(state: GameState): boolean {
  const alivePlayers = state.players.filter((player) => !player.lost).map((player) => player.id);
  if (alivePlayers.length === 0) {
    return false;
  }

  return alivePlayers.every((playerId) => state.passedPriorityPlayerIds.includes(playerId));
}

export function nextPriorityHolder(state: GameState): string | null {
  if (!state.priorityHolderPlayerId) {
    return activePlayerId(state);
  }

  const alivePlayers = state.players.filter((player) => !player.lost);
  if (alivePlayers.length === 0) {
    return null;
  }

  const idx = alivePlayers.findIndex((player) => player.id === state.priorityHolderPlayerId);
  if (idx === -1) {
    return alivePlayers[0].id;
  }

  return alivePlayers[(idx + 1) % alivePlayers.length]?.id ?? null;
}
