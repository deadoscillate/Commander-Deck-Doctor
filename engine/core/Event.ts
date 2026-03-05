import type { TriggerEvent, ZoneChangeEvent, ZoneChangeReason, ZoneName } from "./types";

export function createZoneChangeEvent(args: {
  cardId: string;
  from: ZoneName;
  to: ZoneName;
  reason: ZoneChangeReason;
  controllerId: string;
  ownerId: string;
}): ZoneChangeEvent {
  return {
    kind: "ZONE_CHANGE",
    cardId: args.cardId,
    from: args.from,
    to: args.to,
    reason: args.reason,
    controllerId: args.controllerId,
    ownerId: args.ownerId
  };
}

export function createTriggerEvent(
  type: TriggerEvent["type"],
  values: Partial<Omit<TriggerEvent, "type">> = {}
): TriggerEvent {
  return {
    type,
    sourceCardId: values.sourceCardId ?? null,
    subjectCardId: values.subjectCardId ?? null,
    playerId: values.playerId ?? null,
    amount: values.amount ?? null,
    details: values.details ?? {}
  };
}
