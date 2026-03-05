import type { GameLogEvent, GameState } from "./types";

function snapshotState(state: GameState): Record<string, unknown> {
  const { log, ...rest } = state;
  return structuredClone(rest) as Record<string, unknown>;
}

export function appendLog(
  state: GameState,
  type: string,
  payload: Record<string, unknown> = {}
): GameState {
  const event: GameLogEvent = {
    seq: state.log.length + 1,
    turn: state.turnNumber,
    step: state.step,
    type,
    payload,
    snapshot: snapshotState(state)
  };

  return {
    ...state,
    log: [...state.log, event]
  };
}
