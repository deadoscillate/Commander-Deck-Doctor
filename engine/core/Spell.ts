import type { StackSpell } from "./types";

export function createSpellOnStack(params: {
  id: string;
  cardId: string;
  controllerId: string;
  sourceZone: "hand" | "command";
  targetIds?: string[];
}): StackSpell {
  return {
    kind: "SPELL",
    id: params.id,
    cardId: params.cardId,
    controllerId: params.controllerId,
    sourceZone: params.sourceZone,
    targetIds: params.targetIds ?? [],
    chosenValueX: 0
  };
}
