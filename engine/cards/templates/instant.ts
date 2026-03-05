import type { CardBehavior } from "../../core/Ability";
import { appendLog } from "../../core/Logger";
import { createZoneChangeEvent } from "../../core/Event";
import { moveCardBetweenZones } from "../../core/GameState";
import { dealDamageToTarget, destroyTargetCreature, drawCards } from "./primitives";

export function damageSpellTemplate(id: string, amount: number): CardBehavior {
  return {
    id,
    description: `Deal ${amount} damage to target creature or player`,
    targetKind: "TARGET_CREATURE_OR_PLAYER",
    activatedAbilities: [],
    triggeredAbilities: [],
    onResolveSpell: ({ state, sourceCardId, targetIds }) => {
      let next = state;
      for (const targetId of targetIds.slice(0, 1)) {
        next = dealDamageToTarget(next, sourceCardId, targetId, amount);
      }

      return { state: next };
    }
  };
}

export function destroyCreatureTemplate(id: string): CardBehavior {
  return {
    id,
    description: "Destroy target creature",
    targetKind: "TARGET_CREATURE",
    activatedAbilities: [],
    triggeredAbilities: [],
    onResolveSpell: ({ state, sourceCardId, targetIds }) => {
      let next = state;
      const target = targetIds[0];
      if (target) {
        next = destroyTargetCreature(next, sourceCardId, target);
      }

      return { state: next };
    }
  };
}

export function drawSpellTemplate(id: string, count: number): CardBehavior {
  return {
    id,
    description: `Draw ${count} cards`,
    targetKind: "NONE",
    activatedAbilities: [],
    triggeredAbilities: [],
    onResolveSpell: ({ state, controllerId }) => ({
      state: drawCards(state, controllerId, count)
    })
  };
}

export function counterSpellTemplate(id: string): CardBehavior {
  return {
    id,
    description: "Counter target spell",
    targetKind: "TARGET_SPELL",
    activatedAbilities: [],
    triggeredAbilities: [],
    onResolveSpell: ({ state, sourceCardId, targetIds }) => {
      const targetStackId = targetIds[0];
      if (!targetStackId) {
        return { state };
      }

      const targetedItem = state.stack.find((item) => item.id === targetStackId);
      if (!targetedItem || targetedItem.kind !== "SPELL") {
        return { state };
      }

      let next = {
        ...state,
        stack: state.stack.filter((item) => item.id !== targetStackId)
      };

      const targetedCard = next.cardInstances[targetedItem.cardId];
      if (targetedCard) {
        next = moveCardBetweenZones(
          next,
          createZoneChangeEvent({
            cardId: targetedCard.id,
            from: "stack",
            to: "graveyard",
            reason: "SPELL_RESOLVE",
            controllerId: targetedCard.controllerId,
            ownerId: targetedCard.ownerId
          })
        );
      }

      next = appendLog(next, "COUNTER_SPELL", {
        sourceCardId,
        targetStackId,
        counteredCardId: targetedItem.cardId
      });

      return { state: next };
    }
  };
}
