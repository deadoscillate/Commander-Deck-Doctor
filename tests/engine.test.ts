import { describe, expect, it } from "vitest";
import { createEngine } from "@/engine";
import { createZoneChangeEvent } from "@/engine/core/Event";
import { moveCardBetweenZones, updatePlayer } from "@/engine/core/GameState";
import type { CreateGameInput, GameState, ManaPool, ZoneName } from "@/engine/core/types";

function manaPool(values: Partial<ManaPool>): ManaPool {
  return {
    W: values.W ?? 0,
    U: values.U ?? 0,
    B: values.B ?? 0,
    R: values.R ?? 0,
    G: values.G ?? 0,
    C: values.C ?? 0
  };
}

function buildDeck(
  engine: ReturnType<typeof createEngine>,
  rows: Array<{ name: string; qty: number }>
): Array<{ card: NonNullable<ReturnType<typeof engine.cardDatabase.getCardByName>>; qty: number }> {
  return rows.map((row) => {
    const card = engine.cardDatabase.getCardByName(row.name);
    if (!card) {
      throw new Error(`Missing card in engine DB: ${row.name}`);
    }

    return {
      card,
      qty: row.qty
    };
  });
}

function createBaseGame(engine: ReturnType<typeof createEngine>, decks: CreateGameInput["decks"], commanders: Record<string, string[]>) {
  return engine.createGame({
    format: "commander",
    players: [
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" }
    ],
    decks,
    commanders,
    seed: "engine-tests"
  });
}

function findCardInZone(state: GameState, playerId: string, zone: ZoneName, name: string): string {
  const player = state.players.find((row) => row.id === playerId);
  if (!player) {
    throw new Error(`Unknown player ${playerId}`);
  }

  const target = player.zones[zone].cardIds.find((cardId) => state.cardInstances[cardId]?.definition.name === name);
  if (!target) {
    throw new Error(`Card ${name} not found in ${playerId} ${zone}`);
  }

  return target;
}

describe("engine core loop + commander layer", () => {
  it("ships a template/script-backed engine card set (>=30 cards)", () => {
    const engine = createEngine();
    const cards = engine.cardDatabase.allCards();
    const behaviorBackedCards = cards.filter((card) => typeof card.behaviorId === "string" && card.behaviorId.length > 0);

    expect(cards.length).toBeGreaterThanOrEqual(30);
    expect(behaviorBackedCards.length).toBeGreaterThanOrEqual(30);
  });

  it("casts an instant, uses stack/priority, and resolves to graveyard", () => {
    const engine = createEngine();
    let state = createBaseGame(
      engine,
      {
        p1: buildDeck(engine, [
          { name: "Captain Verity", qty: 1 },
          { name: "Shock", qty: 1 },
          { name: "Mountain", qty: 6 }
        ]),
        p2: buildDeck(engine, [
          { name: "Ravager of Embers", qty: 1 },
          { name: "Forest", qty: 7 }
        ])
      },
      {
        p1: ["Captain Verity"],
        p2: ["Ravager of Embers"]
      }
    );

    const mountainId = findCardInZone(state, "p1", "hand", "Mountain");
    const shockId = findCardInZone(state, "p1", "hand", "Shock");

    state = engine.applyAction(state, { type: "PLAY_LAND", playerId: "p1", cardId: mountainId });
    state = engine.applyAction(state, {
      type: "ACTIVATE_ABILITY",
      playerId: "p1",
      sourceCardId: mountainId,
      abilityId: "tap_for_mana",
      targetIds: []
    });
    state = engine.applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: shockId,
      sourceZone: "hand",
      targetIds: ["p2"]
    });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p1" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p2" });

    const bob = state.players.find((row) => row.id === "p2");
    expect(bob?.life).toBe(38);
    expect(state.cardInstances[shockId]?.currentZone).toBe("graveyard");
    expect(state.log.some((entry) => entry.type === "CAST_SPELL")).toBe(true);
    expect(state.log.some((entry) => entry.type === "RESOLVE_SPELL")).toBe(true);
  });

  it("queues and resolves ETB draw trigger after creature resolves", () => {
    const engine = createEngine();
    let state = createBaseGame(
      engine,
      {
        p1: buildDeck(engine, [
          { name: "Captain Verity", qty: 1 },
          { name: "Elvish Visionary", qty: 1 },
          { name: "Forest", qty: 7 }
        ]),
        p2: buildDeck(engine, [
          { name: "Ravager of Embers", qty: 1 },
          { name: "Mountain", qty: 7 }
        ])
      },
      {
        p1: ["Captain Verity"],
        p2: ["Ravager of Embers"]
      }
    );

    const forestId = findCardInZone(state, "p1", "hand", "Forest");
    const visionaryId = findCardInZone(state, "p1", "hand", "Elvish Visionary");

    state = engine.applyAction(state, { type: "PLAY_LAND", playerId: "p1", cardId: forestId });
    state = engine.applyAction(state, {
      type: "ACTIVATE_ABILITY",
      playerId: "p1",
      sourceCardId: forestId,
      abilityId: "tap_for_mana",
      targetIds: []
    });
    state = updatePlayer(state, "p1", (player) => ({
      ...player,
      manaPool: manaPool({ G: 2 })
    }));
    state = engine.applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: visionaryId,
      sourceZone: "hand",
      targetIds: []
    });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p1" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p2" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p1" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p2" });

    expect(state.cardInstances[visionaryId]?.currentZone).toBe("battlefield");
    expect(state.log.some((entry) => entry.type === "RESOLVE_ABILITY" && entry.payload.abilityId === "etb_draw")).toBe(
      true
    );

    const alice = state.players.find((row) => row.id === "p1");
    expect(alice?.zones.hand.cardIds.length).toBe(6);
  });

  it("applies replacement effect pipeline for dies -> exile", () => {
    const engine = createEngine();
    let state = createBaseGame(
      engine,
      {
        p1: buildDeck(engine, [
          { name: "Captain Verity", qty: 1 },
          { name: "Rest in Peace", qty: 1 },
          { name: "Fragile Hatchling", qty: 1 },
          { name: "Plains", qty: 5 }
        ]),
        p2: buildDeck(engine, [
          { name: "Ravager of Embers", qty: 1 },
          { name: "Mountain", qty: 7 }
        ])
      },
      {
        p1: ["Captain Verity"],
        p2: ["Ravager of Embers"]
      }
    );

    const plainsId = findCardInZone(state, "p1", "hand", "Plains");
    const restInPeaceId = findCardInZone(state, "p1", "hand", "Rest in Peace");
    const hatchlingId = findCardInZone(state, "p1", "hand", "Fragile Hatchling");

    state = engine.applyAction(state, { type: "PLAY_LAND", playerId: "p1", cardId: plainsId });
    state = engine.applyAction(state, {
      type: "ACTIVATE_ABILITY",
      playerId: "p1",
      sourceCardId: plainsId,
      abilityId: "tap_for_mana",
      targetIds: []
    });
    state = updatePlayer(state, "p1", (player) => ({
      ...player,
      manaPool: manaPool({ W: 2 })
    }));
    state = engine.applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: restInPeaceId,
      sourceZone: "hand",
      targetIds: []
    });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p1" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p2" });

    state = engine.applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: hatchlingId,
      sourceZone: "hand",
      targetIds: []
    });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p1" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p2" });

    expect(state.cardInstances[hatchlingId]?.currentZone).toBe("exile");
    expect(
      state.log.some((entry) => entry.type === "REPLACEMENT_APPLIED" && entry.payload.cardId === hatchlingId)
    ).toBe(true);
  });

  it("handles commander tax increments, replacement choice, and commander damage lethal", () => {
    const engine = createEngine();
    let state = createBaseGame(
      engine,
      {
        p1: buildDeck(engine, [
          { name: "Colossus Commander", qty: 1 },
          { name: "Plains", qty: 7 }
        ]),
        p2: buildDeck(engine, [
          { name: "Ravager of Embers", qty: 1 },
          { name: "Forest", qty: 7 }
        ])
      },
      {
        p1: ["Colossus Commander"],
        p2: ["Ravager of Embers"]
      }
    );

    const commanderId = findCardInZone(state, "p1", "command", "Colossus Commander");
    const plainsId = findCardInZone(state, "p1", "hand", "Plains");

    state = engine.applyAction(state, { type: "PLAY_LAND", playerId: "p1", cardId: plainsId });
    state = updatePlayer(state, "p1", (player) => ({
      ...player,
      manaPool: manaPool({ W: 1 })
    }));

    state = engine.applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: commanderId,
      sourceZone: "command",
      targetIds: []
    });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p1" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p2" });

    expect(state.commander.castCountByCommanderId[commanderId]).toBe(1);

    state = moveCardBetweenZones(
      state,
      createZoneChangeEvent({
        cardId: commanderId,
        from: "battlefield",
        to: "graveyard",
        reason: "DESTROY",
        controllerId: "p1",
        ownerId: "p1"
      })
    );

    expect(state.pendingChoices.length).toBe(1);

    const choiceId = state.pendingChoices[0]?.id ?? "";
    state = engine.applyAction(state, {
      type: "CHOOSE_REPLACEMENT",
      playerId: "p1",
      choiceId,
      optionId: "APPLY_REPLACEMENT"
    });

    expect(state.cardInstances[commanderId]?.currentZone).toBe("command");

    state = updatePlayer(state, "p1", (player) => ({
      ...player,
      manaPool: manaPool({ W: 3 })
    }));
    state = {
      ...state,
      priorityHolderPlayerId: "p1",
      passedPriorityPlayerIds: [],
      step: "MAIN1"
    };

    state = engine.applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: commanderId,
      sourceZone: "command",
      targetIds: []
    });

    const aliceAfterTax = state.players.find((row) => row.id === "p1");
    expect(aliceAfterTax?.manaPool.W).toBe(1);
    expect(state.commander.castCountByCommanderId[commanderId]).toBe(2);

    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p1" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p2" });

    state = {
      ...state,
      step: "DECLARE_ATTACKERS",
      priorityHolderPlayerId: "p1",
      passedPriorityPlayerIds: []
    };

    state = engine.applyAction(state, {
      type: "ATTACK_DECLARE",
      playerId: "p1",
      assignments: [{ attackerId: commanderId, defenderPlayerId: "p2" }]
    });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p1" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p2" });
    state = engine.applyAction(state, {
      type: "BLOCK_DECLARE",
      playerId: "p2",
      assignments: []
    });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p1" });
    state = engine.applyAction(state, { type: "PASS_PRIORITY", playerId: "p2" });

    const bob = state.players.find((row) => row.id === "p2");
    expect(state.commander.damageByCommanderToPlayer[commanderId]?.p2).toBeGreaterThanOrEqual(21);
    expect(bob?.lost).toBe(true);
    expect(bob?.life).toBeGreaterThan(0);
  });

  it("replays deterministic state snapshots from event timeline indexes", () => {
    const engine = createEngine();
    let state = createBaseGame(
      engine,
      {
        p1: buildDeck(engine, [
          { name: "Captain Verity", qty: 1 },
          { name: "Shock", qty: 1 },
          { name: "Mountain", qty: 6 }
        ]),
        p2: buildDeck(engine, [
          { name: "Ravager of Embers", qty: 1 },
          { name: "Forest", qty: 7 }
        ])
      },
      {
        p1: ["Captain Verity"],
        p2: ["Ravager of Embers"]
      }
    );

    state = {
      ...state,
      log: []
    };

    const initialState = structuredClone(state) as GameState;
    const mountainId = findCardInZone(state, "p1", "hand", "Mountain");
    const shockId = findCardInZone(state, "p1", "hand", "Shock");

    const actions = [
      { type: "PLAY_LAND", playerId: "p1", cardId: mountainId } as const,
      {
        type: "ACTIVATE_ABILITY",
        playerId: "p1",
        sourceCardId: mountainId,
        abilityId: "tap_for_mana",
        targetIds: []
      } as const,
      {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: shockId,
        sourceZone: "hand",
        targetIds: ["p2"]
      } as const,
      { type: "PASS_PRIORITY", playerId: "p1" } as const,
      { type: "PASS_PRIORITY", playerId: "p2" } as const
    ];

    for (const action of actions) {
      state = engine.applyAction(state, action);
    }

    const finalEvents = state.log;
    expect(engine.replay(initialState, finalEvents, 0)).toEqual({
      ...initialState,
      log: []
    });

    for (let index = 1; index <= finalEvents.length; index += 1) {
      const sourceEvent = finalEvents[index - 1];
      const expected = {
        ...(sourceEvent.snapshot as GameState),
        log: finalEvents.slice(0, index)
      };

      const replayed = engine.replay(initialState, finalEvents, index);
      expect(replayed).toEqual(expected);
    }

    expect(engine.replay(initialState, finalEvents, finalEvents.length)).toEqual(
      engine.replay(initialState, finalEvents, finalEvents.length)
    );
  });
});
