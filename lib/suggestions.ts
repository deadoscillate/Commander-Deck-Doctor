import type { CountKey } from "./thresholds";
import { classifyCardRoles, type RoleFlags } from "@/engine/cards/roleClassifier";

type SuggestionRoleKey = Exclude<CountKey, "lands">;

type SuggestionCard = {
  name: string;
  colors: string[];
};

type SuggestionCardDefinition = {
  oracleId: string;
  name: string;
  mv: number;
  typeLine: string;
  oracleText: string;
  keywords: string[];
  colorIdentity: string[];
  legalities: Record<string, string>;
  behaviorId?: string | null;
};

type SuggestionCardDatabase = {
  allCards: () => SuggestionCardDefinition[];
  getCardByName: (name: string) => SuggestionCardDefinition | null;
};

type IndexedCard = {
  name: string;
  normalizedName: string;
  mv: number;
  typeLine: string;
  oracleText: string;
  colorIdentity: string[];
  flags: RoleFlags;
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
  cardDatabase?: SuggestionCardDatabase;
  limit?: number;
};

const FALLBACK_ROLE_CARD_POOLS: Record<SuggestionRoleKey, SuggestionCard[]> = {
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

const ROLE_PREFERRED_ORDER: Record<SuggestionRoleKey, string[]> = {
  ramp: [
    "Arcane Signet",
    "Fellwar Stone",
    "Nature's Lore",
    "Three Visits",
    "Farseek",
    "Rampant Growth",
    "Cultivate",
    "Kodama's Reach",
    "Birds of Paradise",
    "Llanowar Elves",
    "Ignoble Hierarch",
    "Delighted Halfling",
    "Talisman of Dominance",
    "Talisman of Progress",
    "Talisman of Impulse",
    "Smothering Tithe"
  ],
  draw: [
    "Rhystic Study",
    "Mystic Remora",
    "Esper Sentinel",
    "Phyrexian Arena",
    "Night's Whisper",
    "Sign in Blood",
    "Ponder",
    "Preordain",
    "Brainstorm",
    "Fact or Fiction",
    "Beast Whisperer",
    "Guardian Project",
    "Harmonize",
    "Skullclamp",
    "Tocasia's Welcome"
  ],
  removal: [
    "Swords to Plowshares",
    "Path to Exile",
    "Pongify",
    "Rapid Hybridization",
    "Infernal Grasp",
    "Go for the Throat",
    "Chaos Warp",
    "Abrade",
    "Beast Within",
    "Generous Gift",
    "Assassin's Trophy",
    "Anguished Unmaking",
    "Krosan Grip",
    "Cyclonic Rift",
    "Counterspell"
  ],
  wipes: [
    "Blasphemous Act",
    "Damnation",
    "Wrath of God",
    "Supreme Verdict",
    "Farewell",
    "Austere Command",
    "Toxic Deluge",
    "Cyclonic Rift",
    "Merciless Eviction",
    "Vanquish the Horde",
    "Depopulate",
    "Damn"
  ],
  protection: [
    "Teferi's Protection",
    "Heroic Intervention",
    "Flawless Maneuver",
    "Deflecting Swat",
    "Tamiyo's Safekeeping",
    "Swan Song",
    "Counterspell",
    "Fierce Guardianship",
    "Tyvar's Stand",
    "Loran's Escape",
    "Bolt Bend",
    "March of Swirling Mist"
  ],
  finishers: [
    "Craterhoof Behemoth",
    "Triumph of the Hordes",
    "Exsanguinate",
    "Torment of Hailfire",
    "Approach of the Second Sun",
    "Insurrection",
    "Finale of Devastation",
    "Overwhelming Stampede",
    "Akroma's Will",
    "Moonshaker Cavalry",
    "Walking Ballista",
    "Aetherflux Reservoir",
    "Laboratory Maniac"
  ]
};

const ROLE_KEYS: SuggestionRoleKey[] = ["ramp", "draw", "removal", "wipes", "protection", "finishers"];

const indexedCardCache = new WeakMap<SuggestionCardDatabase, IndexedCard[]>();

function normalizeCardName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeColorIdentity(identity: string[]): string[] {
  return identity
    .filter((value) => typeof value === "string")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[WUBRGC]$/.test(value));
}

function isColorAllowed(cardColors: string[], deckColors: Set<string>): boolean {
  if (deckColors.size === 0) {
    return cardColors.length === 0;
  }

  return cardColors.every((color) => deckColors.has(color));
}

function isCommanderLegal(legalities: Record<string, string> | undefined): boolean {
  if (!legalities) {
    return true;
  }

  const commander = legalities.commander;
  if (!commander) {
    return true;
  }

  return commander === "legal" || commander === "restricted";
}

function isExcludedTypeLine(typeLine: string): boolean {
  const lower = typeLine.toLowerCase();
  return (
    lower.includes("conspiracy") ||
    lower.includes("scheme") ||
    lower.includes("phenomenon") ||
    lower.includes("plane ") ||
    lower.includes("vanguard")
  );
}

function roleScore(roleKey: SuggestionRoleKey, card: IndexedCard): number {
  const mv = Number.isFinite(card.mv) ? card.mv : 0;
  const typeLine = card.typeLine.toLowerCase();
  const text = card.oracleText.toLowerCase();
  let score = 0;

  if (roleKey === "ramp") {
    score += 42 - Math.min(mv, 10) * 5;
    if (/\{t\}:\s*add\s+\{/.test(text)) score += 18;
    if (/search your library for/.test(text)) score += 8;
    if (typeLine.includes("artifact")) score += 6;
    if (typeLine.includes("creature")) score += 4;
  } else if (roleKey === "draw") {
    score += 42 - Math.min(mv, 10) * 4;
    if (/draw two cards?/.test(text)) score += 10;
    if (/whenever/.test(text) && /\bdraw\b/.test(text)) score += 10;
    if (typeLine.includes("enchantment")) score += 5;
    if (typeLine.includes("instant")) score += 4;
  } else if (roleKey === "removal") {
    score += 40 - Math.min(mv, 10) * 4;
    if (/exile target/.test(text)) score += 15;
    else if (/destroy target/.test(text)) score += 12;
    else if (/counter target/.test(text)) score += 10;
    if (typeLine.includes("instant")) score += 6;
  } else if (roleKey === "wipes") {
    score += 46 - Math.abs(mv - 4) * 6;
    if (/(?:destroy|exile|return)\s+(?:all|each)\s+/.test(text)) score += 12;
    if (/all creatures|each creature/.test(text)) score += 8;
  } else if (roleKey === "protection") {
    score += 40 - Math.min(mv, 10) * 4;
    if (/hexproof|indestructible|phases? out|ward|protection from/.test(text)) score += 14;
    if (typeLine.includes("instant")) score += 8;
  } else {
    score += Math.min(mv, 12) * 4;
    if (/you win the game/.test(text)) score += 30;
    if (/each opponent loses/.test(text)) score += 16;
    if (/creatures you control[^.]{0,80}get \+/.test(text)) score += 14;
  }

  if (mv === 0 && roleKey !== "ramp") {
    score -= 14;
  }

  return score;
}

function buildIndexedCards(cardDatabase: SuggestionCardDatabase): IndexedCard[] {
  const cached = indexedCardCache.get(cardDatabase);
  if (cached) {
    return cached;
  }

  const indexed: IndexedCard[] = [];
  const seen = new Set<string>();
  for (const card of cardDatabase.allCards()) {
    const name = typeof card.name === "string" ? card.name.trim() : "";
    if (!name) {
      continue;
    }

    const normalizedName = normalizeCardName(name);
    if (!normalizedName || seen.has(normalizedName)) {
      continue;
    }

    if (!isCommanderLegal(card.legalities) || isExcludedTypeLine(card.typeLine)) {
      continue;
    }

    const flags = classifyCardRoles({
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      keywords: card.keywords,
      behaviorId: card.behaviorId ?? null,
      oracleId: card.oracleId,
      cardName: card.name
    });

    if (!ROLE_KEYS.some((roleKey) => flags[roleKey])) {
      continue;
    }

    indexed.push({
      name: card.name,
      normalizedName,
      mv: card.mv,
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      colorIdentity: normalizeColorIdentity(card.colorIdentity),
      flags
    });
    seen.add(normalizedName);
  }

  indexedCardCache.set(cardDatabase, indexed);
  return indexed;
}

function preferredCandidatesForRole(
  roleKey: SuggestionRoleKey,
  deckColors: Set<string>,
  existing: Set<string>,
  limit: number,
  cardDatabase?: SuggestionCardDatabase
): string[] {
  const preferred = ROLE_PREFERRED_ORDER[roleKey] ?? [];
  const picked: string[] = [];

  for (const name of preferred) {
    if (picked.length >= limit) {
      break;
    }

    const normalized = normalizeCardName(name);
    if (!normalized || existing.has(normalized) || picked.some((item) => normalizeCardName(item) === normalized)) {
      continue;
    }

    if (!cardDatabase) {
      const fallbackPool = FALLBACK_ROLE_CARD_POOLS[roleKey] ?? [];
      const fallback = fallbackPool.find((row) => normalizeCardName(row.name) === normalized);
      if (fallback && isColorAllowed(normalizeColorIdentity(fallback.colors), deckColors)) {
        picked.push(fallback.name);
      }
      continue;
    }

    const card = cardDatabase.getCardByName(name);
    if (!card || !isCommanderLegal(card.legalities)) {
      continue;
    }

    if (!isColorAllowed(normalizeColorIdentity(card.colorIdentity), deckColors)) {
      continue;
    }

    picked.push(card.name);
  }

  return picked;
}

function dynamicCandidatesForRole(
  roleKey: SuggestionRoleKey,
  deckColors: Set<string>,
  existing: Set<string>,
  taken: Set<string>,
  limit: number,
  cardDatabase?: SuggestionCardDatabase
): string[] {
  if (!cardDatabase) {
    return [];
  }

  const indexedCards = buildIndexedCards(cardDatabase);
  const candidates = indexedCards
    .filter((card) => card.flags[roleKey])
    .filter((card) => isColorAllowed(card.colorIdentity, deckColors))
    .filter((card) => !existing.has(card.normalizedName))
    .filter((card) => !taken.has(card.normalizedName))
    .sort((a, b) => {
      const scoreDiff = roleScore(roleKey, b) - roleScore(roleKey, a);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return a.name.localeCompare(b.name);
    });

  return candidates.slice(0, limit).map((card) => card.name);
}

/**
 * Returns role suggestions for LOW role buckets.
 * Strategy:
 * - Prefer curated staples.
 * - Backfill with dynamic engine-classified Commander-legal cards from the local card DB.
 * - Always remove cards already present in the deck.
 */
export function buildRoleSuggestions({
  lowRoles,
  deckColorIdentity,
  existingCardNames,
  cardDatabase,
  limit = 6
}: BuildRoleSuggestionsInput): RoleSuggestions[] {
  const normalizedLimit = Math.max(3, Math.min(10, Math.floor(limit)));
  const deckColors = new Set(normalizeColorIdentity(deckColorIdentity));
  const existing = new Set(existingCardNames.map((name) => normalizeCardName(name)));
  const output: RoleSuggestions[] = [];

  for (const role of lowRoles) {
    if (role.status !== "LOW" || role.key === "lands") {
      continue;
    }

    const roleKey = role.key as SuggestionRoleKey;
    const picked = preferredCandidatesForRole(roleKey, deckColors, existing, normalizedLimit, cardDatabase);
    const taken = new Set(picked.map((name) => normalizeCardName(name)));

    if (picked.length < normalizedLimit) {
      const backfill = dynamicCandidatesForRole(
        roleKey,
        deckColors,
        existing,
        taken,
        normalizedLimit - picked.length,
        cardDatabase
      );
      picked.push(...backfill);
    }

    output.push({
      key: roleKey,
      label: role.label,
      currentCount: role.value,
      recommendedRange: role.recommendedText,
      suggestions: picked
    });
  }

  return output;
}

