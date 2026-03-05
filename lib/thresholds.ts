/**
 * Shared thresholds used by both Deck Health diagnostics and Recommended Counts UI.
 */
export type CountKey =
  | "lands"
  | "ramp"
  | "draw"
  | "removal"
  | "wipes"
  | "protection"
  | "finishers";

export type CountThreshold = {
  label: string;
  recommendedMin: number;
  recommendedMax: number;
  lowMin: number;
  highMax: number;
};

export const COUNT_KEY_ORDER: CountKey[] = [
  "lands",
  "ramp",
  "draw",
  "removal",
  "wipes",
  "protection",
  "finishers"
];

export const COUNT_THRESHOLDS: Record<CountKey, CountThreshold> = {
  lands: {
    label: "Lands",
    recommendedMin: 34,
    recommendedMax: 38,
    lowMin: 33,
    highMax: 40
  },
  ramp: {
    label: "Ramp",
    recommendedMin: 8,
    recommendedMax: 12,
    lowMin: 8,
    highMax: 12
  },
  draw: {
    label: "Card Draw",
    recommendedMin: 8,
    recommendedMax: 12,
    lowMin: 8,
    highMax: 12
  },
  removal: {
    label: "Removal",
    recommendedMin: 6,
    recommendedMax: 10,
    lowMin: 6,
    highMax: 10
  },
  wipes: {
    label: "Board Wipes",
    recommendedMin: 2,
    recommendedMax: 4,
    lowMin: 2,
    highMax: 4
  },
  protection: {
    label: "Protection",
    recommendedMin: 3,
    recommendedMax: 7,
    lowMin: 3,
    highMax: 7
  },
  finishers: {
    label: "Finishers",
    recommendedMin: 2,
    recommendedMax: 6,
    lowMin: 2,
    highMax: 6
  }
};
