import { CardDatabase } from "./cards/CardDatabase";
import { createGameState } from "./core/GameState";
import { applyAction as applyRuntimeAction, getLegalActions as getRuntimeLegalActions, getSummary as getRuntimeSummary, step as runtimeStep } from "./core/runtime";
import { simulateDeck, type SimulationInput, type SimulationResult } from "./core/simulations";
import type { CreateGameInput, EngineAction, GameLogEvent, GameState, GameSummary, LegalAction } from "./core/types";

export const ENGINE_VERSION = "0.1.0-alpha.1";

export type EngineApi = {
  version: string;
  cardDatabase: CardDatabase;
  createGame: (input: CreateGameInput) => GameState;
  getLegalActions: (state: GameState, playerId: string) => LegalAction[];
  applyAction: (state: GameState, action: EngineAction) => GameState;
  step: (state: GameState) => GameState;
  getSummary: (state: GameState) => GameSummary;
  replay: (initialState: GameState, events: GameLogEvent[], upToIndex: number) => GameState;
  simulate: (input: SimulationInput) => SimulationResult;
};

function cloneState(state: GameState): GameState {
  return structuredClone(state) as GameState;
}

function replayFromSnapshot(
  initialState: GameState,
  events: GameLogEvent[],
  upToIndex: number
): GameState {
  const bounded = Math.max(0, Math.min(upToIndex, events.length));
  if (bounded === 0) {
    const base = cloneState(initialState);
    return {
      ...base,
      log: []
    };
  }

  const event = events[bounded - 1];
  if (event?.snapshot && typeof event.snapshot === "object") {
    const snapshot = cloneState({
      ...(event.snapshot as GameState),
      log: events.slice(0, bounded)
    });
    return snapshot;
  }

  const fallback = cloneState(initialState);
  return {
    ...fallback,
    log: events.slice(0, bounded)
  };
}

export function createEngine(options?: { cardDatabase?: CardDatabase }): EngineApi {
  const cardDatabase = options?.cardDatabase ?? CardDatabase.loadFromCompiledFile();

  return {
    version: ENGINE_VERSION,
    cardDatabase,
    createGame: (input) => createGameState(input),
    getLegalActions: (state, playerId) => getRuntimeLegalActions(state, playerId, cardDatabase),
    applyAction: (state, action) => applyRuntimeAction(state, action, cardDatabase),
    step: (state) => runtimeStep(state, cardDatabase),
    getSummary: (state) => getRuntimeSummary(state),
    replay: (initialState, events, upToIndex) => replayFromSnapshot(initialState, events, upToIndex),
    simulate: (input) => simulateDeck(cardDatabase, input)
  };
}

export { CardDatabase } from "./cards/CardDatabase";
export type {
  CardDefinition,
  CardInstance,
  CreateGameInput,
  EngineAction,
  GameLogEvent,
  GameState,
  GameSummary,
  LegalAction,
  ReplacementEffect,
  TargetKind,
  TurnStep
} from "./core/types";
export type {
  SimulationDeckEntry,
  SimulationInput,
  SimulationResult,
  GoldfishSimulationResult,
  OpeningHandSimulationResult
} from "./core/simulations";
