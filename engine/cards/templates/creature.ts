import { createTrigger, type CardBehavior } from "../../core/Ability";
import { drawCards } from "./primitives";

export function vanillaCreatureTemplate(id: string): CardBehavior {
  return {
    id,
    description: "Vanilla creature template",
    targetKind: "NONE",
    activatedAbilities: [],
    triggeredAbilities: []
  };
}

export function etbDrawTemplate(id: string, cardsToDraw = 1): CardBehavior {
  return {
    id,
    description: `ETB draw ${cardsToDraw}`,
    targetKind: "NONE",
    activatedAbilities: [],
    triggeredAbilities: [
      createTrigger({
        id: "etb_draw",
        event: "SELF_ENTERS_BATTLEFIELD",
        text: `When this enters, draw ${cardsToDraw} card(s).`
      })
    ],
    onResolveTriggeredAbility: {
      etb_draw: ({ state, controllerId }) => ({
        state: drawCards(state, controllerId, cardsToDraw)
      })
    }
  };
}
