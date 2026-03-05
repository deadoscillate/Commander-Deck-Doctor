import type { TurnStep } from "./types";

export const TURN_STEPS: TurnStep[] = [
  "UNTAP",
  "UPKEEP",
  "DRAW",
  "MAIN1",
  "COMBAT_BEGIN",
  "DECLARE_ATTACKERS",
  "DECLARE_BLOCKERS",
  "COMBAT_DAMAGE",
  "COMBAT_END",
  "MAIN2",
  "END",
  "CLEANUP"
];

const STEPS_WITH_PRIORITY = new Set<TurnStep>([
  "UPKEEP",
  "DRAW",
  "MAIN1",
  "COMBAT_BEGIN",
  "DECLARE_ATTACKERS",
  "DECLARE_BLOCKERS",
  "COMBAT_DAMAGE",
  "COMBAT_END",
  "MAIN2",
  "END"
]);

export function hasPriorityInStep(step: TurnStep): boolean {
  return STEPS_WITH_PRIORITY.has(step);
}

export function nextTurnStep(current: TurnStep): { step: TurnStep; wrapped: boolean } {
  const idx = TURN_STEPS.indexOf(current);
  const nextIdx = idx + 1;
  if (nextIdx >= TURN_STEPS.length) {
    return {
      step: TURN_STEPS[0],
      wrapped: true
    };
  }

  return {
    step: TURN_STEPS[nextIdx],
    wrapped: false
  };
}
