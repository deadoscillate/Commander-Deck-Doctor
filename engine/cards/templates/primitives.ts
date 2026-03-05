import { appendLog } from "../../core/Logger";
import { createZoneChangeEvent } from "../../core/Event";
import { adjustPlayerLife, drawCard, markDamageOnCard, moveCardBetweenZones, updateCard } from "../../core/GameState";
import type { GameState } from "../../core/types";

function isPlayerTarget(state: GameState, targetId: string): boolean {
  return state.players.some((player) => player.id === targetId);
}

function isCardTarget(state: GameState, targetId: string): boolean {
  return Boolean(state.cardInstances[targetId]);
}

export function dealDamageToTarget(
  state: GameState,
  sourceCardId: string,
  targetId: string,
  amount: number
): GameState {
  if (amount <= 0) {
    return state;
  }

  let next = state;
  if (isPlayerTarget(next, targetId)) {
    next = adjustPlayerLife(next, targetId, -amount, `Damage from ${sourceCardId}`);
    return appendLog(next, "DAMAGE_TO_PLAYER", {
      sourceCardId,
      targetId,
      amount
    });
  }

  if (isCardTarget(next, targetId)) {
    next = markDamageOnCard(next, targetId, amount);
    return appendLog(next, "DAMAGE_TO_CREATURE", {
      sourceCardId,
      targetId,
      amount
    });
  }

  return next;
}

export function destroyTargetCreature(state: GameState, sourceCardId: string, targetId: string): GameState {
  const card = state.cardInstances[targetId];
  if (!card || card.currentZone !== "battlefield") {
    return state;
  }

  const moved = moveCardBetweenZones(
    state,
    createZoneChangeEvent({
      cardId: targetId,
      from: "battlefield",
      to: "graveyard",
      reason: "DESTROY",
      controllerId: card.controllerId,
      ownerId: card.ownerId
    })
  );

  return appendLog(moved, "DESTROY_EFFECT", {
    sourceCardId,
    targetId,
    targetName: card.definition.name
  });
}

export function drawCards(state: GameState, playerId: string, amount: number): GameState {
  return drawCard(state, playerId, amount);
}

export function gainLife(state: GameState, playerId: string, amount: number): GameState {
  return adjustPlayerLife(state, playerId, amount, "Effect gain life");
}

export function loseLife(state: GameState, playerId: string, amount: number): GameState {
  return adjustPlayerLife(state, playerId, -amount, "Effect lose life");
}

export function addCounter(
  state: GameState,
  cardId: string,
  counterName: string,
  amount: number
): GameState {
  return updateCard(state, cardId, (card) => ({
    ...card,
    counters: {
      ...card.counters,
      [counterName]: (card.counters[counterName] ?? 0) + amount
    }
  }));
}
