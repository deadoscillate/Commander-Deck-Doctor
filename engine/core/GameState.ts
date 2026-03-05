import { appendLog } from "./Logger";
import { addPendingChoice, applyReplacementPipeline } from "./ReplacementEffects";
import { createRngState, shuffleDeterministic } from "./RNG";
import { createPlayerState } from "./PlayerState";
import { removeContinuousEffectsBySource } from "./ContinuousEffects";
import { zonePopTop, zonePushTop, zoneRemoveCard } from "./Zone";
import type {
  CardDefinition,
  CardInstance,
  CommanderState,
  CreateGameInput,
  GameState,
  PlayerState,
  ZoneChangeEvent,
  ZoneName,
  RulesVersionMetadata
} from "./types";

const DEFAULT_RULES_VERSION: RulesVersionMetadata = {
  comprehensiveRules: {
    source: "https://magic.wizards.com/en/rules",
    versionTag: "latest-known"
  },
  commanderRules: {
    source: "https://mtgcommander.net/index.php/rules/",
    versionTag: "latest-known"
  },
  scryfallSchema: {
    source: "https://scryfall.com/docs/api/cards",
    versionTag: "latest-known"
  }
};

type IdTracker = {
  nextCardId: number;
};

function mergeRulesVersion(input?: Partial<RulesVersionMetadata>): RulesVersionMetadata {
  if (!input) {
    return DEFAULT_RULES_VERSION;
  }

  return {
    comprehensiveRules: {
      ...DEFAULT_RULES_VERSION.comprehensiveRules,
      ...(input.comprehensiveRules ?? {})
    },
    commanderRules: {
      ...DEFAULT_RULES_VERSION.commanderRules,
      ...(input.commanderRules ?? {})
    },
    scryfallSchema: {
      ...DEFAULT_RULES_VERSION.scryfallSchema,
      ...(input.scryfallSchema ?? {})
    }
  };
}

function instantiateCard(
  tracker: IdTracker,
  definition: CardDefinition,
  ownerId: string,
  zone: ZoneName
): CardInstance {
  const cardId = `card-${tracker.nextCardId}`;
  tracker.nextCardId += 1;

  return {
    id: cardId,
    definition,
    ownerId,
    controllerId: ownerId,
    currentZone: zone,
    tapped: false,
    damageMarked: 0,
    counters: {},
    isToken: false,
    summoningSick: zone === "battlefield",
    attachedToId: null,
    castFromCommandZoneCount: 0
  };
}

function putCardInZone(player: PlayerState, zone: ZoneName, cardId: string): PlayerState {
  return {
    ...player,
    zones: {
      ...player.zones,
      [zone]: zonePushTop(player.zones[zone], cardId)
    }
  };
}

function removeCardFromPlayerZones(player: PlayerState, cardId: string): PlayerState {
  const zones = {
    library: zoneRemoveCard(player.zones.library, cardId),
    hand: zoneRemoveCard(player.zones.hand, cardId),
    battlefield: zoneRemoveCard(player.zones.battlefield, cardId),
    graveyard: zoneRemoveCard(player.zones.graveyard, cardId),
    exile: zoneRemoveCard(player.zones.exile, cardId),
    stack: zoneRemoveCard(player.zones.stack, cardId),
    command: zoneRemoveCard(player.zones.command, cardId)
  };

  return {
    ...player,
    zones
  };
}

export function activePlayerId(state: GameState): string {
  return state.players[state.activePlayerIndex]?.id ?? "";
}

export function findPlayerIndex(state: GameState, playerId: string): number {
  return state.players.findIndex((player) => player.id === playerId);
}

export function getPlayer(state: GameState, playerId: string): PlayerState | null {
  return state.players.find((player) => player.id === playerId) ?? null;
}

export function updatePlayer(state: GameState, playerId: string, updater: (player: PlayerState) => PlayerState): GameState {
  const players = state.players.map((player) => (player.id === playerId ? updater(player) : player));
  return {
    ...state,
    players
  };
}

export function updateCard(state: GameState, cardId: string, updater: (card: CardInstance) => CardInstance): GameState {
  const card = state.cardInstances[cardId];
  if (!card) {
    return state;
  }

  return {
    ...state,
    cardInstances: {
      ...state.cardInstances,
      [cardId]: updater(card)
    }
  };
}

export function removeCardFromAllZones(state: GameState, cardId: string): GameState {
  return {
    ...state,
    players: state.players.map((player) => removeCardFromPlayerZones(player, cardId))
  };
}

function zoneOwnerForCard(card: CardInstance, zone: ZoneName): string {
  if (zone === "battlefield" || zone === "stack") {
    return card.controllerId;
  }

  return card.ownerId;
}

export function moveCardBetweenZones(
  state: GameState,
  event: ZoneChangeEvent,
  options: { skipReplacement?: boolean } = {}
): GameState {
  const card = state.cardInstances[event.cardId];
  if (!card) {
    return state;
  }

  let resolvedEvent = event;
  if (!options.skipReplacement) {
    const replacement = applyReplacementPipeline(state, event);
    if (replacement.outcome === "CHOICE_REQUIRED") {
      const withChoice = addPendingChoice(state, replacement.choice);
      return appendLog(withChoice, "CHOICE_REQUIRED", {
        choiceId: replacement.choice.id,
        replacementEffectId: replacement.choice.replacementEffectId,
        cardId: event.cardId,
        from: event.from,
        to: event.to
      });
    }

    if (replacement.outcome === "REPLACED") {
      resolvedEvent = replacement.event;
      state = appendLog(state, "REPLACEMENT_APPLIED", {
        replacementEffectId: replacement.replacementEffectId,
        cardId: event.cardId,
        from: event.from,
        to: replacement.event.to
      });
    }
  }

  const removed = removeCardFromAllZones(state, event.cardId);
  const destinationControllerId = zoneOwnerForCard(card, resolvedEvent.to);
  let moved = updatePlayer(removed, destinationControllerId, (player) =>
    putCardInZone(player, resolvedEvent.to, event.cardId)
  );

  moved = updateCard(moved, event.cardId, (current) => ({
    ...current,
    currentZone: resolvedEvent.to,
    controllerId: resolvedEvent.to === "battlefield" ? current.controllerId : current.ownerId,
    tapped: resolvedEvent.to === "battlefield" ? current.tapped : false,
    damageMarked: resolvedEvent.to === "battlefield" ? current.damageMarked : 0,
    summoningSick: resolvedEvent.to === "battlefield"
  }));

  if (resolvedEvent.from === "battlefield" && resolvedEvent.to !== "battlefield") {
    moved = removeContinuousEffectsBySource(moved, event.cardId);
  }

  return appendLog(moved, "ZONE_CHANGE", {
    cardId: event.cardId,
    cardName: card.definition.name,
    from: resolvedEvent.from,
    to: resolvedEvent.to,
    reason: resolvedEvent.reason
  });
}

export function drawCard(state: GameState, playerId: string, count = 1): GameState {
  let next = state;

  for (let i = 0; i < count; i += 1) {
    const player = getPlayer(next, playerId);
    if (!player) {
      return next;
    }

    const popped = zonePopTop(player.zones.library);
    if (!popped.cardId) {
      next = appendLog(next, "DRAW_FROM_EMPTY_LIBRARY", { playerId });
      continue;
    }

    next = updatePlayer(next, playerId, (current) => ({
      ...current,
      zones: {
        ...current.zones,
        library: popped.zone
      }
    }));

    const card = next.cardInstances[popped.cardId];
    next = moveCardBetweenZones(
      next,
      {
        kind: "ZONE_CHANGE",
        cardId: popped.cardId,
        from: "library",
        to: "hand",
        reason: "DRAW",
        controllerId: card?.controllerId ?? playerId,
        ownerId: card?.ownerId ?? playerId
      },
      {
        skipReplacement: true
      }
    );

    next = appendLog(next, "DRAW_CARD", {
      playerId,
      cardId: popped.cardId,
      cardName: card?.definition.name ?? "Unknown"
    });
  }

  return next;
}

export function adjustPlayerLife(state: GameState, playerId: string, delta: number, reason: string): GameState {
  let next = updatePlayer(state, playerId, (player) => ({
    ...player,
    life: player.life + delta
  }));

  next = appendLog(next, delta >= 0 ? "LIFE_GAIN" : "LIFE_LOSS", {
    playerId,
    amount: Math.abs(delta),
    reason
  });

  return next;
}

export function markDamageOnCard(state: GameState, cardId: string, amount: number): GameState {
  if (amount <= 0) {
    return state;
  }

  return updateCard(state, cardId, (card) => ({
    ...card,
    damageMarked: card.damageMarked + amount
  }));
}

function buildCommanderState(state: GameState, commandersByPlayer: Record<string, string[]>): CommanderState {
  const castCountByCommanderId: Record<string, number> = {};
  const damageByCommanderToPlayer: CommanderState["damageByCommanderToPlayer"] = {};

  for (const commanderIds of Object.values(commandersByPlayer)) {
    for (const commanderId of commanderIds) {
      castCountByCommanderId[commanderId] = 0;
      damageByCommanderToPlayer[commanderId] = {};
      for (const player of state.players) {
        damageByCommanderToPlayer[commanderId][player.id] = 0;
      }
    }
  }

  return {
    commanderIdsByPlayer: commandersByPlayer,
    castCountByCommanderId,
    damageByCommanderToPlayer
  };
}

function moveCommanderToCommandZone(state: GameState, commanderId: string): GameState {
  const card = state.cardInstances[commanderId];
  if (!card) {
    return state;
  }

  return moveCardBetweenZones(
    state,
    {
      kind: "ZONE_CHANGE",
      cardId: commanderId,
      from: card.currentZone,
      to: "command",
      reason: "UNKNOWN",
      controllerId: card.controllerId,
      ownerId: card.ownerId
    },
    { skipReplacement: true }
  );
}

function locateCardByNameInPlayerZones(state: GameState, playerId: string, name: string): string | null {
  const player = getPlayer(state, playerId);
  if (!player) {
    return null;
  }

  const idSets = [
    ...player.zones.library.cardIds,
    ...player.zones.hand.cardIds,
    ...player.zones.command.cardIds
  ];

  const normalized = name.toLowerCase();
  for (const cardId of idSets) {
    const card = state.cardInstances[cardId];
    if (!card) {
      continue;
    }

    if (card.definition.name.toLowerCase() === normalized) {
      return cardId;
    }
  }

  return null;
}

export function createGameState(input: CreateGameInput): GameState {
  const rng = createRngState(input.seed);
  const idTracker: IdTracker = { nextCardId: 1 };
  const players = input.players.map((player) => createPlayerState(player, 40));
  let state: GameState = {
    id: `game-${Date.now()}`,
    format: "commander",
    players,
    cardInstances: {},
    activePlayerIndex: 0,
    turnNumber: 1,
    step: "MAIN1",
    priorityHolderPlayerId: input.players[0]?.id ?? null,
    passedPriorityPlayerIds: [],
    stack: [],
    replacementEffects: [],
    triggerQueue: [],
    continuousEffects: [],
    pendingChoices: [],
    combat: {
      assignments: [],
      declared: false
    },
    commander: {
      commanderIdsByPlayer: {},
      castCountByCommanderId: {},
      damageByCommanderToPlayer: {}
    },
    rulesVersion: mergeRulesVersion(input.rulesVersion),
    rng,
    log: []
  };

  for (const player of input.players) {
    const list = input.decks[player.id] ?? [];
    for (const entry of list) {
      for (let i = 0; i < entry.qty; i += 1) {
        const card = instantiateCard(idTracker, entry.card, player.id, "library");
        state = {
          ...state,
          cardInstances: {
            ...state.cardInstances,
            [card.id]: card
          }
        };
        state = updatePlayer(state, player.id, (current) => putCardInZone(current, "library", card.id));
      }
    }
  }

  const commandersByPlayer: Record<string, string[]> = {};
  for (const player of input.players) {
    const commanderNames = input.commanders[player.id] ?? [];
    const commanderIds: string[] = [];

    for (const commanderName of commanderNames) {
      const foundId = locateCardByNameInPlayerZones(state, player.id, commanderName);
      if (foundId) {
        commanderIds.push(foundId);
      }
    }

    commandersByPlayer[player.id] = commanderIds;
  }

  for (const commanderIds of Object.values(commandersByPlayer)) {
    for (const commanderId of commanderIds) {
      state = moveCommanderToCommandZone(state, commanderId);
      const card = state.cardInstances[commanderId];
      if (!card) {
        continue;
      }

      state = {
        ...state,
        replacementEffects: [
          ...state.replacementEffects,
          {
            id: `repl-cmdr-${commanderId}`,
            sourceCardId: commanderId,
            controllerId: card.ownerId,
            kind: "COMMANDER_MOVE_TO_COMMAND_ZONE",
            active: true,
            params: {
              commanderId,
              ownerId: card.ownerId,
              commanderName: card.definition.name
            }
          }
        ]
      };
    }
  }

  state = {
    ...state,
    commander: buildCommanderState(state, commandersByPlayer)
  };

  for (const player of state.players) {
    const shuffled = shuffleDeterministic(player.zones.library.cardIds, state.rng);
    state = {
      ...state,
      rng: shuffled.state
    };
    state = updatePlayer(state, player.id, (current) => ({
      ...current,
      zones: {
        ...current.zones,
        library: {
          ...current.zones.library,
          cardIds: shuffled.items
        }
      }
    }));
  }

  for (const player of state.players) {
    state = drawCard(state, player.id, 7);
  }

  state = appendLog(state, "GAME_START", {
    format: state.format,
    players: state.players.map((player) => ({ id: player.id, name: player.name })),
    seed: state.rng.seed
  });

  return state;
}
