import type { CardInstance, GameState } from "./types";

export function getPermanentById(state: GameState, cardId: string): CardInstance | null {
  const card = state.cardInstances[cardId];
  if (!card) {
    return null;
  }

  return card.currentZone === "battlefield" ? card : null;
}

export function controlledPermanents(state: GameState, controllerId: string): CardInstance[] {
  return Object.values(state.cardInstances).filter(
    (card) => card.currentZone === "battlefield" && card.controllerId === controllerId
  );
}

export function untapAllControlledPermanents(state: GameState, controllerId: string): GameState {
  const cardInstances = { ...state.cardInstances };
  for (const card of Object.values(cardInstances)) {
    if (card.currentZone !== "battlefield" || card.controllerId !== controllerId) {
      continue;
    }

    cardInstances[card.id] = {
      ...card,
      tapped: false,
      damageMarked: 0,
      summoningSick: false
    };
  }

  return {
    ...state,
    cardInstances
  };
}
