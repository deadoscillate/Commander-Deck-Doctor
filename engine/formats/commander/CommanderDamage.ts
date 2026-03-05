import { appendLog } from "../../engine-internal";
import type { GameState } from "../../core/types";

export function addCommanderCombatDamage(
  state: GameState,
  commanderCardId: string,
  damagedPlayerId: string,
  amount: number
): GameState {
  const prior = state.commander.damageByCommanderToPlayer[commanderCardId]?.[damagedPlayerId] ?? 0;
  const nextAmount = prior + Math.max(0, amount);

  let next = {
    ...state,
    commander: {
      ...state.commander,
      damageByCommanderToPlayer: {
        ...state.commander.damageByCommanderToPlayer,
        [commanderCardId]: {
          ...(state.commander.damageByCommanderToPlayer[commanderCardId] ?? {}),
          [damagedPlayerId]: nextAmount
        }
      }
    }
  };

  next = appendLog(next, "COMMANDER_DAMAGE", {
    commanderCardId,
    damagedPlayerId,
    amount,
    total: nextAmount
  });

  return next;
}
