import { parseDecklistWithCommander } from "@/lib/decklist";
import type { RecommendedCountRow, RoleBreakdown } from "@/lib/contracts";
import type { DeckArchetypeReport } from "@/lib/archetypes";
import { getCommanderProfile } from "@/lib/commanderProfiles";
import { buildCommanderSignalPattern, COMMANDER_SIGNAL_SUGGESTION_GROUPS } from "@/lib/commanderSignals";
import { GAME_CHANGERS, getGameChangerColorIdentity } from "@/lib/gameChangers";

export type BuilderDeckCard = {
  name: string;
  qty: number;
  setCode?: string | null;
  collectorNumber?: string | null;
  printingId?: string | null;
  previewImageUrl?: string | null;
  artUrl?: string | null;
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  oracleText?: string;
  colorIdentity?: string[];
  duplicateLimit?: number | null;
  isBasicLand?: boolean;
};

export type BuilderCommanderSelection = {
  primary: {
    name: string;
    setCode?: string | null;
    collectorNumber?: string | null;
    printingId?: string | null;
  };
  secondary?: {
    name: string;
    setCode?: string | null;
    collectorNumber?: string | null;
    printingId?: string | null;
  } | null;
};

export type PreconSimilaritySummary = {
  slug: string;
  name: string;
  releaseDate: string;
  overlapCount: number;
  overlapPct: number;
};

export type BuilderCardMeta = {
  typeLine?: string;
};

export type BuilderDeckSection = {
  key:
    | "creatures"
    | "artifacts"
    | "enchantments"
    | "instants"
    | "sorceries"
    | "planeswalkers"
    | "battles"
    | "lands"
    | "other";
  label: string;
  cards: BuilderDeckCard[];
};

export type BuilderNeedSummary = {
  key: string;
  label: string;
  deficit: number;
  current: number;
  recommendedMin: number;
};

export type BuilderSuggestionSeedGroup = {
  key: string;
  label: string;
  description: string;
  names: string[];
};

const COLOR_ORDER = ["W", "U", "B", "R", "G"];

const PAIR_LAND_SUGGESTIONS: Array<{ colors: string[]; names: string[] }> = [
  { colors: ["W", "U"], names: ["Hallowed Fountain", "Glacial Fortress", "Adarkar Wastes", "Deserted Beach", "Seachrome Coast"] },
  { colors: ["U", "B"], names: ["Watery Grave", "Drowned Catacomb", "Underground River", "Shipwreck Marsh", "Clearwater Pathway"] },
  { colors: ["B", "R"], names: ["Blood Crypt", "Dragonskull Summit", "Sulfurous Springs", "Haunted Ridge", "Blightstep Pathway"] },
  { colors: ["R", "G"], names: ["Stomping Ground", "Rootbound Crag", "Karplusan Forest", "Rockfall Vale", "Cragcrown Pathway"] },
  { colors: ["G", "W"], names: ["Temple Garden", "Sunpetal Grove", "Brushland", "Overgrown Farmland", "Branchloft Pathway"] },
  { colors: ["W", "B"], names: ["Godless Shrine", "Isolated Chapel", "Caves of Koilos", "Shattered Sanctum", "Brightclimb Pathway"] },
  { colors: ["U", "R"], names: ["Steam Vents", "Sulfur Falls", "Shivan Reef", "Stormcarved Coast", "Riverglide Pathway"] },
  { colors: ["B", "G"], names: ["Overgrown Tomb", "Woodland Cemetery", "Llanowar Wastes", "Deathcap Glade", "Darkbore Pathway"] },
  { colors: ["R", "W"], names: ["Sacred Foundry", "Clifftop Retreat", "Battlefield Forge", "Sundown Pass", "Needleverge Pathway"] },
  { colors: ["G", "U"], names: ["Breeding Pool", "Hinterland Harbor", "Yavimaya Coast", "Dreamroot Cascade", "Barkchannel Pathway"] }
];

const TRIOME_SUGGESTIONS: Array<{ colors: string[]; name: string }> = [
  { colors: ["W", "U", "B"], name: "Raffine's Tower" },
  { colors: ["U", "B", "R"], name: "Xander's Lounge" },
  { colors: ["B", "R", "G"], name: "Ziatora's Proving Ground" },
  { colors: ["R", "G", "W"], name: "Jetmir's Garden" },
  { colors: ["G", "W", "U"], name: "Spara's Headquarters" },
  { colors: ["W", "B", "R"], name: "Savai Triome" },
  { colors: ["U", "R", "G"], name: "Ketria Triome" },
  { colors: ["B", "G", "W"], name: "Indatha Triome" },
  { colors: ["R", "W", "U"], name: "Raugrin Triome" },
  { colors: ["G", "U", "B"], name: "Zagoth Triome" }
];

const COMMANDER_STAPLES_BY_COLOR: Record<string, string[]> = {
  C: ["Forsaken Monument", "All Is Dust", "Ugin, the Ineffable", "Introduction to Annihilation"],
  W: ["Swords to Plowshares", "Esper Sentinel", "Teferi's Protection"],
  U: ["Rhystic Study", "Mystic Remora", "Swan Song"],
  B: ["Demonic Tutor", "Toxic Deluge", "Feed the Swarm"],
  R: ["Jeska's Will", "Deflecting Swat", "Blasphemous Act"],
  G: ["Nature's Lore", "Three Visits", "Heroic Intervention"]
};

const GENERIC_COMMANDER_STAPLES = [
  "Sol Ring",
  "Arcane Signet",
  "Swiftfoot Boots",
  "Lightning Greaves",
  "Skullclamp",
  "Sensei's Divining Top",
  "The One Ring",
  "Wayfarer's Bauble"
];

const ARCHETYPE_STAPLES: Record<string, string[]> = {
  Tokens: ["Skullclamp", "Mondrak, Glory Dominus", "Anointed Procession"],
  "Go Wide": ["Akroma's Will", "Moonshaker Cavalry", "Beastmaster Ascension"],
  Spellslinger: ["Ponder", "Preordain", "Storm-Kiln Artist"],
  Storm: ["Aetherflux Reservoir", "Birgi, God of Storytelling", "Underworld Breach"],
  Artifacts: ["Thought Monitor", "Emry, Lurker of the Loch", "Urza's Saga"],
  Enchantress: ["Enchantress's Presence", "Satyr Enchanter", "Mesa Enchantress"],
  "Kindred (Tribal)": ["Kindred Discovery", "Herald's Horn", "Path of Ancestry"],
  Counters: ["The Ozolith", "Inspiring Call", "Branching Evolution"],
  Graveyard: ["Entomb", "Life from the Loam", "Animate Dead"],
  "Lands Matter": ["Field of the Dead", "Ancient Greenwarden", "Scapeshift"]
};

const COMMANDER_ARCHETYPE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Tokens", pattern: /create [^.]{0,80}\btoken\b/i },
  { label: "Go Wide", pattern: /\bcreatures you control get \+\d+\/\+\d+\b|\bwhenever one or more creatures you control attack\b/i },
  { label: "Spellslinger", pattern: /whenever you cast an instant or sorcery|instant or sorcery spell/i },
  { label: "Storm", pattern: /\bstorm\b|copy target instant or sorcery spell/i },
  { label: "Artifacts", pattern: /\bartifact\b/i },
  { label: "Enchantress", pattern: /\benchantment spell\b|\baura\b/i },
  { label: "Counters", pattern: /\+1\/\+1 counter|proliferate|counter on/i },
  { label: "Graveyard", pattern: /\bgraveyard\b|return [^.]{0,80} from your graveyard/i },
  { label: "Lands Matter", pattern: /\bland enters the battlefield\b|play an additional land|whenever a land enters/i }
];

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function totalDeckCardCount(cards: BuilderDeckCard[]): number {
  return cards.reduce((sum, card) => sum + card.qty, 0);
}

function normalizeColorIdentity(colors: string[]): string[] {
  const normalized = [...new Set(colors.filter(Boolean).map((color) => color.toUpperCase()))].sort(
    (left, right) => COLOR_ORDER.indexOf(left) - COLOR_ORDER.indexOf(right)
  );

  if (normalized.length === 0) {
    return ["C"];
  }

  return normalized;
}

function isColorSubset(required: string[], allowed: string[]): boolean {
  const allowedSet = new Set(allowed);
  return required.every((color) => allowedSet.has(color));
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const name of names) {
    const normalized = normalizeName(name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(name);
  }

  return output;
}

export function buildBuilderDecklist(
  commander: BuilderCommanderSelection,
  cards: BuilderDeckCard[]
): string {
  const lines = ["Commander", formatBuilderDecklistLine(commander.primary.name, 1, commander.primary)];
  if (commander.secondary?.name?.trim()) {
    lines.push(formatBuilderDecklistLine(commander.secondary.name.trim(), 1, commander.secondary));
  }

  lines.push("", "Deck");

  for (const card of cards) {
    lines.push(formatBuilderDecklistLine(card.name, card.qty, card));
  }

  return lines.join("\n");
}

function formatBuilderDecklistLine(
  name: string,
  qty: number,
  card: {
    setCode?: string | null;
    collectorNumber?: string | null;
  }
): string {
  const setCode = typeof card.setCode === "string" && card.setCode.trim() ? card.setCode.trim().toUpperCase() : "";
  const collectorNumber =
    typeof card.collectorNumber === "string" && card.collectorNumber.trim() ? card.collectorNumber.trim() : "";

  if (setCode && collectorNumber) {
    return `${qty} ${name} (${setCode}) ${collectorNumber}`;
  }

  if (setCode) {
    return `${qty} ${name} (${setCode})`;
  }

  return `${qty} ${name}`;
}

export function extractNeeds(rows: RecommendedCountRow[]): Array<{
  key: string;
  label: string;
  deficit: number;
  current: number;
  recommendedMin: number;
}> {
  return rows
    .filter((row) => row.status === "LOW" && row.value < row.recommendedMin)
    .map((row) => ({
      key: row.key,
      label: row.label,
      deficit: row.recommendedMin - row.value,
      current: row.value,
      recommendedMin: row.recommendedMin
    }))
    .sort((left, right) => right.deficit - left.deficit || left.label.localeCompare(right.label));
}

export function inferCommanderArchetypes(card: {
  name: string;
  typeLine?: string;
  oracleText?: string;
}): string[] {
  const oracleText = card.oracleText ?? "";
  const typeLine = card.typeLine ?? "";
  const labels: string[] = [];

  for (const entry of COMMANDER_ARCHETYPE_PATTERNS) {
    if (entry.pattern.test(oracleText)) {
      labels.push(entry.label);
    }
  }

  if (/\bcreature\b/i.test(typeLine) && /\belf|goblin|merfolk|zombie|vampire|dragon|wizard|soldier|angel|dinosaur|sliver\b/i.test(typeLine)) {
    labels.push("Kindred (Tribal)");
  }

  return uniqueNames(labels);
}

export function buildCommanderAbilitySuggestionGroups(card: {
  name: string;
  typeLine?: string;
  oracleText?: string;
}): BuilderSuggestionSeedGroup[] {
  const oracleText = card.oracleText ?? "";
  const groups: BuilderSuggestionSeedGroup[] = [];
  const seen = new Set<string>();

  for (const group of getCommanderProfile(card.name)?.groups ?? []) {
    if (seen.has(group.key)) {
      continue;
    }

    groups.push({
      key: group.key,
      label: group.label,
      description: group.description,
      names: uniqueNames(group.cards)
    });
    seen.add(group.key);
  }

  for (const group of COMMANDER_SIGNAL_SUGGESTION_GROUPS) {
    if (!buildCommanderSignalPattern(group.patternSource).test(oracleText) || seen.has(group.key)) {
      continue;
    }

    groups.push({
      key: group.key,
      label: group.label,
      description: group.description,
      names: uniqueNames(group.names)
    });
    seen.add(group.key);
  }

  return groups.filter((group) => group.names.length > 0);
}

export function computePreconSimilarity(
  currentCards: BuilderDeckCard[],
  precon: {
    slug: string;
    name: string;
    releaseDate: string;
    decklist: string;
  }
): PreconSimilaritySummary {
  const currentCardNames = new Set(currentCards.map((card) => normalizeName(card.name)));
  const preconDeck = parseDecklistWithCommander(precon.decklist);
  const overlapCount = preconDeck.entries.reduce((sum, entry) => {
    return sum + (currentCardNames.has(normalizeName(entry.name)) ? 1 : 0);
  }, 0);
  const overlapPct =
    preconDeck.entries.length === 0 ? 0 : Math.round((overlapCount / preconDeck.entries.length) * 100);

  return {
    slug: precon.slug,
    name: precon.name,
    releaseDate: precon.releaseDate,
    overlapCount,
    overlapPct
  };
}

export function buildArchetypeLabel(report: DeckArchetypeReport | null | undefined): string | null {
  if (!report?.primary?.archetype) {
    return null;
  }

  if (report.secondary?.archetype) {
    return `${report.primary.archetype} / ${report.secondary.archetype}`;
  }

  return report.primary.archetype;
}

export function buildCommanderStapleSuggestionNames(
  colors: string[] = []
): string[] {
  const normalizedColors = normalizeColorIdentity(colors);
  const names = [...GENERIC_COMMANDER_STAPLES];

  if (normalizedColors.length >= 2) {
    names.push("Fellwar Stone");
  }

  if (normalizedColors.length >= 3) {
    names.push("Chromatic Lantern");
  }

  return uniqueNames(names);
}

export function buildColorStapleSuggestionNames(colors: string[]): string[] {
  const normalizedColors = normalizeColorIdentity(colors);
  const names: string[] = [];

  for (const color of normalizedColors) {
    names.push(...(COMMANDER_STAPLES_BY_COLOR[color] ?? []));
  }

  return uniqueNames(names);
}

export function buildGameChangerSuggestionNames(colors: string[]): string[] {
  const normalizedColors = normalizeColorIdentity(colors);
  const allowedColors = new Set(normalizedColors.filter((color) => color !== "C"));

  return [...GAME_CHANGERS].filter((name) => {
    const colorIdentity = getGameChangerColorIdentity(name);
    if (!colorIdentity) {
      return false;
    }

    return colorIdentity.every((color) => allowedColors.has(color));
  });
}

export function buildArchetypeSynergySuggestionNames(archetypes: string[]): string[] {
  const names: string[] = [];

  for (const archetype of archetypes) {
    names.push(...(ARCHETYPE_STAPLES[archetype] ?? []));
  }

  return uniqueNames(names);
}

export function buildManaBaseSuggestionNames(colors: string[]): string[] {
  const normalizedColors = normalizeColorIdentity(colors);

  const basicsByColor: Record<string, string> = {
    W: "Plains",
    U: "Island",
    B: "Swamp",
    R: "Mountain",
    G: "Forest"
  };

  const names: string[] = [
    "Command Tower",
    "Exotic Orchard",
    "Path of Ancestry",
    "Reflecting Pool",
    "Fabled Passage",
    "Terramorphic Expanse",
    "Evolving Wilds"
  ];

  for (const color of normalizedColors) {
    names.push(basicsByColor[color] ?? "Wastes");
  }

  if (normalizedColors.length === 1 && normalizedColors[0] === "C") {
    names.push("War Room", "Myriad Landscape", "Reliquary Tower", "Rogue's Passage");
    return uniqueNames(names);
  }

  if (normalizedColors.length === 1) {
    names.push("War Room", "Myriad Landscape");
    return uniqueNames(names);
  }

  if (normalizedColors.length >= 3) {
    names.push("City of Brass", "Mana Confluence");
  }

  for (const row of PAIR_LAND_SUGGESTIONS) {
    if (isColorSubset(row.colors, normalizedColors)) {
      names.push(...row.names);
    }
  }

  if (normalizedColors.length >= 3) {
    for (const triome of TRIOME_SUGGESTIONS) {
      if (isColorSubset(triome.colors, normalizedColors)) {
        names.push(triome.name);
      }
    }
  }

  if (normalizedColors.length === 5) {
    names.push("The World Tree");
  }

  return uniqueNames(names);
}

export function categorizeBuilderDeckCards(
  cards: BuilderDeckCard[],
  _roleBreakdown: RoleBreakdown | null | undefined,
  cardMetaByName: Record<string, BuilderCardMeta>
): BuilderDeckSection[] {
  const typePriority: Array<Exclude<BuilderDeckSection["key"], "lands" | "other">> = [
    "creatures",
    "artifacts",
    "enchantments",
    "instants",
    "sorceries",
    "planeswalkers",
    "battles"
  ];

  const labels: Record<BuilderDeckSection["key"], string> = {
    creatures: "Creatures",
    artifacts: "Artifacts",
    enchantments: "Enchantments",
    instants: "Instants",
    sorceries: "Sorceries",
    planeswalkers: "Planeswalkers",
    battles: "Battles",
    lands: "Lands",
    other: "Other"
  };

  const buckets = new Map<BuilderDeckSection["key"], BuilderDeckCard[]>();
  for (const key of [...typePriority, "lands", "other"] as BuilderDeckSection["key"][]) {
    buckets.set(key, []);
  }

  for (const card of cards) {
    const normalized = normalizeName(card.name);
    const typeLine = (card.typeLine ?? cardMetaByName[normalized]?.typeLine ?? "").toLowerCase();
    if (typeLine.includes("land")) {
      buckets.get("lands")?.push(card);
      continue;
    }

    let sectionKey: BuilderDeckSection["key"] = "other";
    if (typeLine.includes("creature")) {
      sectionKey = "creatures";
    } else if (typeLine.includes("artifact")) {
      sectionKey = "artifacts";
    } else if (typeLine.includes("enchantment")) {
      sectionKey = "enchantments";
    } else if (typeLine.includes("instant")) {
      sectionKey = "instants";
    } else if (typeLine.includes("sorcery")) {
      sectionKey = "sorceries";
    } else if (typeLine.includes("planeswalker")) {
      sectionKey = "planeswalkers";
    } else if (typeLine.includes("battle")) {
      sectionKey = "battles";
    }

    buckets.get(sectionKey)?.push(card);
  }

  return ([...typePriority, "lands", "other"] as BuilderDeckSection["key"][])
    .map((key) => ({
      key,
      label: labels[key],
      cards: buckets.get(key) ?? []
    }))
    .filter((section) => section.cards.length > 0);
}
