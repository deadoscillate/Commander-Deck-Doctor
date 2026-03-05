import { createAbility, type CardBehavior } from "../../core/Ability";
import type { ManaColor } from "../../core/types";

function addManaEffectId(color: ManaColor, amount: number): string {
  return `ADD_MANA_${color}_${amount}`;
}

export function manaRockTemplate(id: string, color: ManaColor, amount = 1): CardBehavior {
  return {
    id,
    description: `Mana rock tap: add ${amount} ${color}`,
    targetKind: "NONE",
    activatedAbilities: [
      createAbility({
        id: "tap_for_mana",
        text: `{T}: Add ${amount} ${color}.`,
        effectId: addManaEffectId(color, amount),
        tapCost: true
      })
    ],
    triggeredAbilities: []
  };
}

export function colorIdentityManaRockTemplate(id: string): CardBehavior {
  return {
    id,
    description: "Tap: add one mana of any color",
    targetKind: "NONE",
    activatedAbilities: [
      createAbility({
        id: "tap_for_mana_any",
        text: "{T}: Add one mana of any color.",
        effectId: "ADD_MANA_ANY_1",
        tapCost: true
      })
    ],
    triggeredAbilities: []
  };
}
