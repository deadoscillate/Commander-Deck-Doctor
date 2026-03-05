import type { ZoneName, ZoneState } from "./types";

export function createZone(name: ZoneName, ordered = true): ZoneState {
  return {
    name,
    cardIds: [],
    ordered
  };
}

export function zoneTopCard(zone: ZoneState): string | null {
  if (zone.cardIds.length === 0) {
    return null;
  }

  return zone.cardIds[zone.cardIds.length - 1] ?? null;
}

export function zonePopTop(zone: ZoneState): { zone: ZoneState; cardId: string | null } {
  if (zone.cardIds.length === 0) {
    return { zone, cardId: null };
  }

  const cardIds = [...zone.cardIds];
  const cardId = cardIds.pop() ?? null;
  return {
    zone: {
      ...zone,
      cardIds
    },
    cardId
  };
}

export function zonePushTop(zone: ZoneState, cardId: string): ZoneState {
  return {
    ...zone,
    cardIds: [...zone.cardIds, cardId]
  };
}

export function zoneInsertBottom(zone: ZoneState, cardId: string): ZoneState {
  return {
    ...zone,
    cardIds: [cardId, ...zone.cardIds]
  };
}

export function zoneRemoveCard(zone: ZoneState, cardId: string): ZoneState {
  const idx = zone.cardIds.indexOf(cardId);
  if (idx === -1) {
    return zone;
  }

  const cardIds = [...zone.cardIds];
  cardIds.splice(idx, 1);
  return {
    ...zone,
    cardIds
  };
}
