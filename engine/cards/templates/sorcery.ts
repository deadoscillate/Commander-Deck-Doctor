import type { CardBehavior } from "../../core/Ability";
import { damageSpellTemplate, destroyCreatureTemplate, drawSpellTemplate } from "./instant";

export function sorceryDamageTemplate(id: string, amount: number): CardBehavior {
  return {
    ...damageSpellTemplate(id, amount),
    description: `Sorcery: deal ${amount} damage`
  };
}

export function sorceryDestroyTemplate(id: string): CardBehavior {
  return {
    ...destroyCreatureTemplate(id),
    description: "Sorcery: destroy target creature"
  };
}

export function sorceryDrawTemplate(id: string, count: number): CardBehavior {
  return {
    ...drawSpellTemplate(id, count),
    description: `Sorcery: draw ${count}`
  };
}
