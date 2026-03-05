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
import { parseDecklistWithCommander } from "@/lib/decklist";
import { SANDBOX_DEMO_DECKS } from "@/lib/sandboxDecklists";

type TargetOption = {
  id: string;
  label: string;
};

export type SandboxPlayerSetup = {
  name: string;
  decklist: string;
  commanderName?: string | null;
};

export type SandboxCreateInput = {
  seed?: string;
  players: SandboxPlayerSetup[];
};

export type SandboxCreateResult = {
  state: GameState;
  warnings: string[];
  unknownCardsByPlayer: Record<string, string[]>;
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

function defaultSandboxPlayers(): SandboxPlayerSetup[] {
  return [
    {
      name: "Alice",
      decklist: SANDBOX_DEMO_DECKS.playerOne,
      commanderName: "Captain Verity"
    },
    {
      name: "Bob",
      decklist: SANDBOX_DEMO_DECKS.playerTwo,
      commanderName: "Ravager of Embers"
    }
  ];
}

function normalizeSandboxPlayers(players: SandboxPlayerSetup[]): SandboxPlayerSetup[] {
  return players.map((player, index) => ({
    name: player.name.trim() || `Player ${index + 1}`,
    decklist: player.decklist,
    commanderName: player.commanderName?.trim() ? player.commanderName.trim() : null
  }));
}

function createGameInputFromSandboxSetup(input: SandboxCreateInput): {
  gameInput: CreateGameInput;
  warnings: string[];
  unknownCardsByPlayer: Record<string, string[]>;
} {
  const normalizedPlayers = normalizeSandboxPlayers(input.players);
  if (normalizedPlayers.length < 2 || normalizedPlayers.length > 4) {
    throw new Error("Rules Sandbox supports 2 to 4 players.");
  }

  const warnings: string[] = [];
  const unknownCardsByPlayer: Record<string, string[]> = {};
  const players: CreateGameInput["players"] = [];
  const decks: CreateGameInput["decks"] = {};
  const commanders: CreateGameInput["commanders"] = {};

  normalizedPlayers.forEach((player, index) => {
    const id = `p${index + 1}`;
    players.push({
      id,
      name: player.name
    });

    const parsed = parseDecklistWithCommander(player.decklist ?? "");
    if (parsed.entries.length === 0) {
      throw new Error(`${player.name}: decklist is empty or could not be parsed.`);
    }

    const resolved: Array<{ card: NonNullable<ReturnType<typeof engine.cardDatabase.getCardByName>>; qty: number }> = [];
    const unknown: string[] = [];
    for (const entry of parsed.entries) {
      const card = engine.cardDatabase.getCardByName(entry.name);
      if (!card) {
        unknown.push(entry.name);
        continue;
      }

      resolved.push({
        card,
        qty: entry.qty
      });
    }

    if (resolved.length === 0) {
      throw new Error(`${player.name}: no recognized cards found for the current engine card set.`);
    }

    if (unknown.length > 0) {
      warnings.push(`${player.name}: omitted ${unknown.length} unknown card name(s).`);
    }

    const commanderFromInput = player.commanderName ?? parsed.commanderFromSection ?? null;
    if (commanderFromInput) {
      const commanderCard = engine.cardDatabase.getCardByName(commanderFromInput);
      if (!commanderCard) {
        warnings.push(`${player.name}: commander "${commanderFromInput}" is unknown to the engine.`);
      } else {
        const alreadyInDeck = resolved.some(
          (entry) => entry.card.name.toLowerCase() === commanderCard.name.toLowerCase()
        );
        if (!alreadyInDeck) {
          resolved.unshift({
            card: commanderCard,
            qty: 1
          });
          warnings.push(`${player.name}: added commander ${commanderCard.name} to decklist for sandbox setup.`);
        }

        commanders[id] = [commanderCard.name];
      }
    } else {
      commanders[id] = [];
    }

    decks[id] = resolved;
    unknownCardsByPlayer[id] = unknown;
  });

  return {
    gameInput: {
      format: "commander",
      players,
      decks,
      commanders,
      seed: input.seed ?? "rules-sandbox"
    },
    warnings,
    unknownCardsByPlayer
  };
}

export const engineClient = {
  createSandboxGame(seed?: string): GameState {
    const result = this.createSandboxGameFromDecklists({
      seed,
      players: defaultSandboxPlayers()
    });
    return result.state;
  },

  createSandboxGameFromDecklists(input: SandboxCreateInput): SandboxCreateResult {
    const prepared = createGameInputFromSandboxSetup(input);
    const state = engine.createGame({
      ...prepared.gameInput,
      seed: input.seed ?? String(prepared.gameInput.seed)
    });

    return {
      state: {
        ...state,
        log: []
      },
      warnings: prepared.warnings,
      unknownCardsByPlayer: prepared.unknownCardsByPlayer
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
