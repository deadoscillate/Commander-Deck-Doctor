import { engineClient, type GameLogEvent, type GameState } from "@/lib/engineClient";

export type ReplayControllerState = {
  liveState: GameState;
  initialState: GameState;
  events: GameLogEvent[];
  replayIndex: number | null;
  isLive: boolean;
};

function clampIndex(index: number, events: GameLogEvent[]): number {
  return Math.max(0, Math.min(index, events.length));
}

function cloneState(state: GameState): GameState {
  return structuredClone(state) as GameState;
}

export function createReplayController(initialLiveState: GameState): ReplayControllerState {
  return {
    liveState: cloneState(initialLiveState),
    initialState: cloneState({
      ...initialLiveState,
      log: []
    }),
    events: [...initialLiveState.log],
    replayIndex: null,
    isLive: true
  };
}

export function syncReplayLiveState(
  replay: ReplayControllerState,
  nextLiveState: GameState
): ReplayControllerState {
  const events = [...nextLiveState.log];
  return {
    ...replay,
    liveState: cloneState(nextLiveState),
    events,
    replayIndex: replay.isLive ? null : replay.replayIndex
  };
}

export function setReplayIndex(
  replay: ReplayControllerState,
  index: number
): ReplayControllerState {
  return {
    ...replay,
    isLive: false,
    replayIndex: clampIndex(index, replay.events)
  };
}

export function goLive(replay: ReplayControllerState): ReplayControllerState {
  return {
    ...replay,
    isLive: true,
    replayIndex: null
  };
}

export function toggleLive(replay: ReplayControllerState, enabled: boolean): ReplayControllerState {
  if (enabled) {
    return goLive(replay);
  }

  return {
    ...replay,
    isLive: false,
    replayIndex: replay.events.length
  };
}

export function replayEventCount(replay: ReplayControllerState): number {
  return replay.events.length;
}

export function replayCurrentIndex(replay: ReplayControllerState): number {
  return replay.isLive ? replay.events.length : clampIndex(replay.replayIndex ?? replay.events.length, replay.events);
}

export function displayedState(replay: ReplayControllerState): GameState {
  if (replay.isLive) {
    return replay.liveState;
  }

  return engineClient.replay(replay.initialState, replay.events, replayCurrentIndex(replay));
}
