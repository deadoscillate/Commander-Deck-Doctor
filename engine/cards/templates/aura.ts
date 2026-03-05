import type { CardBehavior } from "../../core/Ability";
import { registerContinuousEffect } from "../../core/ContinuousEffects";
import { updateCard } from "../../core/GameState";

export function auraBuffTemplate(id: string, power: number, toughness: number): CardBehavior {
  return {
    id,
    description: `Aura grants +${power}/+${toughness}`,
    targetKind: "TARGET_CREATURE",
    activatedAbilities: [],
    triggeredAbilities: [],
    onResolveSpell: ({ state, sourceCardId, targetIds }) => {
      const targetId = targetIds[0] ?? null;
      if (!targetId) {
        return { state };
      }

      return {
        state: updateCard(state, sourceCardId, (card) => ({
          ...card,
          attachedToId: targetId
        }))
      };
    },
    registerStaticEffects: (state, sourceCardId) =>
      registerContinuousEffect(state, {
        id: `ce-${sourceCardId}-aura-buff`,
        sourceCardId,
        controllerId: state.cardInstances[sourceCardId]?.controllerId ?? "",
        active: true,
        layer: "PT_MODIFY",
        appliesTo: "ENCHANTED_OR_EQUIPPED",
        powerDelta: power,
        toughnessDelta: toughness,
        expiresAtTurn: null
      })
  };
}
