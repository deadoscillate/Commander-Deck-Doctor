import type { CardBehavior } from "../../core/Ability";

export function simplePlaneswalkerTemplate(id: string): CardBehavior {
  return {
    id,
    description: "Simple planeswalker template",
    targetKind: "NONE",
    activatedAbilities: [],
    triggeredAbilities: []
  };
}
