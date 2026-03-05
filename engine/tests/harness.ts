import fs from "node:fs/promises";
import path from "node:path";
import { createEngine } from "../index";
import type { CardDefinition, CreateGameInput, EngineAction, GameState } from "../core/types";

type DeckEntryFixture = {
  name: string;
  qty: number;
};

type ScenarioActionFixture =
  | {
      type: "PLAY_LAND";
      playerId: string;
      cardName: string;
    }
  | {
      type: "CAST_SPELL";
      playerId: string;
      cardName: string;
      sourceZone: "hand" | "command";
      targetName?: string;
      targetPlayerId?: string;
    }
  | {
      type: "ACTIVATE_ABILITY";
      playerId: string;
      sourceName: string;
      abilityId: string;
      targetName?: string;
      targetPlayerId?: string;
    }
  | {
      type: "PASS_PRIORITY";
      playerId: string;
    }
  | {
      type: "CHOOSE_REPLACEMENT";
      playerId: string;
      optionId: "APPLY_REPLACEMENT" | "KEEP_EVENT";
    }
  | {
      type: "ATTACK_DECLARE";
      playerId: string;
      assignments: Array<{
        attackerName: string;
        defenderPlayerId: string;
      }>;
    }
  | {
      type: "BLOCK_DECLARE";
      playerId: string;
      assignments: Array<{
        attackerName: string;
        blockerName: string;
      }>;
    };

export type ScenarioFixture = {
  name: string;
  seed: string;
  players: Array<{
    id: string;
    name: string;
  }>;
  decks: Record<string, DeckEntryFixture[]>;
  commanders: Record<string, string[]>;
  actions: ScenarioActionFixture[];
};

function cardByNameInZones(state: GameState, playerId: string, cardName: string): string {
  const normalized = cardName.toLowerCase();
  const player = state.players.find((row) => row.id === playerId);
  if (!player) {
    throw new Error(`Unknown player ${playerId}`);
  }

  const zonesToSearch = [
    ...player.zones.hand.cardIds,
    ...player.zones.command.cardIds,
    ...player.zones.battlefield.cardIds,
    ...player.zones.graveyard.cardIds,
    ...player.zones.library.cardIds
  ];

  for (const cardId of zonesToSearch) {
    const card = state.cardInstances[cardId];
    if (card?.definition.name.toLowerCase() === normalized) {
      return cardId;
    }
  }

  throw new Error(`Card not found for player ${playerId}: ${cardName}`);
}

function targetIdFromFixture(
  state: GameState,
  playerId: string,
  targetName?: string,
  targetPlayerId?: string
): string[] {
  if (targetPlayerId) {
    return [targetPlayerId];
  }

  if (targetName) {
    return [cardByNameInZones(state, playerId, targetName)];
  }

  return [];
}

function resolveAction(state: GameState, fixture: ScenarioActionFixture): EngineAction {
  if (fixture.type === "PLAY_LAND") {
    return {
      type: "PLAY_LAND",
      playerId: fixture.playerId,
      cardId: cardByNameInZones(state, fixture.playerId, fixture.cardName)
    };
  }

  if (fixture.type === "CAST_SPELL") {
    return {
      type: "CAST_SPELL",
      playerId: fixture.playerId,
      cardId: cardByNameInZones(state, fixture.playerId, fixture.cardName),
      sourceZone: fixture.sourceZone,
      targetIds: targetIdFromFixture(state, fixture.playerId, fixture.targetName, fixture.targetPlayerId)
    };
  }

  if (fixture.type === "ACTIVATE_ABILITY") {
    return {
      type: "ACTIVATE_ABILITY",
      playerId: fixture.playerId,
      sourceCardId: cardByNameInZones(state, fixture.playerId, fixture.sourceName),
      abilityId: fixture.abilityId,
      targetIds: targetIdFromFixture(state, fixture.playerId, fixture.targetName, fixture.targetPlayerId)
    };
  }

  if (fixture.type === "PASS_PRIORITY") {
    return {
      type: "PASS_PRIORITY",
      playerId: fixture.playerId
    };
  }

  if (fixture.type === "CHOOSE_REPLACEMENT") {
    const choice = state.pendingChoices.find((item) => item.playerId === fixture.playerId);
    if (!choice) {
      throw new Error(`No replacement choice for ${fixture.playerId}`);
    }

    return {
      type: "CHOOSE_REPLACEMENT",
      playerId: fixture.playerId,
      choiceId: choice.id,
      optionId: fixture.optionId
    };
  }

  if (fixture.type === "ATTACK_DECLARE") {
    return {
      type: "ATTACK_DECLARE",
      playerId: fixture.playerId,
      assignments: fixture.assignments.map((assignment) => ({
        attackerId: cardByNameInZones(state, fixture.playerId, assignment.attackerName),
        defenderPlayerId: assignment.defenderPlayerId
      }))
    };
  }

  return {
    type: "BLOCK_DECLARE",
    playerId: fixture.playerId,
    assignments: fixture.assignments.map((assignment) => ({
      attackerId: cardByNameInZones(state, fixture.playerId, assignment.attackerName),
      blockerId: cardByNameInZones(state, fixture.playerId, assignment.blockerName)
    }))
  };
}

function toDeckInput(cardsByPlayer: Record<string, DeckEntryFixture[]>): CreateGameInput["decks"] {
  const engine = createEngine();
  const decks: CreateGameInput["decks"] = {};

  for (const [playerId, entries] of Object.entries(cardsByPlayer)) {
    const resolved: Array<{ card: CardDefinition; qty: number }> = [];

    for (const entry of entries) {
      const card = engine.cardDatabase.getCardByName(entry.name);
      if (!card) {
        throw new Error(`Card not found in database: ${entry.name}`);
      }

      resolved.push({ card, qty: entry.qty });
    }

    decks[playerId] = resolved;
  }

  return decks;
}

export async function loadFixture(filePath: string): Promise<ScenarioFixture> {
  const absolute = path.resolve(filePath);
  const raw = await fs.readFile(absolute, "utf8");
  return JSON.parse(raw) as ScenarioFixture;
}

export function runScenario(fixture: ScenarioFixture): { finalState: GameState; log: GameState["log"] } {
  const engine = createEngine();
  let state = engine.createGame({
    format: "commander",
    players: fixture.players,
    decks: toDeckInput(fixture.decks),
    commanders: fixture.commanders,
    seed: fixture.seed
  });

  for (const actionFixture of fixture.actions) {
    const action = resolveAction(state, actionFixture);
    state = engine.applyAction(state, action);
    state = engine.step(state);
  }

  return {
    finalState: state,
    log: state.log.map((entry) => ({
      seq: entry.seq,
      turn: entry.turn,
      step: entry.step,
      type: entry.type,
      payload: entry.payload
    }))
  };
}
