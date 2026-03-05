import type { GameState, PendingChoice, ReplacementEffect, ReplacementResult, ZoneChangeEvent } from "./types";

function createReplacementChoice(
  state: GameState,
  effect: ReplacementEffect,
  event: ZoneChangeEvent,
  commanderName: string
): PendingChoice {
  const playerId = String(effect.params.ownerId ?? event.ownerId);
  return {
    id: `choice-${state.log.length + state.pendingChoices.length + 1}`,
    playerId,
    kind: "REPLACEMENT",
    prompt: `${commanderName} would move to ${event.to}. Move it to command zone instead?`,
    replacementEffectId: effect.id,
    pendingEvent: event,
    options: [
      {
        id: "APPLY_REPLACEMENT",
        label: "Move to command zone"
      },
      {
        id: "KEEP_EVENT",
        label: `Move to ${event.to}`
      }
    ]
  };
}

function cardMatchesCommanderEffect(effect: ReplacementEffect, event: ZoneChangeEvent): boolean {
  const commanderId = String(effect.params.commanderId ?? "");
  if (!commanderId || commanderId !== event.cardId) {
    return false;
  }

  if (event.reason === "COMMANDER_REPLACEMENT") {
    return false;
  }

  return event.to === "graveyard" || event.to === "hand" || event.to === "library" || event.to === "exile";
}

function applyDestinationOverride(effect: ReplacementEffect, event: ZoneChangeEvent): ZoneChangeEvent {
  const to = String(effect.params.to ?? event.to) as ZoneChangeEvent["to"];
  return {
    ...event,
    to
  };
}

function matchesDestinationOverride(state: GameState, effect: ReplacementEffect, event: ZoneChangeEvent): boolean {
  const onlyFrom = effect.params.onlyFrom;
  const onlyTo = effect.params.onlyTo;
  const onlyCardType = effect.params.onlyCardType;

  if (typeof onlyFrom === "string" && onlyFrom !== event.from) {
    return false;
  }

  if (typeof onlyTo === "string" && onlyTo !== event.to) {
    return false;
  }

  if (typeof onlyCardType === "string") {
    const card = state.cardInstances[event.cardId];
    if (!card) {
      return false;
    }

    if (!card.definition.parsedTypeLine.types.includes(onlyCardType)) {
      return false;
    }
  }

  return true;
}

/**
 * Runs replacement effects for a zone-change event.
 */
export function applyReplacementPipeline(state: GameState, event: ZoneChangeEvent): ReplacementResult {
  let currentEvent = event;

  for (const effect of state.replacementEffects) {
    if (!effect.active) {
      continue;
    }

    if (effect.kind === "COMMANDER_MOVE_TO_COMMAND_ZONE") {
      if (!cardMatchesCommanderEffect(effect, currentEvent)) {
        continue;
      }

      const commanderName = String(effect.params.commanderName ?? "Commander");
      return {
        outcome: "CHOICE_REQUIRED",
        choice: createReplacementChoice(state, effect, currentEvent, commanderName)
      };
    }

    if (effect.kind === "ZONE_CHANGE_DESTINATION_OVERRIDE") {
      if (!matchesDestinationOverride(state, effect, currentEvent)) {
        continue;
      }

      currentEvent = applyDestinationOverride(effect, currentEvent);
      return {
        outcome: "REPLACED",
        event: currentEvent,
        replacementEffectId: effect.id
      };
    }
  }

  return {
    outcome: "UNCHANGED",
    event: currentEvent
  };
}

export function addPendingChoice(state: GameState, choice: PendingChoice): GameState {
  return {
    ...state,
    pendingChoices: [...state.pendingChoices, choice]
  };
}

export function removePendingChoice(state: GameState, choiceId: string): GameState {
  return {
    ...state,
    pendingChoices: state.pendingChoices.filter((choice) => choice.id !== choiceId)
  };
}
