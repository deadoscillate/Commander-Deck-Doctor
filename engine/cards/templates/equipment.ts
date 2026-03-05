import { createAbility, type CardBehavior } from "../../core/Ability";
import { registerContinuousEffect } from "../../core/ContinuousEffects";
import { updateCard } from "../../core/GameState";

export function equipmentBuffTemplate(id: string, power: number, toughness: number): CardBehavior {
  return {
    id,
    description: `Equipment grants +${power}/+${toughness}`,
    targetKind: "NONE",
    activatedAbilities: [
      createAbility({
        id: "equip",
        text: "Equip (MVP free attach)",
        effectId: "EQUIP_ATTACH",
        targetKind: "TARGET_CREATURE"
      })
    ],
    triggeredAbilities: [],
    registerStaticEffects: (state, sourceCardId) =>
      registerContinuousEffect(state, {
        id: `ce-${sourceCardId}-equipment-buff`,
        sourceCardId,
        controllerId: state.cardInstances[sourceCardId]?.controllerId ?? "",
        active: true,
        layer: "PT_MODIFY",
        appliesTo: "ENCHANTED_OR_EQUIPPED",
        powerDelta: power,
        toughnessDelta: toughness,
        expiresAtTurn: null
      }),
    onResolveTriggeredAbility: {
      equip_attach: ({ state, sourceCardId, targetIds }) => {
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
      }
    }
  };
}
