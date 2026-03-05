import type { CardBehavior } from "../../core/Ability";
import { registerContinuousEffect } from "../../core/ContinuousEffects";

export function anthemTemplate(id: string, power = 1, toughness = 1): CardBehavior {
  return {
    id,
    description: `Creatures you control get +${power}/+${toughness}`,
    targetKind: "NONE",
    activatedAbilities: [],
    triggeredAbilities: [],
    registerStaticEffects: (state, sourceCardId) =>
      registerContinuousEffect(state, {
        id: `ce-${sourceCardId}-anthem`,
        sourceCardId,
        controllerId: state.cardInstances[sourceCardId]?.controllerId ?? "",
        active: true,
        layer: "PT_MODIFY",
        appliesTo: "CREATURES_YOU_CONTROL",
        powerDelta: power,
        toughnessDelta: toughness,
        expiresAtTurn: null
      })
  };
}

export function replacementDiesExileTemplate(id: string): CardBehavior {
  return {
    id,
    description: "If a creature would die, exile it instead",
    targetKind: "NONE",
    activatedAbilities: [],
    triggeredAbilities: [],
    registerStaticEffects: (state, sourceCardId) => {
      const source = state.cardInstances[sourceCardId];
      if (!source) {
        return state;
      }

      return {
        ...state,
        replacementEffects: [
          ...state.replacementEffects,
          {
            id: `repl-${sourceCardId}-dies-exile`,
            sourceCardId,
            controllerId: source.controllerId,
            kind: "ZONE_CHANGE_DESTINATION_OVERRIDE",
            active: true,
            params: {
              onlyFrom: "battlefield",
              onlyTo: "graveyard",
              onlyCardType: "Creature",
              to: "exile"
            }
          }
        ]
      };
    }
  };
}
