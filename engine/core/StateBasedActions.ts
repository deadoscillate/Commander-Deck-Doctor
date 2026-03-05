import { isCreature, isLegendary } from "./Card";
import { computeCharacteristics } from "./LayerSystem";
import type { CardInstance, GameState, ZoneChangeReason } from "./types";

export type StateBasedActionCommand =
  | {
      kind: "MOVE_CARD";
      cardId: string;
      toZone: "graveyard";
      reason: ZoneChangeReason;
      message: string;
    }
  | {
      kind: "PLAYER_LOSES";
      playerId: string;
      message: string;
    }
  | {
      kind: "REMOVE_TOKEN";
      cardId: string;
      message: string;
    };

function legendaryGroups(state: GameState): Map<string, CardInstance[]> {
  const groups = new Map<string, CardInstance[]>();
  for (const card of Object.values(state.cardInstances)) {
    if (card.currentZone !== "battlefield") {
      continue;
    }

    if (!isLegendary(card.definition)) {
      continue;
    }

    const key = `${card.controllerId}::${card.definition.name}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(card);
    groups.set(key, bucket);
  }

  return groups;
}

/**
 * Returns all currently applicable SBAs. Caller should apply and repeat until stable.
 */
export function collectStateBasedActions(state: GameState): StateBasedActionCommand[] {
  const commands: StateBasedActionCommand[] = [];
  const losingPlayers = new Set<string>();

  for (const player of state.players) {
    if (player.lost) {
      continue;
    }

    let lethalCommander: { commanderName: string; total: number } | null = null;
    for (const [commanderId, damageByPlayer] of Object.entries(state.commander.damageByCommanderToPlayer)) {
      const total = damageByPlayer[player.id] ?? 0;
      if (total < 21) {
        continue;
      }

      const commanderName = state.cardInstances[commanderId]?.definition.name ?? commanderId;
      lethalCommander = { commanderName, total };
      break;
    }

    if (!lethalCommander) {
      continue;
    }

    losingPlayers.add(player.id);
    commands.push({
      kind: "PLAYER_LOSES",
      playerId: player.id,
      message: `${player.name} loses the game for taking ${lethalCommander.total} commander combat damage from ${lethalCommander.commanderName}.`
    });
  }

  for (const player of state.players) {
    if (!player.lost && player.life <= 0 && !losingPlayers.has(player.id)) {
      commands.push({
        kind: "PLAYER_LOSES",
        playerId: player.id,
        message: `${player.name} loses the game for having 0 or less life.`
      });
    }
  }

  for (const card of Object.values(state.cardInstances)) {
    if (card.currentZone === "battlefield" && isCreature(card.definition)) {
      const computed = computeCharacteristics(state, card);
      if (computed.toughness <= 0) {
        commands.push({
          kind: "MOVE_CARD",
          cardId: card.id,
          toZone: "graveyard",
          reason: "SBA",
          message: `${card.definition.name} is put into a graveyard for having toughness 0 or less.`
        });
      }
    }

    if (card.currentZone === "battlefield" && card.definition.parsedTypeLine.types.includes("Planeswalker")) {
      const loyaltyCounters = card.counters.loyalty ?? Number(card.definition.loyalty ?? 0);
      if (loyaltyCounters <= 0) {
        commands.push({
          kind: "MOVE_CARD",
          cardId: card.id,
          toZone: "graveyard",
          reason: "SBA",
          message: `${card.definition.name} is put into a graveyard for having no loyalty.`
        });
      }
    }

    if (card.isToken && card.currentZone !== "battlefield") {
      commands.push({
        kind: "REMOVE_TOKEN",
        cardId: card.id,
        message: `Token ${card.definition.name} ceases to exist outside the battlefield.`
      });
    }
  }

  const legendGroups = legendaryGroups(state);
  for (const group of legendGroups.values()) {
    if (group.length <= 1) {
      continue;
    }

    const [keep, ...moveToGraveyard] = group.sort((a, b) => a.id.localeCompare(b.id));
    for (const card of moveToGraveyard) {
      commands.push({
        kind: "MOVE_CARD",
        cardId: card.id,
        toZone: "graveyard",
        reason: "SBA",
        message: `Legend rule keeps ${keep.definition.name}; ${card.definition.name} is put into graveyard.`
      });
    }
  }

  return commands;
}
