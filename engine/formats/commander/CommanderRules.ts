import type { GameState, ZoneChangeEvent } from "../../core/types";
import { isCommanderCard } from "./CommanderState";

export const COMMANDER_FORMAT_NAME = "Commander";
export const COMMANDER_STARTING_LIFE = 40;

export function isCommanderReplacementEligible(state: GameState, event: ZoneChangeEvent): boolean {
  if (!isCommanderCard(state, event.cardId)) {
    return false;
  }

  if (event.reason === "COMMANDER_REPLACEMENT") {
    return false;
  }

  return event.to === "graveyard" || event.to === "hand" || event.to === "library" || event.to === "exile";
}

export function commanderRulesSummary(state: GameState): {
  format: string;
  startingLife: number;
  commanders: Record<string, string[]>;
} {
  const commanders: Record<string, string[]> = {};
  for (const [playerId, cardIds] of Object.entries(state.commander.commanderIdsByPlayer)) {
    commanders[playerId] = cardIds
      .map((cardId) => state.cardInstances[cardId]?.definition.name)
      .filter((name): name is string => Boolean(name));
  }

  return {
    format: COMMANDER_FORMAT_NAME,
    startingLife: COMMANDER_STARTING_LIFE,
    commanders
  };
}
