import { isCreature } from "./Card";
import type { CardInstance, ContinuousEffect, GameState } from "./types";

export type ComputedCharacteristics = {
  power: number;
  toughness: number;
};

function parseStat(value: string | null): number {
  if (!value) {
    return 0;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function appliesToCard(state: GameState, effect: ContinuousEffect, card: CardInstance): boolean {
  if (!effect.active) {
    return false;
  }

  if (effect.appliesTo === "SELF") {
    return effect.sourceCardId === card.id;
  }

  if (effect.appliesTo === "CREATURES_YOU_CONTROL") {
    return card.controllerId === effect.controllerId && isCreature(card.definition);
  }

  if (effect.appliesTo === "ENCHANTED_OR_EQUIPPED") {
    const source = state.cardInstances[effect.sourceCardId];
    return source?.attachedToId === card.id;
  }

  return false;
}

export function computeCharacteristics(state: GameState, card: CardInstance): ComputedCharacteristics {
  const basePower = parseStat(card.definition.power);
  const baseToughness = parseStat(card.definition.toughness);
  const plusCounters = card.counters["+1/+1"] ?? 0;
  const minusCounters = card.counters["-1/-1"] ?? 0;

  let power = basePower + plusCounters - minusCounters;
  let toughness = baseToughness + plusCounters - minusCounters;

  for (const effect of state.continuousEffects) {
    if (effect.layer !== "PT_MODIFY") {
      continue;
    }

    if (!appliesToCard(state, effect, card)) {
      continue;
    }

    power += effect.powerDelta;
    toughness += effect.toughnessDelta;
  }

  return {
    power,
    toughness
  };
}
