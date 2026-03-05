import { createEngine } from "@/engine";
import type {
  CreateGameInput,
  EngineAction,
  GameLogEvent,
  GameState,
  LegalAction,
  SimulationInput,
  SimulationResult,
  TargetKind
} from "@/engine";
import { legalTargetIds } from "@/engine/core/Targeting";

type TargetOption = {
  id: string;
  label: string;
};

export type ActionDescriptor = {
  action: LegalAction;
  label: string;
  group: "priority" | "land" | "cast" | "ability" | "combat";
  requiresTargets: boolean;
  requiredTargetCount: number;
  targetOptions: TargetOption[];
};

const engine = createEngine();

function cardName(state: GameState, cardId: string): string {
  return state.cardInstances[cardId]?.definition.name ?? cardId;
}

function targetKindForAction(state: GameState, action: LegalAction): TargetKind {
  if (action.type === "CAST_SPELL") {
    const card = state.cardInstances[action.cardId];
    const behavior = card ? engine.cardDatabase.getBehavior(card.definition.behaviorId) : null;
    return behavior?.targetKind ?? "NONE";
  }

  if (action.type === "ACTIVATE_ABILITY") {
    const source = state.cardInstances[action.sourceCardId];
    const behavior = source ? engine.cardDatabase.getBehavior(source.definition.behaviorId) : null;
    const ability = behavior?.activatedAbilities.find((item) => item.id === action.abilityId);
    return ability?.targetKind ?? "NONE";
  }

  return "NONE";
}

function targetCountForKind(targetKind: TargetKind): number {
  return targetKind === "NONE" ? 0 : 1;
}

function targetOptionsForAction(state: GameState, action: LegalAction): TargetOption[] {
  const targetKind = targetKindForAction(state, action);
  if (targetKind === "NONE") {
    return [];
  }

  const actorId = action.playerId;
  const ids = legalTargetIds(state, actorId, targetKind);
  return ids.map((id) => {
    const player = state.players.find((row) => row.id === id);
    if (player) {
      return {
        id,
        label: `${player.name} (Player)`
      };
    }

    const card = state.cardInstances[id];
    if (card) {
      return {
        id,
        label: `${card.definition.name} (${card.currentZone})`
      };
    }

    return {
      id,
      label: id
    };
  });
}

function actionLabel(state: GameState, action: LegalAction): string {
  if (action.type === "PASS_PRIORITY") {
    return "Pass Priority";
  }

  if (action.type === "PLAY_LAND") {
    return `Play Land: ${cardName(state, action.cardId)}`;
  }

  if (action.type === "CAST_SPELL") {
    const sourceLabel = action.sourceZone === "command" ? " (Command Zone)" : "";
    return `Cast: ${cardName(state, action.cardId)}${sourceLabel}`;
  }

  if (action.type === "ACTIVATE_ABILITY") {
    const source = state.cardInstances[action.sourceCardId];
    const behavior = source ? engine.cardDatabase.getBehavior(source.definition.behaviorId) : null;
    const ability = behavior?.activatedAbilities.find((item) => item.id === action.abilityId);
    return `Activate: ${source?.definition.name ?? action.sourceCardId}${ability ? ` - ${ability.text}` : ""}`;
  }

  if (action.type === "ATTACK_DECLARE") {
    return "Declare Attackers";
  }

  return "Declare Blockers";
}

function actionGroup(action: LegalAction): ActionDescriptor["group"] {
  if (action.type === "PASS_PRIORITY") return "priority";
  if (action.type === "PLAY_LAND") return "land";
  if (action.type === "CAST_SPELL") return "cast";
  if (action.type === "ACTIVATE_ABILITY") return "ability";
  return "combat";
}

function withTargets(action: LegalAction, targetIds: string[]): EngineAction {
  if (action.type === "CAST_SPELL") {
    return {
      ...action,
      targetIds
    };
  }

  if (action.type === "ACTIVATE_ABILITY") {
    return {
      ...action,
      targetIds
    };
  }

  return action;
}

function starterDecks(): CreateGameInput {
  return {
    format: "commander",
    players: [
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" }
    ],
    decks: {
      p1: [
        { card: engine.cardDatabase.getCardByName("Captain Verity")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Shock")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Elvish Visionary")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Divination")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Counterspell")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Arcane Signet")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Forest")!, qty: 5 },
        { card: engine.cardDatabase.getCardByName("Island")!, qty: 3 },
        { card: engine.cardDatabase.getCardByName("Plains")!, qty: 3 },
        { card: engine.cardDatabase.getCardByName("Mountain")!, qty: 2 }
      ],
      p2: [
        { card: engine.cardDatabase.getCardByName("Ravager of Embers")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Murder")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Doom Blade")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Llanowar Elves")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Sol Ring")!, qty: 1 },
        { card: engine.cardDatabase.getCardByName("Forest")!, qty: 7 },
        { card: engine.cardDatabase.getCardByName("Mountain")!, qty: 4 },
        { card: engine.cardDatabase.getCardByName("Swamp")!, qty: 3 }
      ]
    },
    commanders: {
      p1: ["Captain Verity"],
      p2: ["Ravager of Embers"]
    },
    seed: "rules-sandbox"
  };
}

export const engineClient = {
  createSandboxGame(seed?: string): GameState {
    const config = starterDecks();
    const state = engine.createGame({
      ...config,
      seed: seed ?? String(config.seed)
    });

    // Timeline baseline at index 0 starts from this board state.
    return {
      ...state,
      log: []
    };
  },

  getLegalActions(state: GameState): LegalAction[] {
    const holder = state.priorityHolderPlayerId;
    if (!holder) {
      return [];
    }

    return engine.getLegalActions(state, holder);
  },

  describeLegalActions(state: GameState): ActionDescriptor[] {
    return this.getLegalActions(state).map((action) => {
      const targetKind = targetKindForAction(state, action);
      const targetOptions = targetOptionsForAction(state, action);
      return {
        action,
        label: actionLabel(state, action),
        group: actionGroup(action),
        requiresTargets: targetKind !== "NONE",
        requiredTargetCount: targetCountForKind(targetKind),
        targetOptions
      };
    });
  },

  applyAction(state: GameState, action: LegalAction, targetIds: string[] = []): GameState {
    return engine.applyAction(state, withTargets(action, targetIds));
  },

  step(state: GameState): GameState {
    return engine.step(state);
  },

  passPriority(state: GameState): GameState {
    if (!state.priorityHolderPlayerId) {
      return state;
    }

    return engine.applyAction(state, {
      type: "PASS_PRIORITY",
      playerId: state.priorityHolderPlayerId
    });
  },

  runNextStep(state: GameState): GameState {
    const startStep = state.step;
    let next = state;
    for (let i = 0; i < 100; i += 1) {
      const stepped = engine.step(next);
      if (stepped.step !== startStep || stepped.turnNumber !== next.turnNumber) {
        return stepped;
      }

      if (stepped.priorityHolderPlayerId) {
        return stepped;
      }

      next = stepped;
    }

    return next;
  },

  runNextTurn(state: GameState): GameState {
    const startTurn = state.turnNumber;
    let next = state;
    for (let i = 0; i < 400; i += 1) {
      next = engine.step(next);
      if (next.turnNumber > startTurn) {
        break;
      }

      if (next.priorityHolderPlayerId) {
        next = engine.applyAction(next, {
          type: "PASS_PRIORITY",
          playerId: next.priorityHolderPlayerId
        });
      }
    }

    return next;
  },

  autoResolveStack(state: GameState): GameState {
    let next = state;
    for (let i = 0; i < 400; i += 1) {
      if (next.pendingChoices.length > 0) {
        break;
      }

      if (next.stack.length === 0) {
        break;
      }

      if (!next.priorityHolderPlayerId) {
        next = engine.step(next);
        continue;
      }

      next = engine.applyAction(next, {
        type: "PASS_PRIORITY",
        playerId: next.priorityHolderPlayerId
      });
    }

    return next;
  },

  chooseReplacement(state: GameState, choiceId: string, optionId: "APPLY_REPLACEMENT" | "KEEP_EVENT"): GameState {
    const choice = state.pendingChoices.find((item) => item.id === choiceId);
    if (!choice) {
      return state;
    }

    return engine.applyAction(state, {
      type: "CHOOSE_REPLACEMENT",
      playerId: choice.playerId,
      choiceId,
      optionId
    });
  },

  replay(initialState: GameState, events: GameLogEvent[], upToIndex: number): GameState {
    return engine.replay(initialState, events, upToIndex);
  },

  simulate(input: SimulationInput): SimulationResult {
    return engine.simulate(input);
  }
};

export type { GameLogEvent, GameState, LegalAction, SimulationInput, SimulationResult, TargetOption };
