export const ROLE_KEYS = [
  "ramp",
  "draw",
  "removal",
  "wipes",
  "tutors",
  "protection",
  "finishers"
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export type RoleDefinition = {
  key: RoleKey;
  label: string;
  description: string;
};

export const ROLE_DEFINITIONS: Record<RoleKey, RoleDefinition> = {
  ramp: {
    key: "ramp",
    label: "Ramp",
    description: "Nonland acceleration: mana rocks, dorks, treasures, rituals, and extra-land effects."
  },
  draw: {
    key: "draw",
    label: "Card Draw",
    description: "Cards that generate card advantage or repeatable draw/filter value."
  },
  removal: {
    key: "removal",
    label: "Removal",
    description: "Targeted interaction such as destroy/exile/bounce/counter/fight effects."
  },
  wipes: {
    key: "wipes",
    label: "Board Wipes",
    description: "Mass interaction affecting all/each major permanent groups."
  },
  tutors: {
    key: "tutors",
    label: "Tutors",
    description: "True tutors: explicit library search for nonland cards."
  },
  protection: {
    key: "protection",
    label: "Protection",
    description: "Cards that protect your board/plan (hexproof, indestructible, phasing, anti-counter)."
  },
  finishers: {
    key: "finishers",
    label: "Finishers",
    description: "Cards that reliably close games (win effects, lethal drains, decisive overrun lines)."
  }
};
