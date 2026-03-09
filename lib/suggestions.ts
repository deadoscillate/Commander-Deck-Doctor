import type { CountKey } from "./thresholds";
import type { RoleBreakdown } from "./contracts";
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
  direction: "ADD" | "CUT";
  rationale?: string;
  suggestions: string[];
};

type BuildRoleSuggestionsInput = {
  roleRows: Array<{
    key: CountKey;
    label: string;
    value: number;
    recommendedText: string;
    status: "LOW" | "OK" | "HIGH";
  }>;
  roleBreakdown?: RoleBreakdown;
  deckColorIdentity: string[];
  existingCardNames: string[];
  archetypes?: string[];
  manaCurve?: Record<string, number>;
  averageManaValue?: number | null;
  cardDatabase?: SuggestionCardDatabase;
  limit?: number;
};

type SuggestionContext = {
  archetypes: Set<string>;
  averageManaValue: number;
  manaCurve: Record<string, number>;
  topHeavyCurve: boolean;
  lowProtection: boolean;
  roleValues: Partial<Record<SuggestionRoleKey, number>>;
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
    "Relic of Legends",
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
    "Kindred Discovery",
    "Guardian Project",
    "Reki, the History of Kamigawa",
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
    "Coat of Arms",
    "Walking Ballista",
    "Aetherflux Reservoir",
    "Laboratory Maniac"
  ]
};

const ARCHETYPE_ROLE_PRIORITY: Partial<Record<string, Partial<Record<SuggestionRoleKey, string[]>>>> = {
  Tokens: {
    draw: ["Skullclamp", "Tocasia's Welcome"],
    finishers: ["Moonshaker Cavalry", "Craterhoof Behemoth", "Finale of Devastation", "Akroma's Will"]
  },
  "Go Wide": {
    draw: ["Skullclamp", "Tocasia's Welcome"],
    finishers: ["Moonshaker Cavalry", "Craterhoof Behemoth", "Akroma's Will", "Overwhelming Stampede"]
  },
  "Kindred (Tribal)": {
    draw: ["Kindred Discovery", "Guardian Project", "Reki, the History of Kamigawa"],
    finishers: ["Coat of Arms", "Moonshaker Cavalry", "Craterhoof Behemoth"]
  },
  "Legends Matter": {
    ramp: ["Relic of Legends", "Delighted Halfling"],
    draw: ["Reki, the History of Kamigawa"]
  },
  Spellslinger: {
    draw: ["Ponder", "Preordain", "Brainstorm", "Fact or Fiction"],
    protection: ["Swan Song", "Counterspell", "Fierce Guardianship", "Deflecting Swat"],
    finishers: ["Aetherflux Reservoir"]
  },
  Storm: {
    draw: ["Ponder", "Preordain", "Brainstorm", "Fact or Fiction"],
    protection: ["Swan Song", "Counterspell", "Fierce Guardianship"],
    finishers: ["Aetherflux Reservoir"]
  },
  Artifacts: {
    ramp: ["Arcane Signet", "Fellwar Stone", "Thought Vessel"],
    finishers: ["Walking Ballista", "Aetherflux Reservoir"]
  },
  Counters: {
    finishers: ["Walking Ballista", "Finale of Devastation"]
  },
  Aristocrats: {
    protection: ["Teferi's Protection", "Flawless Maneuver"],
    finishers: ["Exsanguinate", "Torment of Hailfire"]
  },
  "Life Drain": {
    finishers: ["Exsanguinate", "Torment of Hailfire", "Aetherflux Reservoir"]
  },
  "Lands Matter": {
    ramp: ["Nature's Lore", "Three Visits", "Farseek", "Cultivate", "Kodama's Reach"]
  }
};

const ROLE_KEYS: SuggestionRoleKey[] = ["ramp", "draw", "removal", "wipes", "protection", "finishers"];

const PROTECTED_CUT_CARDS = new Set(
  [
    "sol ring",
    "mana crypt",
    "arcane signet",
    "smothering tithe",
    "rhystic study",
    "mystic remora",
    "esper sentinel",
    "swords to plowshares",
    "path to exile",
    "cyclonic rift",
    "teferi's protection",
    "heroic intervention",
    "force of will",
    "fierce guardianship",
    "deflecting swat",
    "toxic deluge",
    "wrath of god",
    "damnation",
    "blasphemous act"
  ].map((name) => normalizeCardName(name))
);

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

function buildSuggestionContext(input: BuildRoleSuggestionsInput): SuggestionContext {
  const averageManaValue =
    typeof input.averageManaValue === "number" && Number.isFinite(input.averageManaValue)
      ? Math.max(0, input.averageManaValue)
      : 0;
  const manaCurve = input.manaCurve ?? {};
  const highCurveCount =
    (typeof manaCurve["5"] === "number" ? manaCurve["5"] : 0) +
    (typeof manaCurve["6"] === "number" ? manaCurve["6"] : 0) +
    (typeof manaCurve["7+"] === "number" ? manaCurve["7+"] : 0);
  const lowProtectionRow = input.roleRows.find((row) => row.key === "protection");
  const roleValues = Object.fromEntries(
    input.roleRows
      .filter((row): row is typeof row & { key: SuggestionRoleKey } => row.key !== "lands")
      .map((row) => [row.key, row.value])
  ) as Partial<Record<SuggestionRoleKey, number>>;

  return {
    archetypes: new Set((input.archetypes ?? []).filter(Boolean)),
    averageManaValue,
    manaCurve,
    topHeavyCurve: averageManaValue >= 3.3 || highCurveCount >= 20,
    lowProtection: lowProtectionRow?.status === "LOW" || (roleValues.protection ?? 0) <= 2,
    roleValues
  };
}

function archetypeSynergyScore(roleKey: SuggestionRoleKey, card: IndexedCard, context: SuggestionContext): number {
  const text = `${card.name}\n${card.typeLine}\n${card.oracleText}`.toLowerCase();
  let score = 0;

  if ((context.archetypes.has("Tokens") || context.archetypes.has("Go Wide")) && roleKey === "finishers") {
    if (/creatures you control[^.]{0,120}get \+|for each creature you control|for each token/.test(text)) score += 28;
  }

  if (context.archetypes.has("Kindred (Tribal)")) {
    if (roleKey === "draw" && /creature type|kindred|sliver|tribal/.test(text)) score += 14;
    if (roleKey === "finishers" && /for each creature type|creatures you control[^.]{0,120}get \+/.test(text)) score += 12;
  }

  if (context.archetypes.has("Legends Matter") && (roleKey === "ramp" || roleKey === "draw")) {
    if (/legendary|historic/.test(text)) score += 16;
  }

  if ((context.archetypes.has("Spellslinger") || context.archetypes.has("Storm")) && roleKey !== "ramp") {
    if ((roleKey === "draw" || roleKey === "protection" || roleKey === "removal") && /instant|sorcery/.test(card.typeLine.toLowerCase())) score += 10;
    if (roleKey === "finishers" && /(aetherflux reservoir|cast an instant or sorcery|noncreature spell)/.test(text)) score += 18;
  }

  if (context.archetypes.has("Artifacts")) {
    if ((roleKey === "ramp" || roleKey === "draw" || roleKey === "finishers") && card.typeLine.toLowerCase().includes("artifact")) score += 12;
  }

  if ((context.archetypes.has("Aristocrats") || context.archetypes.has("Life Drain")) && roleKey === "finishers") {
    if (/each opponent loses|you gain life|blood artist|drain/.test(text)) score += 14;
  }

  if (context.archetypes.has("Counters") && roleKey === "finishers") {
    if (/counter|walking ballista/.test(text)) score += 12;
  }

  if (context.archetypes.has("Lands Matter") && roleKey === "ramp") {
    if (/search your library for|additional land|land card/.test(text)) score += 10;
  }

  return score;
}

function curvePressureScore(roleKey: SuggestionRoleKey, card: IndexedCard, context: SuggestionContext): number {
  if (!context.topHeavyCurve) {
    return 0;
  }

  if (roleKey === "ramp" || roleKey === "draw" || roleKey === "removal" || roleKey === "protection") {
    if (card.mv <= 2) return 14;
    if (card.mv === 3) return 6;
    if (card.mv >= 5) return -12;
    if (card.mv === 4) return -4;
  }

  if (roleKey === "finishers") {
    if (card.mv <= 6) return 8;
    if (card.mv >= 9) return -8;
  }

  return 0;
}

function flexibilityScore(card: IndexedCard): number {
  const roleHits = ROLE_KEYS.reduce((sum, roleKey) => sum + (card.flags[roleKey] ? 1 : 0), 0);
  return Math.max(0, roleHits - 1) * 5;
}

function buildSuggestionRationale(
  roleKey: SuggestionRoleKey,
  direction: "ADD" | "CUT",
  context: SuggestionContext
): string {
  if (direction === "ADD") {
    if (roleKey === "ramp" && context.topHeavyCurve) {
      return "Top-heavy curve pushes cheaper acceleration to the front.";
    }

    if (roleKey === "protection" && context.lowProtection) {
      return "Low protection density favors cheaper shields first.";
    }

    if (roleKey === "finishers" && context.archetypes.size > 0) {
      return `Finisher picks are biased toward current archetypes: ${[...context.archetypes].slice(0, 2).join(" / ")}.`;
    }

    if (context.archetypes.size > 0) {
      return `Suggestions are biased toward current archetypes: ${[...context.archetypes].slice(0, 2).join(" / ")}.`;
    }

    return "Suggestions prioritize curve fit and staple efficiency first.";
  }

  if (context.topHeavyCurve) {
    return "Cuts prioritize expensive, lower-flexibility cards first.";
  }

  if (context.archetypes.size > 0) {
    return `Cuts avoid cards that look core to current archetypes: ${[...context.archetypes].slice(0, 2).join(" / ")}.`;
  }

  return "Cuts prioritize higher-cost, lower-flexibility role cards first.";
}

export function prewarmRoleSuggestionsIndex(cardDatabase?: SuggestionCardDatabase): void {
  if (!cardDatabase) {
    return;
  }

  buildIndexedCards(cardDatabase);
}

function preferredCandidatesForRole(
  roleKey: SuggestionRoleKey,
  deckColors: Set<string>,
  existing: Set<string>,
  context: SuggestionContext,
  limit: number,
  cardDatabase?: SuggestionCardDatabase
): string[] {
  const contextualPreferred = [...context.archetypes]
    .flatMap((archetype) => ARCHETYPE_ROLE_PRIORITY[archetype]?.[roleKey] ?? []);
  const preferred = [...new Set([...contextualPreferred, ...(ROLE_PREFERRED_ORDER[roleKey] ?? [])])];
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
  context: SuggestionContext,
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
    .map((card) => ({
      card,
      score:
        roleScore(roleKey, card) +
        curvePressureScore(roleKey, card, context) +
        archetypeSynergyScore(roleKey, card, context) +
        (roleKey === "protection" && context.lowProtection && card.mv <= 2 ? 8 : 0)
    }))
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return a.card.name.localeCompare(b.card.name);
    });

  return candidates.slice(0, limit).map((entry) => entry.card.name);
}

function cutScoreForRole(
  roleKey: SuggestionRoleKey,
  qty: number,
  card: SuggestionCardDefinition | null,
  context: SuggestionContext
): number {
  const name = card?.name ?? "";
  const normalizedName = normalizeCardName(name);
  const mv = Number.isFinite(card?.mv) ? (card?.mv ?? 0) : 0;
  const lowerTypeLine = card?.typeLine?.toLowerCase() ?? "";
  const lowerText = card?.oracleText?.toLowerCase() ?? "";

  let score = mv * 2.4 + Math.max(0, qty - 1) * 6;

  if (roleKey === "ramp") {
    if (mv >= 4) score += 8;
    if (/search your library/.test(lowerText)) score += 3;
    if (/\{t\}:\s*add\s+\{/.test(lowerText) && mv >= 3) score += 3;
    if (mv <= 2) score -= 10;
  } else if (roleKey === "draw") {
    if (mv >= 5) score += 8;
    if (lowerTypeLine.includes("sorcery")) score += 3;
    if (/draw\s+\d+\s+cards?/.test(lowerText) && mv >= 4) score += 4;
    if (mv <= 2) score -= 5;
  } else if (roleKey === "removal") {
    if (mv >= 4) score += 7;
    if (lowerTypeLine.includes("sorcery")) score += 4;
    if (/destroy target|exile target/.test(lowerText) && mv >= 4) score += 4;
    if (lowerTypeLine.includes("instant") && mv <= 2) score -= 6;
  } else if (roleKey === "wipes") {
    if (mv >= 6) score += 8;
    if (mv <= 4) score -= 5;
  } else if (roleKey === "protection") {
    if (mv >= 4) score += 8;
    if (lowerTypeLine.includes("instant") && mv <= 2) score -= 7;
  } else if (roleKey === "finishers") {
    if (mv >= 8) score += 8;
    if (mv <= 4) score -= 4;
  }

  if (PROTECTED_CUT_CARDS.has(normalizedName)) {
    score -= 20;
  }

  if (context.topHeavyCurve && mv >= 5) {
    score += 8;
  }

  if (card) {
    const indexedCard: IndexedCard = {
      name: card.name,
      normalizedName,
      mv,
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      colorIdentity: normalizeColorIdentity(card.colorIdentity),
      flags: classifyCardRoles({
        typeLine: card.typeLine,
        oracleText: card.oracleText,
        keywords: card.keywords,
        behaviorId: card.behaviorId ?? null,
        oracleId: card.oracleId,
        cardName: card.name
      })
    };
    score -= flexibilityScore(indexedCard);
    score -= archetypeSynergyScore(roleKey, indexedCard, context);
  }

  return score;
}

function cutCandidatesForRole(
  roleKey: SuggestionRoleKey,
  roleBreakdown: RoleBreakdown | undefined,
  context: SuggestionContext,
  limit: number,
  cardDatabase?: SuggestionCardDatabase
): string[] {
  const rows = roleBreakdown?.[roleKey] ?? [];
  if (!rows.length) {
    return [];
  }

  const ranked = rows
    .map((row) => ({
      name: row.name,
      qty: row.qty,
      score: cutScoreForRole(roleKey, row.qty, cardDatabase?.getCardByName(row.name) ?? null, context)
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.qty !== a.qty) {
        return b.qty - a.qty;
      }

      return a.name.localeCompare(b.name);
    });

  const picked: string[] = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    const normalized = normalizeCardName(row.name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    picked.push(row.name);
    if (picked.length >= limit) {
      break;
    }
  }

  return picked;
}

/**
 * Returns role suggestions for LOW and HIGH role buckets.
 * Strategy:
 * - LOW: suggest additions using curated staples, then dynamic engine-classified backfill.
 * - HIGH: suggest cuts from currently tagged role cards, prioritizing lower-impact trims first.
 * - Always avoid suggesting additions for cards already present in the deck.
 */
export function buildRoleSuggestions({
  roleRows,
  roleBreakdown,
  deckColorIdentity,
  existingCardNames,
  archetypes,
  manaCurve,
  averageManaValue,
  cardDatabase,
  limit = 6
}: BuildRoleSuggestionsInput): RoleSuggestions[] {
  const normalizedLimit = Math.max(3, Math.min(10, Math.floor(limit)));
  const deckColors = new Set(normalizeColorIdentity(deckColorIdentity));
  const existing = new Set(existingCardNames.map((name) => normalizeCardName(name)));
  const context = buildSuggestionContext({
    roleRows,
    roleBreakdown,
    deckColorIdentity,
    existingCardNames,
    archetypes,
    manaCurve,
    averageManaValue,
    cardDatabase,
    limit
  });
  const output: RoleSuggestions[] = [];

  for (const role of roleRows) {
    if (role.key === "lands" || role.status === "OK") {
      continue;
    }

    const roleKey = role.key as SuggestionRoleKey;
    let picked: string[] = [];
    let direction: "ADD" | "CUT" = "ADD";

    if (role.status === "LOW") {
      picked = preferredCandidatesForRole(roleKey, deckColors, existing, context, normalizedLimit, cardDatabase);
      const taken = new Set(picked.map((name) => normalizeCardName(name)));

      if (picked.length < normalizedLimit) {
        const backfill = dynamicCandidatesForRole(
          roleKey,
          deckColors,
          existing,
          taken,
          context,
          normalizedLimit - picked.length,
          cardDatabase
        );
        picked.push(...backfill);
      }
    } else {
      direction = "CUT";
      picked = cutCandidatesForRole(roleKey, roleBreakdown, context, normalizedLimit, cardDatabase);
    }

    output.push({
      key: roleKey,
      label: role.label,
      currentCount: role.value,
      recommendedRange: role.recommendedText,
      direction,
      rationale: buildSuggestionRationale(roleKey, direction, context),
      suggestions: picked
    });
  }

  return output;
}

