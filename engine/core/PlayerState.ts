import { createZone } from "./Zone";
import { emptyManaPool } from "./ManaSystem";
import type { PlayerInput, PlayerState } from "./types";

export function createPlayerState(input: PlayerInput, startingLife: number): PlayerState {
  return {
    id: input.id,
    name: input.name,
    life: startingLife,
    lost: false,
    manaPool: emptyManaPool(),
    zones: {
      library: createZone("library", true),
      hand: createZone("hand", true),
      battlefield: createZone("battlefield", true),
      graveyard: createZone("graveyard", true),
      exile: createZone("exile", true),
      stack: createZone("stack", true),
      command: createZone("command", true)
    },
    hasPlayedLandThisTurn: false
  };
}
