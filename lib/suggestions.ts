import type { CountKey } from "./thresholds";

type SuggestionRoleKey = Exclude<CountKey, "lands">;

type SuggestionCard = {
  name: string;
  colors: string[];
};

export type RoleSuggestions = {
  key: SuggestionRoleKey;
  label: string;
  currentCount: number;
  recommendedRange: string;
  suggestions: string[];
};

type BuildRoleSuggestionsInput = {
  lowRoles: Array<{
    key: CountKey;
    label: string;
    value: number;
    recommendedText: string;
    status: "LOW" | "OK" | "HIGH";
  }>;
  deckColorIdentity: string[];
  existingCardNames: string[];
  limit?: number;
};

const ROLE_CARD_POOLS: Record<SuggestionRoleKey, SuggestionCard[]> = {
  ramp: [
    { name: "Nature's Lore", colors: ["G"] },
    { name: "Three Visits", colors: ["G"] },
    { name: "Farseek", colors: ["G"] },
    { name: "Rampant Growth", colors: ["G"] },
    { name: "Kodama's Reach", colors: ["G"] },
    { name: "Cultivate", colors: ["G"] },
    { name: "Arcane Signet", colors: [] },
    { name: "Fellwar Stone", colors: [] },
    { name: "Thought Vessel", colors: [] },
    { name: "Talisman of Dominance", colors: [] }
  ],
  draw: [
    { name: "Rhystic Study", colors: ["U"] },
    { name: "Mystic Remora", colors: ["U"] },
    { name: "Fact or Fiction", colors: ["U"] },
    { name: "Ponder", colors: ["U"] },
    { name: "Brainstorm", colors: ["U"] },
    { name: "Phyrexian Arena", colors: ["B"] },
    { name: "Night's Whisper", colors: ["B"] },
    { name: "Harmonize", colors: ["G"] },
    { name: "Esper Sentinel", colors: ["W"] },
    { name: "Beast Whisperer", colors: ["G"] }
  ],
  removal: [
    { name: "Swords to Plowshares", colors: ["W"] },
    { name: "Path to Exile", colors: ["W"] },
    { name: "Beast Within", colors: ["G"] },
    { name: "Generous Gift", colors: ["W"] },
    { name: "Pongify", colors: ["U"] },
    { name: "Rapid Hybridization", colors: ["U"] },
    { name: "Infernal Grasp", colors: ["B"] },
    { name: "Go for the Throat", colors: ["B"] },
    { name: "Chaos Warp", colors: ["R"] },
    { name: "Abrade", colors: ["R"] }
  ],
  wipes: [
    { name: "Wrath of God", colors: ["W"] },
    { name: "Damn", colors: ["W", "B"] },
    { name: "Blasphemous Act", colors: ["R"] },
    { name: "Toxic Deluge", colors: ["B"] },
    { name: "Farewell", colors: ["W"] },
    { name: "Austere Command", colors: ["W"] },
    { name: "Cyclonic Rift", colors: ["U"] }
  ],
  protection: [
    { name: "Teferi's Protection", colors: ["W"] },
    { name: "Heroic Intervention", colors: ["G"] },
    { name: "Flawless Maneuver", colors: ["W"] },
    { name: "Tamiyo's Safekeeping", colors: ["G"] },
    { name: "Counterspell", colors: ["U"] },
    { name: "Swan Song", colors: ["U"] },
    { name: "Deflecting Swat", colors: ["R"] }
  ],
  finishers: [
    { name: "Craterhoof Behemoth", colors: ["G"] },
    { name: "Triumph of the Hordes", colors: ["G"] },
    { name: "Exsanguinate", colors: ["B"] },
    { name: "Torment of Hailfire", colors: ["B"] },
    { name: "Approach of the Second Sun", colors: ["W"] },
    { name: "Insurrection", colors: ["R"] },
    { name: "Finale of Devastation", colors: ["G"] }
  ]
};

function normalizeCardName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isColorAllowed(cardColors: string[], deckColors: Set<string>): boolean {
  return cardColors.every((color) => deckColors.has(color));
}

/**
 * Returns card suggestions for LOW roles, filtered by deck color identity and existing deck cards.
 */
export function buildRoleSuggestions({
  lowRoles,
  deckColorIdentity,
  existingCardNames,
  limit = 5
}: BuildRoleSuggestionsInput): RoleSuggestions[] {
  const deckColors = new Set(deckColorIdentity);
  const existing = new Set(existingCardNames.map((name) => normalizeCardName(name)));
  const output: RoleSuggestions[] = [];

  for (const role of lowRoles) {
    if (role.status !== "LOW" || role.key === "lands") {
      continue;
    }

    const pool = ROLE_CARD_POOLS[role.key];
    if (!pool) {
      continue;
    }

    const names = pool
      .filter((card) => isColorAllowed(card.colors, deckColors))
      .map((card) => card.name)
      .filter((name) => !existing.has(normalizeCardName(name)))
      .slice(0, Math.max(3, limit));

    output.push({
      key: role.key,
      label: role.label,
      currentCount: role.value,
      recommendedRange: role.recommendedText,
      suggestions: names.slice(0, 5)
    });
  }

  return output;
}
