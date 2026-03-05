import type { ContinuousEffect, ReplacementEffect } from "./types";

export type OneShotEffectKind =
  | "DRAW_CARDS"
  | "DEAL_DAMAGE"
  | "DESTROY_TARGET_CREATURE"
  | "COUNTER_TARGET_SPELL"
  | "ADD_MANA"
  | "GAIN_LIFE"
  | "LOSE_LIFE";

export type OneShotEffect = {
  id: string;
  kind: OneShotEffectKind;
  amount: number;
};

export type RegisteredEffect =
  | {
      kind: "CONTINUOUS";
      effect: ContinuousEffect;
    }
  | {
      kind: "REPLACEMENT";
      effect: ReplacementEffect;
    }
  | {
      kind: "ONESHOT";
      effect: OneShotEffect;
    };
