import type { CardBehavior } from "./Ability";
import { pushToStackTop } from "./Stack";
import type { GameState, QueuedTrigger, TriggerEvent } from "./types";

export type BehaviorLookup = (cardId: string) => CardBehavior | null;

function triggeredAbilitiesForEvent(
  behavior: CardBehavior,
  cardId: string,
  event: TriggerEvent
): Array<{ triggerId: string; sourceCardId: string }> {
  const matches: Array<{ triggerId: string; sourceCardId: string }> = [];

  for (const trigger of behavior.triggeredAbilities) {
    if (trigger.event === "CREATURE_ENTERS_BATTLEFIELD" && event.type === "CREATURE_ENTERS_BATTLEFIELD") {
      matches.push({ triggerId: trigger.id, sourceCardId: cardId });
      continue;
    }

    if (
      trigger.event === "SELF_ENTERS_BATTLEFIELD" &&
      event.type === "CREATURE_ENTERS_BATTLEFIELD" &&
      event.subjectCardId === cardId
    ) {
      matches.push({ triggerId: trigger.id, sourceCardId: cardId });
      continue;
    }

    if (trigger.event === "CARD_MOVES_ZONE" && event.type === "CARD_MOVES_ZONE") {
      matches.push({ triggerId: trigger.id, sourceCardId: cardId });
      continue;
    }

    if (trigger.event === "COMBAT_DAMAGE_TO_PLAYER" && event.type === "COMBAT_DAMAGE_TO_PLAYER") {
      matches.push({ triggerId: trigger.id, sourceCardId: cardId });
    }
  }

  return matches;
}

export function queueTriggersForEvent(
  state: GameState,
  event: TriggerEvent,
  lookupBehavior: BehaviorLookup
): GameState {
  let triggerQueue = [...state.triggerQueue];

  for (const card of Object.values(state.cardInstances)) {
    if (card.currentZone !== "battlefield") {
      continue;
    }

    const behavior = lookupBehavior(card.id);
    if (!behavior || behavior.triggeredAbilities.length === 0) {
      continue;
    }

    const matches = triggeredAbilitiesForEvent(behavior, card.id, event);
    for (const match of matches) {
      const queued: QueuedTrigger = {
        id: `trigger-${state.log.length + triggerQueue.length + 1}`,
        sourceCardId: match.sourceCardId,
        controllerId: card.controllerId,
        triggerId: match.triggerId,
        eventSnapshot: event
      };
      triggerQueue.push(queued);
    }
  }

  return {
    ...state,
    triggerQueue
  };
}

function activePlayerOrder(state: GameState): string[] {
  const alivePlayerIds = state.players.filter((player) => !player.lost).map((player) => player.id);
  if (alivePlayerIds.length === 0) {
    return [];
  }

  const activePlayerId = state.players[state.activePlayerIndex]?.id ?? "";
  const activeIndex = alivePlayerIds.indexOf(activePlayerId);
  if (activeIndex < 0) {
    return alivePlayerIds;
  }

  return [...alivePlayerIds.slice(activeIndex), ...alivePlayerIds.slice(0, activeIndex)];
}

function triggersInApnapOrder(state: GameState, queue: QueuedTrigger[]): QueuedTrigger[] {
  if (queue.length <= 1) {
    return queue;
  }

  const byController = new Map<string, QueuedTrigger[]>();
  for (const trigger of queue) {
    const existing = byController.get(trigger.controllerId) ?? [];
    existing.push(trigger);
    byController.set(trigger.controllerId, existing);
  }

  const ordered: QueuedTrigger[] = [];
  const controllerOrder = activePlayerOrder(state);
  const controllerSet = new Set(controllerOrder);

  for (const controllerId of controllerOrder) {
    const triggers = byController.get(controllerId);
    if (!triggers) {
      continue;
    }

    ordered.push(...triggers);
  }

  for (const [controllerId, triggers] of byController.entries()) {
    if (controllerSet.has(controllerId)) {
      continue;
    }

    ordered.push(...triggers);
  }

  return ordered;
}

export function flushTriggerQueueToStack(state: GameState): GameState {
  let next = state;
  const queue = triggersInApnapOrder(state, state.triggerQueue);

  for (const queued of queue) {
    next = pushToStackTop(next, {
      kind: "ABILITY",
      id: `stack-${queued.id}`,
      sourceCardId: queued.sourceCardId,
      controllerId: queued.controllerId,
      abilityId: queued.triggerId,
      targetIds: []
    });
  }

  return {
    ...next,
    triggerQueue: []
  };
}
