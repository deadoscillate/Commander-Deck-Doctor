import { adjustPlayerLife, appendLog, updatePlayer } from "../../engine-internal";
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

  if (nextAmount >= 21) {
    next = adjustPlayerLife(next, damagedPlayerId, -1000, "Commander damage lethal");
    next = updatePlayer(next, damagedPlayerId, (player) => ({
      ...player,
      lost: true
    }));
    next = appendLog(next, "PLAYER_LOSES_COMMANDER_DAMAGE", {
      playerId: damagedPlayerId,
      commanderCardId,
      total: nextAmount
    });
  }

  return next;
}
