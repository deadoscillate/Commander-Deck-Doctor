"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnalysisReport } from "@/components/AnalysisReport";
import { CardLink } from "@/components/CardLink";
import { ColorIdentityIcons } from "@/components/ColorIdentityIcons";
import { CommanderHeroHeader } from "@/components/CommanderHeroHeader";
import { ManaCost } from "@/components/ManaCost";
import type { AnalyzeResponse, CommanderChoice, RoleBreakdown } from "@/lib/contracts";
import {
  buildArchetypeSynergySuggestionNames,
  buildArchetypeLabel,
  buildCommanderAbilitySuggestionGroups,
  buildBuilderDecklist,
  buildCommanderStapleSuggestionNames,
  buildColorStapleSuggestionNames,
  buildGameChangerSuggestionNames,
  buildManaBaseSuggestionNames,
  categorizeBuilderDeckCards,
  extractNeeds,
  inferCommanderArchetypes,
  totalDeckCardCount,
  type BuilderCardMeta,
  type BuilderCommanderSelection,
  type BuilderDeckCard
} from "@/lib/builder";

const BUILDER_STORAGE_KEY = "commanderDeckDoctor.builderDecks.v1";
const MAX_SAVED_BUILDS = 20;

type CardSearchRecord = {
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colorIdentity: string[];
  setCode: string | null;
  setName?: string | null;
  setReleaseYear?: number | null;
  collectorNumber: string | null;
  printingId: string | null;
  commanderEligible: boolean;
  isBasicLand: boolean;
  duplicateLimit: number | null;
  previewImageUrl: string | null;
  artUrl: string | null;
  pairOptions?: CommanderChoice["pairOptions"];
  pairOptionsResolved?: boolean;
};

type CardSearchResponse = {
  query: string;
  count: number;
  items: CardSearchRecord[];
};

type CardSearchSetOption = {
  setCode: string;
  setName: string;
  releasedAt: string | null;
  releaseYear: number | null;
};

type SavedBuilderDeck = {
  id: string;
  name: string;
  commander: CardSearchRecord;
  partnerName: string | null;
  cards: BuilderDeckCard[];
  updatedAt: string;
};

type SuggestionCardItem = {
  name: string;
  note?: string;
  action?: "add" | "none";
};

type SuggestionGroup = {
  key: string;
  label: string;
  description?: string;
  items: SuggestionCardItem[];
};

type SuggestionCollections = {
  ruleFixGroups: SuggestionGroup[];
  commanderAbilityGroups: SuggestionGroup[];
  roleGroups: SuggestionGroup[];
  comboGroups: SuggestionGroup[];
  stapleGroup: SuggestionGroup | null;
  colorStapleGroup: SuggestionGroup | null;
  gameChangerGroup: SuggestionGroup | null;
  manaBaseGroup: SuggestionGroup | null;
};

type RemoteCommanderProfileResponse = {
  commanderName: string;
  source: "curated" | "generated" | "none";
  profile: {
    groups: Array<{
      key: string;
      label: string;
      description: string;
      cards: string[];
    }>;
  } | null;
};

type BuilderCardTypeFilter = "" | "artifact" | "battle" | "creature" | "enchantment" | "instant" | "land" | "planeswalker" | "sorcery";
type BuilderHeaderTab =
  | "search"
  | "staples"
  | "color-staples"
  | "gameplan"
  | "legality"
  | "smart"
  | "combos"
  | "game-changers"
  | "mana-base";

const CARD_TYPE_FILTERS: Array<{ value: BuilderCardTypeFilter; label: string }> = [
  { value: "", label: "All types" },
  { value: "artifact", label: "Artifacts" },
  { value: "battle", label: "Battles" },
  { value: "creature", label: "Creatures" },
  { value: "enchantment", label: "Enchantments" },
  { value: "instant", label: "Instants" },
  { value: "land", label: "Lands" },
  { value: "planeswalker", label: "Planeswalkers" },
  { value: "sorcery", label: "Sorceries" }
];

const ARCHETYPE_ROLE_PRIORITIES: Record<string, string[]> = {
  Tokens: ["draw", "protection", "finishers"],
  "Go Wide": ["draw", "protection", "finishers"],
  Spellslinger: ["draw", "ramp", "protection"],
  Storm: ["draw", "ramp", "protection"],
  Artifacts: ["ramp", "draw", "protection"],
  Enchantress: ["draw", "protection", "removal"],
  "Kindred (Tribal)": ["draw", "protection", "finishers"],
  Counters: ["protection", "draw", "finishers"],
  Graveyard: ["draw", "ramp", "finishers"],
  "Lands Matter": ["ramp", "draw", "finishers"]
};

const ROLE_FALLBACK_SUGGESTIONS: Record<string, Record<string, string[]>> = {
  ramp: {
    C: ["Sol Ring", "Arcane Signet", "Wayfarer's Bauble"],
    W: ["Smothering Tithe", "Archaeomancer's Map"],
    U: ["High Tide", "Midnight Clock"],
    B: ["Black Market Connections", "Crypt Ghast"],
    R: ["Jeska's Will", "Strike It Rich"],
    G: ["Nature's Lore", "Three Visits", "Rampant Growth", "Cultivate"]
  },
  draw: {
    C: ["Skullclamp", "The One Ring"],
    W: ["Esper Sentinel", "Tocasia's Welcome"],
    U: ["Rhystic Study", "Mystic Remora", "Ponder", "Preordain"],
    B: ["Phyrexian Arena", "Night's Whisper"],
    R: ["Wheel of Misfortune", "Faithless Looting"],
    G: ["Guardian Project", "Beast Whisperer", "Rishkar's Expertise"]
  },
  removal: {
    C: ["Spine of Ish Sah"],
    W: ["Swords to Plowshares", "Generous Gift"],
    U: ["Pongify", "Rapid Hybridization"],
    B: ["Feed the Swarm", "Infernal Grasp"],
    R: ["Chaos Warp", "Abrade"],
    G: ["Beast Within", "Song of the Dryads"]
  },
  wipes: {
    C: ["All Is Dust"],
    W: ["Austere Command", "Farewell"],
    U: ["Cyclonic Rift"],
    B: ["Toxic Deluge", "Deadly Tempest"],
    R: ["Blasphemous Act", "Chain Reaction"],
    G: ["Bane of Progress"]
  },
  protection: {
    C: ["Lightning Greaves", "Swiftfoot Boots"],
    W: ["Teferi's Protection", "Flawless Maneuver"],
    U: ["Swan Song", "An Offer You Can't Refuse"],
    B: ["Malakir Rebirth"],
    R: ["Deflecting Swat"],
    G: ["Heroic Intervention", "Tamiyo's Safekeeping"]
  },
  finishers: {
    C: ["Akroma's Memorial"],
    W: ["Akroma's Will"],
    U: ["Coastal Piracy"],
    B: ["Torment of Hailfire"],
    R: ["Shared Animosity"],
    G: ["Craterhoof Behemoth", "Finale of Devastation", "Triumph of the Hordes"]
  }
};

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeSavedBuilderCard(card: BuilderDeckCard): BuilderDeckCard {
  return {
    name: card.name,
    qty: Math.max(1, Math.floor(card.qty)),
    setCode: typeof card.setCode === "string" && card.setCode.trim() ? card.setCode.trim().toUpperCase() : null,
    collectorNumber:
      typeof card.collectorNumber === "string" && card.collectorNumber.trim() ? card.collectorNumber.trim() : null,
    printingId: typeof card.printingId === "string" && card.printingId.trim() ? card.printingId.trim() : null,
    previewImageUrl:
      typeof card.previewImageUrl === "string" && card.previewImageUrl.trim() ? card.previewImageUrl.trim() : null,
    artUrl: typeof card.artUrl === "string" && card.artUrl.trim() ? card.artUrl.trim() : null,
    manaCost: typeof card.manaCost === "string" ? card.manaCost : "",
    cmc: typeof card.cmc === "number" && Number.isFinite(card.cmc) ? card.cmc : 0,
    typeLine: typeof card.typeLine === "string" ? card.typeLine : "",
    oracleText: typeof card.oracleText === "string" ? card.oracleText : "",
    colorIdentity: Array.isArray(card.colorIdentity)
      ? card.colorIdentity.filter((color): color is string => typeof color === "string")
      : [],
    duplicateLimit: typeof card.duplicateLimit === "number" ? card.duplicateLimit : null,
    isBasicLand: card.isBasicLand === true
  };
}

function parseSavedBuilderDecks(raw: string | null): SavedBuilderDeck[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const record = entry as Partial<SavedBuilderDeck>;
        if (!record.commander || typeof record.commander !== "object") {
          return null;
        }

        const cards: BuilderDeckCard[] = Array.isArray(record.cards)
          ? record.cards
              .filter((card): card is BuilderDeckCard => {
                return Boolean(card) && typeof card === "object" && typeof card.name === "string" && typeof card.qty === "number";
              })
              .map((card) => normalizeSavedBuilderCard(card))
          : [];

        return {
          id: typeof record.id === "string" && record.id ? record.id : `builder-${Date.now()}`,
          name:
            typeof record.name === "string" && record.name.trim()
              ? record.name.trim()
              : typeof (record.commander as { name?: unknown }).name === "string"
                ? `${(record.commander as { name: string }).name} Builder`
                : "Saved Build",
          commander: record.commander as CardSearchRecord,
          partnerName: typeof record.partnerName === "string" && record.partnerName ? record.partnerName : null,
          cards,
          updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString()
        } satisfies SavedBuilderDeck;
      })
      .filter((entry): entry is SavedBuilderDeck => entry !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_SAVED_BUILDS);
  } catch {
    return [];
  }
}

function createSavedDeckId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `builder-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function addCardToDeck(current: BuilderDeckCard[], card: CardSearchRecord): BuilderDeckCard[] {
  const existing = current.find((entry) => normalizeName(entry.name) === normalizeName(card.name));
  if (existing) {
    const duplicateLimit = card.duplicateLimit;
    if (duplicateLimit !== null && Number.isFinite(duplicateLimit) && existing.qty >= duplicateLimit) {
      return current;
    }

    if (!card.isBasicLand && duplicateLimit === null) {
      return current;
    }

    return current.map((entry) =>
      normalizeName(entry.name) === normalizeName(card.name)
        ? {
            ...entry,
            qty: entry.qty + 1,
            setCode: entry.setCode ?? card.setCode,
            collectorNumber: entry.collectorNumber ?? card.collectorNumber,
            printingId: entry.printingId ?? card.printingId,
            previewImageUrl: entry.previewImageUrl ?? card.previewImageUrl,
            artUrl: entry.artUrl ?? card.artUrl,
            manaCost: entry.manaCost ?? card.manaCost,
            cmc: entry.cmc ?? card.cmc,
            typeLine: entry.typeLine ?? card.typeLine,
            oracleText: entry.oracleText ?? card.oracleText,
            colorIdentity: entry.colorIdentity ?? card.colorIdentity,
            duplicateLimit: entry.duplicateLimit ?? card.duplicateLimit,
            isBasicLand: entry.isBasicLand ?? card.isBasicLand
          }
        : entry
    );
  }

  return [
    ...current,
    {
      name: card.name,
      qty: 1,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      printingId: card.printingId,
      previewImageUrl: card.previewImageUrl,
      artUrl: card.artUrl,
      manaCost: card.manaCost,
      cmc: card.cmc,
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      colorIdentity: card.colorIdentity,
      duplicateLimit: card.duplicateLimit,
      isBasicLand: card.isBasicLand
    }
  ].sort((left, right) => left.name.localeCompare(right.name));
}

function updateCardQty(current: BuilderDeckCard[], cardName: string, delta: number): BuilderDeckCard[] {
  return current
    .map((entry) =>
      normalizeName(entry.name) === normalizeName(cardName)
        ? { ...entry, qty: entry.qty + delta }
        : entry
    )
    .filter((entry) => entry.qty > 0);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function isBasicLandName(name: string): boolean {
  return [
    "Plains",
    "Island",
    "Swamp",
    "Mountain",
    "Forest",
    "Wastes",
    "Snow-Covered Plains",
    "Snow-Covered Island",
    "Snow-Covered Swamp",
    "Snow-Covered Mountain",
    "Snow-Covered Forest",
    "Snow-Covered Wastes"
  ].some((basic) => normalizeName(basic) === normalizeName(name));
}

function basicCardTemplate(name: string, isBasicLand = false, duplicateLimit: number | null = null): CardSearchRecord {
  return {
    name,
    manaCost: "",
    cmc: 0,
    typeLine: "",
    oracleText: "",
    colorIdentity: [],
    setCode: null,
    collectorNumber: null,
    printingId: null,
    commanderEligible: false,
    isBasicLand,
    duplicateLimit,
    previewImageUrl: null,
    artUrl: null
  };
}

function normalizeRoleBreakdown(result: AnalyzeResponse | null): RoleBreakdown | null {
  if (!result) {
    return null;
  }

  const empty: RoleBreakdown = {
    ramp: [],
    draw: [],
    removal: [],
    wipes: [],
    tutors: [],
    protection: [],
    finishers: []
  };

  const rawRoleBreakdown = (result as { roleBreakdown?: unknown }).roleBreakdown;
  if (!rawRoleBreakdown || typeof rawRoleBreakdown !== "object") {
    return empty;
  }

  const record = rawRoleBreakdown as Record<string, unknown>;
  for (const key of Object.keys(empty) as Array<keyof RoleBreakdown>) {
    const rows = record[key];
    if (!Array.isArray(rows)) {
      continue;
    }

    empty[key] = rows
      .filter((row): row is { name?: unknown; qty?: unknown } => Boolean(row) && typeof row === "object")
      .map((row) => ({
        name: typeof row.name === "string" ? row.name.trim() : "",
        qty: typeof row.qty === "number" && Number.isFinite(row.qty) ? Math.max(0, Math.floor(row.qty)) : 0
      }))
      .filter((row) => row.name.length > 0 && row.qty > 0);
  }

  return empty;
}

function buildCommanderRoleSuggestionGroups(
  colors: string[],
  archetypes: string[],
  needs: Array<{ key: string; label: string; deficit: number; recommendedMin: number }>
): SuggestionGroup[] {
  const colorKeys = ["C", ...colors];
  const groups: SuggestionGroup[] = [];
  const roleKeys = new Set<string>(needs.map((need) => need.key));

  if (roleKeys.size === 0) {
    for (const archetype of archetypes) {
      for (const roleKey of ARCHETYPE_ROLE_PRIORITIES[archetype] ?? []) {
        roleKeys.add(roleKey);
      }
    }
  }

  if (roleKeys.size === 0) {
    for (const fallbackRole of ["ramp", "draw", "removal"]) {
      roleKeys.add(fallbackRole);
    }
  }

  for (const roleKey of roleKeys) {
    if (!(roleKey in ROLE_FALLBACK_SUGGESTIONS)) {
      continue;
    }

    const need = needs.find((entry) => entry.key === roleKey) ?? null;
    const suggestions = colorKeys.flatMap((color) => ROLE_FALLBACK_SUGGESTIONS[roleKey]?.[color] ?? []);
    groups.push({
      key: `fallback-${roleKey}`,
      label: need?.label ?? roleKey.charAt(0).toUpperCase() + roleKey.slice(1),
      description: need
        ? `Builder fallback for ${need.label.toLowerCase()}. Target minimum: ${need.recommendedMin}.`
        : `Commander-first fallback picks for ${roleKey}.`,
      items: [...new Set(suggestions)].map((name) => ({ name }))
    });
  }

  if (archetypes.length > 0) {
    groups.push({
      key: "fallback-archetype-synergy",
      label: "Synergy Pieces",
      description: `Commander-driven synergy picks for ${archetypes.join(" / ")}.`,
      items: buildArchetypeSynergySuggestionNames(archetypes).map((name) => ({ name }))
    });
  }

  return groups.filter((group) => group.items.length > 0);
}

function buildRuleFixGroups(result: AnalyzeResponse | null): SuggestionGroup[] {
  if (!result?.rulesEngine || result.rulesEngine.status === "PASS") {
    return [];
  }

  const items: SuggestionCardItem[] = [];
  const seen = new Set<string>();

  const pushFixItem = (name: string, note: string) => {
    const normalized = normalizeName(name);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    items.push({
      name,
      note,
      action: "none"
    });
  };

  for (const entry of result.checks.colorIdentity.offColorCards) {
    pushFixItem(entry.name, "Off-color for the selected commander. Remove or replace with a legal card.");
  }

  for (const entry of result.checks.singleton.duplicates) {
    pushFixItem(entry.name, "Duplicate copies are not legal here unless the card text explicitly allows them.");
  }

  for (const rule of result.rulesEngine.rules.filter((entry) => entry.outcome === "FAIL")) {
    if (rule.id === "commander.banlist") {
      for (const finding of rule.findings) {
        pushFixItem(finding.name, "Banned in Commander. Replace with a legal alternative.");
      }
    }

    if (rule.id === "commander.special-card-type-bans") {
      for (const finding of rule.findings) {
        pushFixItem(finding.name, "Illegal in Commander because of special card-type restrictions.");
      }
    }

    if (rule.id === "commander.companion-legality") {
      for (const finding of rule.findings) {
        pushFixItem(finding.name, "Companion setup is illegal for the current deck configuration.");
      }
    }
  }

  if (items.length === 0) {
    return [];
  }

  return [
    {
      key: "legality-fixes",
      label: "Legality Fixes",
      description: "Live rules-engine issues that should be fixed before tuning the rest of the list.",
      items
    }
  ];
}

function mergeSuggestionGroups(
  primary: SuggestionGroup[],
  fallback: SuggestionGroup[]
): SuggestionGroup[] {
  const seen = new Set(primary.map((group) => group.label.toLowerCase()));
  return [
    ...primary,
    ...fallback.filter((group) => {
      const key = group.label.toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
  ];
}

function buildSuggestionGroups(
  result: AnalyzeResponse | null,
  commanderStaples: string[],
  colorStaples: string[],
  gameChangerSuggestions: string[],
  manaBaseSuggestions: string[],
  commanderAbilityGroups: SuggestionGroup[],
  ruleFixGroups: SuggestionGroup[],
  fallbackRoleGroups: SuggestionGroup[]
): SuggestionCollections {
  if (!result) {
    return {
      ruleFixGroups: [],
      commanderAbilityGroups,
      roleGroups: fallbackRoleGroups,
      comboGroups: [],
      stapleGroup: commanderStaples.length > 0
        ? {
            key: "commander-staples",
            label: "Commander Staples",
            description: "Common Commander play-pattern staples that fit most builds.",
            items: commanderStaples.map((name) => ({ name }))
          }
        : null,
      colorStapleGroup: colorStaples.length > 0
        ? {
            key: "color-staples",
            label: "Color Staples",
            description: "Color-identity staples that usually overperform in these colors.",
            items: colorStaples.map((name) => ({ name }))
          }
        : null,
      gameChangerGroup: gameChangerSuggestions.length > 0
        ? {
            key: "game-changers",
            label: "Game Changer Suggestions",
            description: "Commander bracket game changers you could add if you want a stronger ceiling.",
            items: gameChangerSuggestions.map((name) => ({ name }))
          }
        : null,
      manaBaseGroup: manaBaseSuggestions.length > 0
        ? {
            key: "mana-base",
            label: "Mana Base Suggestions",
            description: "Staple fixing lands, duals, and triomes for the current color identity.",
            items: manaBaseSuggestions.map((name) => ({ name }))
          }
        : null
    };
  }

  const roleGroups: SuggestionGroup[] = result.improvementSuggestions.items
    .filter((item) => item.direction === "ADD" && item.suggestions.length > 0)
    .map((item) => ({
      key: item.key,
      label: item.label,
      description: item.rationale ?? `Recommended range ${item.recommendedRange}.`,
      items: item.suggestions.map((name) => ({ name }))
    }));

  const comboGroups: SuggestionGroup[] = result.comboReport.potential.map((combo, index) => {
    const requires = Array.isArray(combo.requires) ? combo.requires : [];
    const missingCards = Array.isArray(combo.missingCards) ? combo.missingCards : [];

    return {
      key: `combo-${index}`,
      label: combo.comboName,
      description: `Missing ${combo.missingCount} card(s); matched ${combo.matchCount}/${combo.cards.length}.`,
      items: missingCards.map((name) => ({
        name,
        note: requires.length > 0 ? requires.join("; ") : undefined
      }))
    };
  });

  return {
    ruleFixGroups,
    commanderAbilityGroups,
    roleGroups: mergeSuggestionGroups(roleGroups, fallbackRoleGroups),
    comboGroups,
    stapleGroup:
      commanderStaples.length > 0
        ? {
            key: "commander-staples",
            label: "Commander Staples",
            description: "Common Commander play-pattern staples that fit most builds.",
            items: commanderStaples.map((name) => ({ name }))
          }
        : null,
    colorStapleGroup:
      colorStaples.length > 0
        ? {
            key: "color-staples",
            label: "Color Staples",
            description: "Color-identity staples that usually overperform in these colors.",
            items: colorStaples.map((name) => ({ name }))
          }
        : null,
    gameChangerGroup:
      gameChangerSuggestions.length > 0
        ? {
            key: "game-changers",
            label: "Game Changer Suggestions",
            description: "Commander bracket game changers you could add if you want a stronger ceiling.",
            items: gameChangerSuggestions.map((name) => ({ name }))
          }
        : null,
    manaBaseGroup:
      manaBaseSuggestions.length > 0
        ? {
          key: "mana-base",
          label: "Mana Base Suggestions",
            description: "Staple fixing lands, duals, and triomes for the current color identity.",
            items: manaBaseSuggestions.map((name) => ({ name }))
          }
        : null
  };
}

function getSuggestionGroupItemLimit(group: SuggestionGroup): number {
  switch (group.key) {
    case "commander-staples":
    case "color-staples":
    case "game-changers":
      return 8;
    case "mana-base":
      return 12;
    default:
      return group.key.startsWith("combo-") ? 4 : 6;
  }
}

function limitSuggestionGroup(group: SuggestionGroup): SuggestionGroup {
  return {
    ...group,
    items: group.items.slice(0, getSuggestionGroupItemLimit(group))
  };
}

function canAddMoreCopies(record: CardSearchRecord, existingQty: number): boolean {
  const duplicateLimit = record.duplicateLimit;
  return (
    existingQty === 0 ||
    record.isBasicLand ||
    duplicateLimit === Number.POSITIVE_INFINITY ||
    (typeof duplicateLimit === "number" && existingQty < duplicateLimit)
  );
}

function shouldShowDeckQuantity(record: CardSearchRecord): boolean {
  const duplicateLimit = record.duplicateLimit;
  return (
    record.isBasicLand ||
    duplicateLimit === Number.POSITIVE_INFINITY ||
    (typeof duplicateLimit === "number" && Number.isFinite(duplicateLimit) && duplicateLimit > 1)
  );
}

function toCardMetaMap(records: Record<string, CardSearchRecord>): Record<string, BuilderCardMeta> {
  return Object.fromEntries(
    Object.entries(records).map(([key, record]) => [
      key,
      {
        typeLine: record.typeLine
      }
    ])
  );
}

export function CommanderDeckBuilder() {
  const [deckName, setDeckName] = useState("");
  const [commanderQuery, setCommanderQuery] = useState("");
  const [commanderColors, setCommanderColors] = useState<string[]>([]);
  const [commanderResults, setCommanderResults] = useState<CardSearchRecord[]>([]);
  const [commanderLoading, setCommanderLoading] = useState(false);
  const [commanderError, setCommanderError] = useState("");
  const [selectedCommander, setSelectedCommander] = useState<CardSearchRecord | null>(null);
  const [selectedPartnerName, setSelectedPartnerName] = useState("");
  const [deckCards, setDeckCards] = useState<BuilderDeckCard[]>([]);
  const [cardQuery, setCardQuery] = useState("");
  const [cardTypeFilter, setCardTypeFilter] = useState<BuilderCardTypeFilter>("");
  const [cardSetFilter, setCardSetFilter] = useState("");
  const [activeHeaderTab, setActiveHeaderTab] = useState<BuilderHeaderTab | null>("search");
  const [setOptions, setSetOptions] = useState<CardSearchSetOption[]>([]);
  const [cardResults, setCardResults] = useState<CardSearchRecord[]>([]);
  const [cardSearchLoading, setCardSearchLoading] = useState(false);
  const [cardSearchError, setCardSearchError] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [remoteCommanderProfile, setRemoteCommanderProfile] = useState<RemoteCommanderProfileResponse | null>(null);
  const [savedDecks, setSavedDecks] = useState<SavedBuilderDeck[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [decklistActionMessage, setDecklistActionMessage] = useState("");
  const [showReportView, setShowReportView] = useState(false);
  const [resolvedCardsByName, setResolvedCardsByName] = useState<Record<string, CardSearchRecord>>({});
  const analyzeRequestId = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSavedDecks(parseSavedBuilderDecks(window.localStorage.getItem(BUILDER_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSetOptions() {
      try {
        const response = await fetch("/api/card-search?meta=sets", { cache: "force-cache" });
        if (!response.ok || cancelled) {
          return;
        }

        const payload = (await response.json()) as { items?: CardSearchSetOption[] };
        if (!cancelled) {
          setSetOptions(
            Array.isArray(payload.items)
              ? payload.items.filter(
                  (row): row is CardSearchSetOption =>
                    Boolean(row) &&
                    typeof row === "object" &&
                    typeof row.setCode === "string" &&
                    typeof row.setName === "string"
                )
              : []
          );
        }
      } catch {
        if (!cancelled) {
          setSetOptions([]);
        }
      }
    }

    void loadSetOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  function persistSavedDecks(next: SavedBuilderDeck[]) {
    setSavedDecks(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(next));
    }
  }

  function toggleCommanderColor(color: string) {
    setCommanderColors((previous) =>
      previous.includes(color) ? previous.filter((entry) => entry !== color) : [...previous, color]
    );
  }

  useEffect(() => {
    const query = commanderQuery.trim();
    if (!query || query.length < 2) {
      setCommanderResults([]);
      setCommanderLoading(false);
      setCommanderError("");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setCommanderLoading(true);
      setCommanderError("");

      try {
        const params = new URLSearchParams({
          commanderOnly: "1",
          limit: "10"
        });
        params.set("q", query);
        if (commanderColors.length > 0) {
          params.set("colors", [...commanderColors].sort().join(","));
        }

        const response = await fetch(`/api/card-search?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as CardSearchResponse | { error: string };
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setCommanderResults([]);
          setCommanderError("error" in payload ? payload.error : "Could not search commanders.");
          return;
        }

        setCommanderResults((payload as CardSearchResponse).items);
      } catch {
        if (!cancelled) {
          setCommanderResults([]);
          setCommanderError("Could not search commanders.");
        }
      } finally {
        if (!cancelled) {
          setCommanderLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [commanderColors, commanderQuery]);

  useEffect(() => {
    if (!selectedCommander || selectedCommander.pairOptionsResolved) {
      return;
    }

    const commanderName = selectedCommander.name;
    let cancelled = false;

    async function loadCommanderPairOptions() {
      try {
        const response = await fetch("/api/card-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            names: [commanderName],
            commanderOnly: true,
            includePairs: true
          })
        });
        const payload = (await response.json()) as CardSearchResponse | { error: string };
        if (cancelled || !response.ok) {
          return;
        }

        const updatedCommander = (payload as CardSearchResponse).items?.[0];
        if (!updatedCommander) {
          return;
        }

        setSelectedCommander((current) =>
          current && normalizeName(current.name) === normalizeName(updatedCommander.name) ? updatedCommander : current
        );
      } catch {
        // Leave commander selection usable even if pair metadata fails to load.
      }
    }

    void loadCommanderPairOptions();

    return () => {
      cancelled = true;
    };
  }, [selectedCommander]);

  useEffect(() => {
    if (!selectedCommander) {
      setRemoteCommanderProfile(null);
      return;
    }

    let cancelled = false;
    setRemoteCommanderProfile(null);
    const commanderName = selectedCommander.name;

    async function loadCommanderProfile() {
      try {
        const response = await fetch(
          `/api/commander-profile?name=${encodeURIComponent(commanderName)}`,
          { cache: "force-cache" }
        );
        const payload = (await response.json()) as RemoteCommanderProfileResponse | { error: string };
        if (cancelled) {
          return;
        }

        if (!response.ok || "error" in payload) {
          setRemoteCommanderProfile(null);
          return;
        }

        setRemoteCommanderProfile(payload);
      } catch {
        if (!cancelled) {
          setRemoteCommanderProfile(null);
        }
      }
    }

    void loadCommanderProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedCommander]);

  const selectedPairOption = useMemo(
    () => selectedCommander?.pairOptions?.find((option) => option.name === selectedPartnerName) ?? null,
    [selectedCommander, selectedPartnerName]
  );

  const allowedColorIdentity = useMemo(() => {
    if (selectedPairOption) {
      return selectedPairOption.combinedColorIdentity;
    }

    return selectedCommander?.colorIdentity ?? [];
  }, [selectedCommander, selectedPairOption]);

  const suggestionColorIdentity = useMemo(
    () => (selectedCommander && allowedColorIdentity.length === 0 ? ["C"] : allowedColorIdentity),
    [allowedColorIdentity, selectedCommander]
  );

  const commanderSelection = useMemo<BuilderCommanderSelection | null>(() => {
    if (!selectedCommander) {
      return null;
    }

    return {
      primary: selectedCommander.name,
      secondary: selectedPairOption?.name ?? null
    };
  }, [selectedCommander, selectedPairOption]);

  const expectedMainDeckSize = selectedPairOption ? 98 : selectedCommander ? 99 : 0;
  const currentMainDeckCount = totalDeckCardCount(deckCards);

  useEffect(() => {
    if (!selectedCommander) {
      setCardResults([]);
      setCardSearchError("");
      return;
    }

    if (!cardQuery.trim() && !cardTypeFilter && !cardSetFilter.trim()) {
      setCardResults([]);
      setCardSearchError("");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setCardSearchLoading(true);
      setCardSearchError("");

      try {
        const params = new URLSearchParams({
          limit: cardQuery.trim() ? "60" : cardSetFilter.trim() ? "1000" : "200"
        });
        if (cardQuery.trim()) {
          params.set("q", cardQuery.trim());
        }
        if (allowedColorIdentity.length > 0) {
          params.set("allowedColors", allowedColorIdentity.join(","));
        }
        if (cardTypeFilter) {
          params.set("type", cardTypeFilter);
        }
        if (cardSetFilter.trim()) {
          params.set("set", cardSetFilter.trim().toUpperCase());
        }

        const response = await fetch(`/api/card-search?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as CardSearchResponse | { error: string };
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setCardResults([]);
          setCardSearchError("error" in payload ? payload.error : "Could not search cards.");
          return;
        }

        const selectedNames = new Set(
          [selectedCommander.name, selectedPairOption?.name]
            .filter(Boolean)
            .map((name) => normalizeName(String(name)))
        );
        setCardResults(
          (payload as CardSearchResponse).items.filter(
            (item) => !selectedNames.has(normalizeName(item.name))
          )
        );
      } catch {
        if (!cancelled) {
          setCardResults([]);
          setCardSearchError("Could not search cards.");
        }
      } finally {
        if (!cancelled) {
          setCardSearchLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [allowedColorIdentity, cardQuery, cardSetFilter, cardTypeFilter, selectedCommander, selectedPairOption]);

  useEffect(() => {
    if (!commanderSelection) {
      setAnalysis(null);
      setAnalysisError("");
      setAnalysisLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = analyzeRequestId.current + 1;
    analyzeRequestId.current = requestId;
    const timeoutId = window.setTimeout(async () => {
      setAnalysisLoading(true);
      setAnalysisError("");

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decklist: buildBuilderDecklist(commanderSelection, deckCards),
            commanderName: commanderSelection.secondary
              ? `${commanderSelection.primary} + ${commanderSelection.secondary}`
              : commanderSelection.primary,
            deckPriceMode: "oracle-default"
          })
        });

        const payload = (await response.json()) as AnalyzeResponse | { error: string };
        if (cancelled || analyzeRequestId.current !== requestId) {
          return;
        }

        if (!response.ok) {
          setAnalysis(null);
          setAnalysisError("error" in payload ? payload.error : "Could not analyze builder deck.");
          return;
        }

        setAnalysis(payload as AnalyzeResponse);
      } catch {
        if (!cancelled && analyzeRequestId.current === requestId) {
          setAnalysis(null);
          setAnalysisError("Could not analyze builder deck.");
        }
      } finally {
        if (!cancelled && analyzeRequestId.current === requestId) {
          setAnalysisLoading(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [commanderSelection, deckCards]);

  const roleBreakdown = useMemo(() => normalizeRoleBreakdown(analysis), [analysis]);
  const needs = useMemo(() => extractNeeds(analysis?.deckHealth.rows ?? []), [analysis]);
  const visibleNeeds = useMemo(() => needs.slice(0, 4), [needs]);
  const commanderArchetypeNames = useMemo(
    () =>
      selectedCommander
        ? inferCommanderArchetypes({
            name: selectedCommander.name,
            typeLine: selectedCommander.typeLine,
            oracleText: selectedCommander.oracleText
          })
        : [],
    [selectedCommander]
  );
  const archetypeNames = useMemo(() => {
    const names = [
      analysis?.archetypeReport.primary?.archetype,
      analysis?.archetypeReport.secondary?.archetype,
      ...commanderArchetypeNames
    ].filter(Boolean) as string[];

    return [...new Set(names)];
  }, [analysis, commanderArchetypeNames]);
  const fallbackRoleGroups = useMemo(
    () => buildCommanderRoleSuggestionGroups(suggestionColorIdentity, archetypeNames, needs),
    [archetypeNames, needs, suggestionColorIdentity]
  );
  const commanderAbilityGroups = useMemo(() => {
    if (!selectedCommander) {
      return [];
    }

    const datasetGroups =
      remoteCommanderProfile?.profile?.groups?.map((group) => ({
        key: group.key,
        label: group.label,
        description: group.description,
        items: group.cards.map((name) => ({ name }))
      })) ?? [];

    if (datasetGroups.length > 0) {
      return datasetGroups;
    }

    return buildCommanderAbilitySuggestionGroups({
      name: selectedCommander.name,
      typeLine: selectedCommander.typeLine,
      oracleText: selectedCommander.oracleText
    }).map((group) => ({
      key: group.key,
      label: group.label,
      description: group.description,
      items: group.names.map((name) => ({ name }))
    }));
  }, [remoteCommanderProfile, selectedCommander]);
  const commanderStaples = useMemo(
    () =>
      selectedCommander
        ? buildCommanderStapleSuggestionNames(suggestionColorIdentity).filter(
            (name) => !deckCards.some((card) => normalizeName(card.name) === normalizeName(name))
          )
        : [],
    [deckCards, selectedCommander, suggestionColorIdentity]
  );
  const colorStaples = useMemo(
    () =>
      selectedCommander
        ? buildColorStapleSuggestionNames(suggestionColorIdentity).filter(
            (name) => !deckCards.some((card) => normalizeName(card.name) === normalizeName(name))
          )
        : [],
    [deckCards, selectedCommander, suggestionColorIdentity]
  );
  const gameChangerSuggestions = useMemo(
    () =>
      selectedCommander
        ? buildGameChangerSuggestionNames(suggestionColorIdentity).filter(
            (name) => !deckCards.some((card) => normalizeName(card.name) === normalizeName(name))
          )
        : [],
    [deckCards, selectedCommander, suggestionColorIdentity]
  );
  const manaBaseSuggestions = useMemo(
    () =>
      selectedCommander
        ? buildManaBaseSuggestionNames(suggestionColorIdentity).filter(
            (name) => !deckCards.some((card) => normalizeName(card.name) === normalizeName(name))
          )
        : [],
    [deckCards, selectedCommander, suggestionColorIdentity]
  );
  const suggestionGroups = useMemo(
    () =>
      buildSuggestionGroups(
        analysis,
        commanderStaples,
        colorStaples,
        gameChangerSuggestions,
        manaBaseSuggestions,
        commanderAbilityGroups,
        buildRuleFixGroups(analysis),
        fallbackRoleGroups
      ),
    [analysis, colorStaples, commanderAbilityGroups, commanderStaples, fallbackRoleGroups, gameChangerSuggestions, manaBaseSuggestions]
  );
  const gameChangers = useMemo(
    () => analysis?.bracketReport?.gameChangersFound ?? [],
    [analysis]
  );
  const filteredSuggestionGroups = useMemo(() => {
    const cardsAlreadyInBuild = new Set(
      [
        ...deckCards.map((card) => normalizeName(card.name)),
        selectedCommander ? normalizeName(selectedCommander.name) : "",
        selectedPairOption ? normalizeName(selectedPairOption.name) : ""
      ].filter(Boolean)
    );

    const filterItems = (items: SuggestionCardItem[]) =>
      items.filter((item) => {
        if (item.action === "none") {
          return true;
        }

        const normalized = normalizeName(item.name);
        if (cardsAlreadyInBuild.has(normalized)) {
          return false;
        }

        const record = resolvedCardsByName[normalized];
        if (!record) {
          return false;
        }

        return record.colorIdentity.every((color) => allowedColorIdentity.includes(color));
      });

    const filterAndLimitGroup = (group: SuggestionGroup): SuggestionGroup | null => {
      const nextGroup = limitSuggestionGroup({
        ...group,
        items: filterItems(group.items)
      });
      return nextGroup.items.length > 0 ? nextGroup : null;
    };

    return {
      ruleFixGroups: suggestionGroups.ruleFixGroups
        .map(filterAndLimitGroup)
        .filter((group): group is SuggestionGroup => Boolean(group)),
      commanderAbilityGroups: suggestionGroups.commanderAbilityGroups
        .map(filterAndLimitGroup)
        .filter((group): group is SuggestionGroup => Boolean(group)),
      roleGroups: suggestionGroups.roleGroups
        .map(filterAndLimitGroup)
        .filter((group): group is SuggestionGroup => Boolean(group)),
      comboGroups: suggestionGroups.comboGroups
        .map(filterAndLimitGroup)
        .filter((group): group is SuggestionGroup => Boolean(group)),
      stapleGroup: suggestionGroups.stapleGroup
        ? filterAndLimitGroup(suggestionGroups.stapleGroup)
        : null,
      colorStapleGroup: suggestionGroups.colorStapleGroup
        ? filterAndLimitGroup(suggestionGroups.colorStapleGroup)
        : null,
      gameChangerGroup: suggestionGroups.gameChangerGroup
        ? filterAndLimitGroup(suggestionGroups.gameChangerGroup)
        : null,
      manaBaseGroup: suggestionGroups.manaBaseGroup
        ? filterAndLimitGroup(suggestionGroups.manaBaseGroup)
        : null
    };
  }, [allowedColorIdentity, deckCards, resolvedCardsByName, selectedCommander, selectedPairOption, suggestionGroups]);
  const totalDeckCount = currentMainDeckCount + (selectedCommander ? 1 : 0) + (selectedPairOption ? 1 : 0);
  const builderPriceCoverage = selectedCommander ? 100 : 0;
  const metadataNames = useMemo(() => {
    const names = [
      ...deckCards.map((card) => card.name),
      selectedCommander?.name ?? "",
      selectedPairOption?.name ?? "",
      ...commanderStaples,
      ...colorStaples,
      ...gameChangerSuggestions,
      ...manaBaseSuggestions,
      ...suggestionGroups.commanderAbilityGroups.flatMap((group) => group.items.map((item) => item.name)),
      ...suggestionGroups.ruleFixGroups.flatMap((group) => group.items.map((item) => item.name)),
      ...suggestionGroups.roleGroups.flatMap((group) => group.items.map((item) => item.name)),
      ...suggestionGroups.comboGroups.flatMap((group) => group.items.map((item) => item.name))
    ];

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
  }, [colorStaples, commanderStaples, deckCards, gameChangerSuggestions, manaBaseSuggestions, selectedCommander, selectedPairOption, suggestionGroups]);
  const deckSections = useMemo(
    () => categorizeBuilderDeckCards(deckCards, roleBreakdown, toCardMetaMap(resolvedCardsByName)),
    [deckCards, resolvedCardsByName, roleBreakdown]
  );
  const archetypeLabel = useMemo(() => buildArchetypeLabel(analysis?.archetypeReport), [analysis]);
  const heroCommander = useMemo(() => {
    if (!selectedCommander) {
      return null;
    }

    const analyzedPrimaryCommanderName =
      analysis?.commander?.selectedNames?.[0] ?? selectedCommander.name;
    const analyzedCommander = analysis?.commander?.selectedName
      ? {
          name: analyzedPrimaryCommanderName,
          colorIdentity: analysis.commander.selectedColorIdentity,
          cmc: analysis.commander.selectedCmc,
          deckPriceUsd: analysis.deckPrice?.totals.usd ?? null,
          artUrl: analysis.commander.selectedArtUrl,
          cardImageUrl: analysis.commander.selectedCardImageUrl,
          setCode: analysis.commander.selectedSetCode,
          collectorNumber: analysis.commander.selectedCollectorNumber,
          printingId: analysis.commander.selectedPrintingId
        }
      : null;

    return analyzedCommander ?? {
      name: selectedCommander.name,
      colorIdentity: allowedColorIdentity,
      cmc: selectedCommander.cmc,
      deckPriceUsd: null,
      artUrl: selectedCommander.artUrl,
      cardImageUrl: selectedCommander.previewImageUrl,
      setCode: null,
      collectorNumber: null,
      printingId: null
    };
  }, [allowedColorIdentity, analysis, selectedCommander]);
  const maxCurveCount = useMemo(() => {
    if (!analysis) {
      return 1;
    }

    return Math.max(
      1,
      ...Object.values(analysis.summary.manaCurve).map((value) =>
        typeof value === "number" && Number.isFinite(value) ? value : 0
      )
    );
  }, [analysis]);

  function resolveCardRecord(name: string): CardSearchRecord {
    const normalized = normalizeName(name);
    const basicLand = isBasicLandName(name);
    return (
      resolvedCardsByName[normalized] ??
      basicCardTemplate(name, basicLand, basicLand ? Number.POSITIVE_INFINITY : null)
    );
  }

  function toDeckCardRecord(card: BuilderDeckCard): CardSearchRecord {
    const fallback = resolveCardRecord(card.name);

    return {
      ...fallback,
      setCode: card.setCode ?? fallback.setCode,
      collectorNumber: card.collectorNumber ?? fallback.collectorNumber,
      printingId: card.printingId ?? fallback.printingId,
      previewImageUrl: card.previewImageUrl ?? fallback.previewImageUrl,
      artUrl: card.artUrl ?? fallback.artUrl,
      manaCost: card.manaCost ?? fallback.manaCost,
      cmc: typeof card.cmc === "number" && Number.isFinite(card.cmc) ? card.cmc : fallback.cmc,
      typeLine: card.typeLine ?? fallback.typeLine,
      oracleText: card.oracleText ?? fallback.oracleText,
      colorIdentity: Array.isArray(card.colorIdentity) && card.colorIdentity.length > 0 ? card.colorIdentity : fallback.colorIdentity,
      duplicateLimit: typeof card.duplicateLimit === "number" ? card.duplicateLimit : fallback.duplicateLimit,
      isBasicLand: card.isBasicLand ?? fallback.isBasicLand
    };
  }

  function addNamedCard(name: string) {
    setDeckCards((current) => addCardToDeck(current, resolveCardRecord(name)));
  }

  function removeNamedCard(name: string) {
    setDeckCards((current) =>
      current.filter((entry) => normalizeName(entry.name) !== normalizeName(name))
    );
  }

  useEffect(() => {
    if (metadataNames.length === 0) {
      setResolvedCardsByName({});
      return;
    }

    let cancelled = false;

    async function resolveCards() {
      try {
        const response = await fetch("/api/card-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            names: metadataNames,
            allowedColors: allowedColorIdentity
          })
        });
        const payload = (await response.json()) as CardSearchResponse | { error: string };
        if (cancelled || !response.ok) {
          return;
        }

        const items = (payload as CardSearchResponse).items ?? [];
        setResolvedCardsByName((current) => {
          const next = { ...current };
          for (const item of items) {
            next[normalizeName(item.name)] = item;
          }
          return next;
        });
      } catch {
        // Builder suggestions degrade to name-only rows if local lookup fails.
      }
    }

    void resolveCards();

    return () => {
      cancelled = true;
    };
  }, [allowedColorIdentity, metadataNames]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const pageArtUrl = heroCommander?.artUrl ?? heroCommander?.cardImageUrl ?? null;

    if (!pageArtUrl) {
      root.classList.remove("has-commander-page-art");
      body.classList.remove("has-commander-page-art");
      root.style.removeProperty("--commander-page-art");
      return;
    }

    root.style.setProperty("--commander-page-art", `url("${pageArtUrl}")`);
    root.classList.add("has-commander-page-art");
    body.classList.add("has-commander-page-art");

    return () => {
      root.classList.remove("has-commander-page-art");
      body.classList.remove("has-commander-page-art");
      root.style.removeProperty("--commander-page-art");
    };
  }, [heroCommander?.artUrl, heroCommander?.cardImageUrl]);

  function startBuild(commander: CardSearchRecord) {
    setSelectedCommander(commander);
    setSelectedPartnerName("");
    setDeckCards([]);
    setDeckName(`${commander.name} Builder`);
    setCommanderQuery("");
    setCommanderResults([]);
    setActiveHeaderTab("search");
    setCardQuery("");
    setCardTypeFilter("");
    setCardSetFilter("");
    setShowReportView(false);
    setAnalysis(null);
    setAnalysisError("");
    setSaveMessage("");
  }

  function saveCurrentDeck() {
    if (!selectedCommander) {
      return;
    }

    const nextEntry: SavedBuilderDeck = {
      id: createSavedDeckId(),
      name: deckName.trim() || `${selectedCommander.name} Builder`,
      commander: selectedCommander,
      partnerName: selectedPairOption?.name ?? null,
      cards: deckCards,
      updatedAt: new Date().toISOString()
    };

    const next = [nextEntry, ...savedDecks].slice(0, MAX_SAVED_BUILDS);
    persistSavedDecks(next);
    setSaveMessage(`Saved "${nextEntry.name}" locally.`);
  }

  function loadSavedDeck(saved: SavedBuilderDeck) {
    setSelectedCommander(saved.commander);
    setSelectedPartnerName(saved.partnerName ?? "");
    setDeckCards(saved.cards);
    setDeckName(saved.name);
    setActiveHeaderTab("search");
    setSaveMessage(`Loaded "${saved.name}".`);
  }

  function removeSavedDeck(id: string) {
    const next = savedDecks.filter((saved) => saved.id !== id);
    persistSavedDecks(next);
  }

  async function copyDecklist() {
    if (!commanderSelection || typeof navigator === "undefined" || !navigator.clipboard) {
      setDecklistActionMessage("Copy to clipboard is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildBuilderDecklist(commanderSelection, deckCards));
      setDecklistActionMessage("Decklist copied.");
    } catch {
      setDecklistActionMessage("Could not copy the decklist.");
    }
  }

  function downloadDecklist() {
    if (!commanderSelection || typeof document === "undefined") {
      return;
    }

    const blob = new Blob([buildBuilderDecklist(commanderSelection, deckCards)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(deckName.trim() || selectedCommander?.name || "commander-deck").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setDecklistActionMessage("Decklist exported.");
  }

  function renderCardThumb(record: CardSearchRecord, className = "builder-card-thumb", fallbackLabel?: string, preferCardImage = true) {
    const imageUrl = preferCardImage
      ? record.previewImageUrl ?? record.artUrl ?? null
      : record.artUrl ?? record.previewImageUrl ?? null;
    return (
      <div
        className={className}
        aria-hidden="true"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes={className === "builder-commander-preview" ? "112px" : className === "builder-search-thumb" ? "64px" : "58px"}
            unoptimized
          />
        ) : (
          <span>{fallbackLabel ?? record.name.charAt(0)}</span>
        )}
      </div>
    );
  }

  function renderSuggestionGroupPanel(group: SuggestionGroup, prefix: string, open = false) {
    return (
      <details key={group.key} className="builder-suggestion-group builder-suggestion-group-collapsible" open={open}>
        <summary className="builder-suggestion-summary">
          <span>{group.label}</span>
          <span className="muted">{group.items.length}</span>
        </summary>
        {group.description ? <p className="muted builder-suggestion-description">{group.description}</p> : null}
        <div className="builder-suggestion-list">
          {group.items.map((item) => {
            const record = resolveCardRecord(item.name);
            const existingQty =
              deckCards.find((entry) => normalizeName(entry.name) === normalizeName(item.name))?.qty ?? 0;
            const canAddMore = canAddMoreCopies(record, existingQty);
            const canAdd = item.action !== "none";

            return (
              <article key={`${prefix}-${group.key}-${item.name}`} className="builder-search-card builder-suggestion-card">
                {renderCardThumb(record, "builder-search-thumb", item.name.charAt(0))}
                <div className="builder-search-card-main">
                  <strong>
                    <CardLink
                      name={item.name}
                      setCode={record.setCode}
                      collectorNumber={record.collectorNumber}
                      printingId={record.printingId}
                    />
                  </strong>
                  <div className="builder-search-meta">
                    {record.manaCost ? <ManaCost manaCost={record.manaCost} size={16} /> : null}
                    {record.typeLine ? <span>{record.typeLine}</span> : null}
                    {record.setCode ? <span>{record.setCode}</span> : null}
                  </div>
                  {item.note ? <p className="muted builder-suggestion-note">{item.note}</p> : null}
                </div>
                {canAdd ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!canAddMore}
                    onClick={() => addNamedCard(item.name)}
                  >
                    {canAddMore ? "Add" : "In Deck"}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </details>
    );
  }

  const headerTabs: Array<{ key: BuilderHeaderTab; label: string; count?: number }> = [
    { key: "search", label: "Card Search", count: cardResults.length },
    { key: "staples", label: "Commander Staples", count: filteredSuggestionGroups.stapleGroup?.items.length ?? 0 },
    { key: "color-staples", label: "Color Staples", count: filteredSuggestionGroups.colorStapleGroup?.items.length ?? 0 },
    {
      key: "gameplan",
      label: "Commander Gameplan",
      count: filteredSuggestionGroups.commanderAbilityGroups.reduce((sum, group) => sum + group.items.length, 0)
    },
    {
      key: "legality",
      label: "Legality Fixes",
      count: filteredSuggestionGroups.ruleFixGroups.reduce((sum, group) => sum + group.items.length, 0)
    },
    { key: "smart", label: "Smart Suggestions", count: filteredSuggestionGroups.roleGroups.reduce((sum, group) => sum + group.items.length, 0) },
    { key: "combos", label: "Combo Suggestions", count: filteredSuggestionGroups.comboGroups.reduce((sum, group) => sum + group.items.length, 0) },
    { key: "game-changers", label: "Game Changers", count: filteredSuggestionGroups.gameChangerGroup?.items.length ?? 0 },
    { key: "mana-base", label: "Mana Base", count: filteredSuggestionGroups.manaBaseGroup?.items.length ?? 0 }
  ];

  function renderHeaderTabContent() {
    if (!activeHeaderTab) {
      return null;
    }

    switch (activeHeaderTab) {
      case "search":
        return (
          <>
            {cardSearchLoading ? <p className="muted">Searching cards...</p> : null}
            {cardSearchError ? <p className="error">{cardSearchError}</p> : null}
            <div className="builder-search-results">
              {cardResults.map((card) => {
                const existingQty = deckCards.find((entry) => normalizeName(entry.name) === normalizeName(card.name))?.qty ?? 0;
                const canAddMore = canAddMoreCopies(card, existingQty);

                return (
                  <article
                    key={card.printingId ?? `${card.name}-${card.setCode ?? "SET"}-${card.collectorNumber ?? "COLLECTOR"}`}
                    className="builder-search-card"
                  >
                    {renderCardThumb(card, "builder-search-thumb", card.name.charAt(0))}
                    <div className="builder-search-card-main">
                      <strong>
                        <CardLink
                          name={card.name}
                          setCode={card.setCode}
                          collectorNumber={card.collectorNumber}
                          printingId={card.printingId}
                        />
                      </strong>
                      <div className="builder-search-meta">
                        <ManaCost manaCost={card.manaCost} size={16} />
                        <span>{card.typeLine}</span>
                        {card.setCode ? (
                          <span>
                            {card.setName
                              ? `${card.setCode} - ${card.setName}${card.setReleaseYear ? ` (${card.setReleaseYear})` : ""}`
                              : card.setCode}
                          </span>
                        ) : null}
                      </div>
                      {existingQty > 0 ? <p className="muted">In deck: {existingQty}</p> : null}
                    </div>
                    <button type="button" className="btn-secondary" disabled={!canAddMore} onClick={() => setDeckCards((current) => addCardToDeck(current, card))}>
                      {canAddMore ? "Add" : "At Limit"}
                    </button>
                  </article>
                );
              })}
              {!cardSearchLoading && selectedCommander && (cardQuery.trim() || cardTypeFilter || cardSetFilter.trim()) && cardResults.length === 0 ? (
                <p className="muted">No legal cards match the current search or browse filters.</p>
              ) : null}
            </div>
          </>
        );
      case "staples":
        return !filteredSuggestionGroups.stapleGroup || filteredSuggestionGroups.stapleGroup.items.length === 0 ? (
          <p className="muted">No commander staple suggestions remain for this build right now.</p>
        ) : (
          <div className="builder-suggestion-groups">
            {renderSuggestionGroupPanel(filteredSuggestionGroups.stapleGroup, "staple", true)}
          </div>
        );
      case "color-staples":
        return !filteredSuggestionGroups.colorStapleGroup || filteredSuggestionGroups.colorStapleGroup.items.length === 0 ? (
          <p className="muted">No color-specific staple suggestions remain for this commander.</p>
        ) : (
          <div className="builder-suggestion-groups">
            {renderSuggestionGroupPanel(filteredSuggestionGroups.colorStapleGroup, "color-staple", true)}
          </div>
        );
      case "gameplan":
        return filteredSuggestionGroups.commanderAbilityGroups.length === 0 ? (
          <p className="muted">No commander-specific support package is available yet.</p>
        ) : (
          <div className="builder-suggestion-groups">
            {filteredSuggestionGroups.commanderAbilityGroups.map((group, index) =>
              renderSuggestionGroupPanel(group, "commander-gameplan", index === 0)
            )}
          </div>
        );
      case "legality":
        return filteredSuggestionGroups.ruleFixGroups.length === 0 ? (
          <p className="muted">No active rules-engine legality issues in the current build.</p>
        ) : (
          <div className="builder-suggestion-groups">
            {filteredSuggestionGroups.ruleFixGroups.map((group, index) =>
              renderSuggestionGroupPanel(group, "legality-fixes", index === 0)
            )}
          </div>
        );
      case "smart":
        return filteredSuggestionGroups.roleGroups.length === 0 ? (
          <p className="muted">Add more cards to unlock role and archetype tuning suggestions.</p>
        ) : (
          <div className="builder-suggestion-groups">
            {filteredSuggestionGroups.roleGroups.map((group, index) => renderSuggestionGroupPanel(group, "smart", index === 0))}
          </div>
        );
      case "combos":
        return filteredSuggestionGroups.comboGroups.length === 0 ? (
          <p className="muted">No near-miss combo packages detected yet.</p>
        ) : (
          <div className="builder-suggestion-groups">
            {filteredSuggestionGroups.comboGroups.map((group) => renderSuggestionGroupPanel(group, "combo"))}
          </div>
        );
      case "game-changers":
        return !filteredSuggestionGroups.gameChangerGroup || filteredSuggestionGroups.gameChangerGroup.items.length === 0 ? (
          <p className="muted">No color-safe game changer adds are missing from this build right now.</p>
        ) : (
          <div className="builder-suggestion-groups">
            {renderSuggestionGroupPanel(filteredSuggestionGroups.gameChangerGroup, "game-changer", true)}
          </div>
        );
      case "mana-base":
        return !filteredSuggestionGroups.manaBaseGroup || filteredSuggestionGroups.manaBaseGroup.items.length === 0 ? (
          <p className="muted">No mana base suggestions are missing from this build right now.</p>
        ) : (
          <div className="builder-suggestion-groups">
            {renderSuggestionGroupPanel(filteredSuggestionGroups.manaBaseGroup, "mana-base", true)}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <main className="page builder-page">
      <section className="panel builder-topbar">
        <div className="builder-topbar-row">
          <div className="builder-topbar-title">
            <h1>Commander-First Deck Builder</h1>
            <p className="muted">Pick a commander and tune the 99 with live Commander legality and analysis.</p>
          </div>
          <div className="builder-topbar-actions">
            <Link href="/" className="btn-secondary">
              Open Analyzer
            </Link>
            {selectedCommander ? (
              <button type="button" className="btn-tertiary" onClick={saveCurrentDeck}>
                Save Build
              </button>
            ) : null}
          </div>
        </div>

        <div className="builder-topbar-picker">
          <div className="builder-commander-picker-head">
            <div>
              <span className="builder-kicker">Commander Picker</span>
              <p className="muted">Search commanders by name and color identity.</p>
            </div>
            {selectedCommander ? (
              <div className="builder-selected-identity">
                <span className="muted">Allowed colors</span>
                <ColorIdentityIcons identity={allowedColorIdentity} size={18} />
              </div>
            ) : null}
          </div>

          <div className="builder-commander-picker-controls">
            <input type="search" value={commanderQuery} onChange={(event) => setCommanderQuery(event.target.value)} placeholder="Search commanders" />
            <div className="builder-color-filter">
              {["W", "U", "B", "R", "G"].map((color) => (
                <button key={color} type="button" className={`builder-color-chip${commanderColors.includes(color) ? " builder-color-chip-active" : ""}`} onClick={() => toggleCommanderColor(color)}>
                  {color}
                </button>
              ))}
            </div>
          </div>

          {commanderLoading ? <p className="muted">Searching commanders...</p> : null}
          {commanderError ? <p className="error">{commanderError}</p> : null}
        </div>
      </section>

      {commanderQuery.trim() ? (
        <section className="panel builder-commander-picker">
          <div className="builder-commander-results">
            {commanderResults.map((commander) => (
              <article
                key={commander.name}
                className="builder-search-card builder-commander-card"
                style={commander.artUrl ? { backgroundImage: `linear-gradient(145deg, rgba(9, 15, 24, 0.9), rgba(10, 18, 29, 0.82)), url("${commander.artUrl}")` } : undefined}
              >
                <div className="builder-commander-card-main">
                  {renderCardThumb(commander, "builder-commander-preview", commander.name.charAt(0))}
                  <div className="builder-commander-card-body">
                    <strong>
                      <CardLink
                        name={commander.name}
                        setCode={commander.setCode}
                        collectorNumber={commander.collectorNumber}
                        printingId={commander.printingId}
                      />
                    </strong>
                    <div className="builder-search-meta">
                      <ManaCost manaCost={commander.manaCost} size={16} />
                    </div>
                    <p className="muted builder-card-subline">{commander.typeLine}</p>
                    <div className="builder-commander-card-actions">
                      <button type="button" className="btn-secondary" onClick={() => startBuild(commander)}>Start Build</button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {!commanderLoading && commanderResults.length === 0 ? <p className="muted">No commanders match the current search.</p> : null}
          </div>
        </section>
      ) : null}

      {heroCommander ? (
        <div className="builder-sticky-hero">
          <CommanderHeroHeader
            commander={heroCommander}
            archetypeLabel={archetypeLabel}
            bracketLabel={analysis?.bracketReport?.estimatedLabel ?? null}
          />
          <section className="panel builder-hero-workbench">
            <div className="builder-search-controls builder-search-controls-inline">
              <input
                type="search"
                value={cardQuery}
                onChange={(event) => setCardQuery(event.target.value)}
                placeholder={selectedCommander ? "Search cards to add" : "Select a commander first"}
                disabled={!selectedCommander}
              />
              <div className="builder-search-filter-row">
                <select value={cardTypeFilter} onChange={(event) => setCardTypeFilter(event.target.value as BuilderCardTypeFilter)} disabled={!selectedCommander}>
                  {CARD_TYPE_FILTERS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select value={cardSetFilter} onChange={(event) => setCardSetFilter(event.target.value)} disabled={!selectedCommander}>
                  <option value="">All sets</option>
                  {setOptions.map((option) => (
                    <option key={option.setCode} value={option.setCode}>
                      {option.setCode} - {option.setName}{option.releaseYear ? ` (${option.releaseYear})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="builder-header-tabs" role="tablist" aria-label="Builder tools">
              {headerTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeHeaderTab === tab.key}
                  className={`builder-header-tab${activeHeaderTab === tab.key ? " builder-header-tab-active" : ""}`}
                  aria-expanded={activeHeaderTab === tab.key}
                  onClick={() => setActiveHeaderTab((current) => (current === tab.key ? null : tab.key))}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" ? <span className="builder-header-tab-count">{tab.count}</span> : null}
                </button>
              ))}
            </div>

            {activeHeaderTab ? <div className="builder-header-tab-panel">{renderHeaderTabContent()}</div> : null}
          </section>
        </div>
      ) : null}

      {selectedCommander ? (
        <section className="panel builder-status-row">
          <div className="builder-panel-head">
            <h2>Deck Status</h2>
          </div>

          <div className="builder-stat-grid builder-stat-grid-wide">
            <div className="summary-card"><span>Main Deck</span><strong>{currentMainDeckCount}/{expectedMainDeckSize}</strong></div>
            <div className="summary-card"><span>Total Cards</span><strong>{totalDeckCount}</strong></div>
            <div className="summary-card"><span>Legality</span><strong>{analysis?.rulesEngine?.status ?? "Pending"}</strong></div>
            <div className="summary-card"><span>Bracket</span><strong>{analysis?.bracketReport?.estimatedLabel ?? "Pending"}</strong></div>
            <div className="summary-card"><span>Combos</span><strong>{analysis?.comboReport.detected.length ?? 0}</strong></div>
          </div>

          {analysisLoading ? <p className="muted">Refreshing live analysis...</p> : null}
          {analysisError ? <p className="error">{analysisError}</p> : null}

          <div className="builder-status-detail-grid">
            <section className="builder-status-card">
              <h3>Commander</h3>
              <p>
                <strong>
                  <CardLink
                    name={selectedCommander.name}
                    setCode={selectedCommander.setCode}
                    collectorNumber={selectedCommander.collectorNumber}
                    printingId={selectedCommander.printingId}
                  />
                </strong>
              </p>
              <div className="builder-search-meta">
                <ManaCost manaCost={selectedCommander.manaCost} size={16} />
                <span>{selectedCommander.typeLine}</span>
              </div>
              {selectedCommander.pairOptions && selectedCommander.pairOptions.length > 0 ? (
                <div className="builder-pair-picker">
                  <label htmlFor="builder-partner">Partner / Background</label>
                  <select id="builder-partner" value={selectedPartnerName} onChange={(event) => setSelectedPartnerName(event.target.value)}>
                    <option value="">No paired commander</option>
                    {selectedCommander.pairOptions.map((option) => (
                      <option key={option.name} value={option.name}>{option.name} ({option.pairType})</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </section>

            <section className="builder-status-card">
              <h3>Live Snapshot</h3>
              {analysis ? (
                <>
                  <div className="builder-stat-list">
                    <p>Color identity violations: <strong>{analysis.checks.colorIdentity.offColorCount}</strong></p>
                    <p>Avg mana value: <strong>{typeof analysis.summary.averageManaValue === "number" ? analysis.summary.averageManaValue.toFixed(2) : "N/A"}</strong></p>
                    <p>Price coverage: <strong>{formatPercent(builderPriceCoverage)}</strong></p>
                  </div>
                  <div className="builder-role-list">
                    {Object.entries(analysis.roles).map(([role, count]) => (<span key={role} className="chip">{role}: {count}</span>))}
                  </div>
                </>
              ) : (
                <p className="muted">Analysis will appear once the build initializes.</p>
              )}
            </section>

            <section className="builder-status-card">
              <h3>Mana Curve</h3>
              {analysis ? (
                <div className="builder-curve">
                  {Object.entries(analysis.summary.manaCurve).map(([bucket, count]) => (
                    <div key={bucket} className="curve-row">
                      <span className="curve-label">{bucket}</span>
                      <div className="curve-bar-wrap">
                        <div className="curve-bar" style={{ width: `${Math.min(100, ((count as number) / maxCurveCount) * 100)}%` }} />
                      </div>
                      <span className="curve-value">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Mana curve appears after live analysis runs.</p>
              )}
            </section>

            <section className="builder-status-card">
              <h3>Needs</h3>
              {needs.length === 0 ? (
                <p className="muted">No low-count buckets detected yet.</p>
              ) : (
                <>
                  <ul className="builder-bullets">
                    {visibleNeeds.map((need) => (
                      <li key={need.key}>
                        {need.label}: needs {need.deficit} more to reach {need.recommendedMin}
                      </li>
                    ))}
                  </ul>
                  {needs.length > visibleNeeds.length ? (
                    <p className="muted builder-status-more">+{needs.length - visibleNeeds.length} more needs</p>
                  ) : null}
                </>
              )}
            </section>

            <section className="builder-status-card">
              <h3>Game Changers</h3>
              {gameChangers.length === 0 ? (
                <p className="muted">No Commander bracket game changers detected in the current list.</p>
              ) : (
                <ul className="builder-bullets">
                  {gameChangers.map((entry) => (
                    <li key={entry.name}>
                      <CardLink name={entry.name} />{entry.qty > 1 ? ` x${entry.qty}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>

          </div>
        </section>
      ) : null}

      <section className="builder-grid builder-grid-single">
        <section className="panel builder-panel builder-panel-center">
            <div className="builder-panel-head">
            <div>
              <h2>Current Deck</h2>
              <p className="muted">Commander plus live 99-card build.</p>
            </div>
            <div className="builder-deck-actions">
              <input type="text" value={deckName} onChange={(event) => setDeckName(event.target.value)} placeholder="Deck name" />
              <button type="button" className="btn-tertiary" onClick={() => void copyDecklist()} disabled={!commanderSelection}>Copy Decklist</button>
              <button type="button" className="btn-tertiary" onClick={downloadDecklist} disabled={!commanderSelection}>Export Decklist</button>
            </div>
          </div>
          {decklistActionMessage ? <p className="muted">{decklistActionMessage}</p> : null}

          {!selectedCommander ? (
            <p className="muted">Start with a commander. The builder initializes an empty shell and keeps analysis live.</p>
          ) : (
            <>
                <div className="builder-deck-section">
                  <h3>Commander Zone</h3>
                  <ul className="builder-card-list">
                  <li className="builder-card-row builder-card-row-no-qty">
                    {renderCardThumb(resolveCardRecord(selectedCommander.name), "builder-card-thumb", selectedCommander.name.charAt(0))}
                    <div className="builder-card-main">
                      <div className="builder-card-main-head">
                        <strong>
                          <CardLink
                            name={selectedCommander.name}
                            setCode={selectedCommander.setCode}
                            collectorNumber={selectedCommander.collectorNumber}
                            printingId={selectedCommander.printingId}
                          />
                        </strong>
                        <div className="builder-search-meta">
                          <ManaCost manaCost={selectedCommander.manaCost} size={16} />
                        </div>
                      </div>
                      <p className="muted builder-card-subline">{selectedCommander.typeLine}</p>
                    </div>
                  </li>
                  {selectedPairOption ? (
                    <li className="builder-card-row builder-card-row-no-qty">
                      {renderCardThumb(resolveCardRecord(selectedPairOption.name), "builder-card-thumb", selectedPairOption.name.charAt(0))}
                      <div className="builder-card-main">
                        <div className="builder-card-main-head">
                          <strong><CardLink name={selectedPairOption.name} /></strong>
                        </div>
                        <p className="muted builder-card-subline">{selectedPairOption.pairType}</p>
                      </div>
                    </li>
                  ) : null}
                </ul>
              </div>

              {deckCards.length === 0 ? (
                <div className="builder-deck-section">
                  <h3>Main Deck</h3>
                  <p className="muted">No cards added yet. Use the header search and suggestions to add cards to the 99.</p>
                </div>
              ) : (
                deckSections.map((section) => (
                  <div key={section.key} className="builder-deck-section">
                    <div className="builder-section-head">
                      <h3>{section.label}</h3>
                      <span className="muted">
                        {section.cards.reduce((sum, card) => sum + card.qty, 0)} card
                        {section.cards.reduce((sum, card) => sum + card.qty, 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul className="builder-card-list">
                      {section.cards.map((card) => {
                        const record = toDeckCardRecord(card);
                        const showQuantity = shouldShowDeckQuantity(record);
                        return (
                          <li
                            key={`${section.key}-${card.name}`}
                            className={`builder-card-row${showQuantity ? "" : " builder-card-row-no-qty"}`}
                          >
                            {showQuantity ? <span className="builder-card-qty">{card.qty}</span> : null}
                            {renderCardThumb(record, "builder-card-thumb", card.name.charAt(0))}
                            <div className="builder-card-main">
                              <div className="builder-card-main-head">
                          <strong>
                            <CardLink
                              name={card.name}
                              setCode={record.setCode}
                              collectorNumber={record.collectorNumber}
                              printingId={record.printingId}
                            />
                          </strong>
                                <div className="builder-search-meta">
                                  {record.manaCost ? <ManaCost manaCost={record.manaCost} size={16} /> : null}
                                  {record.colorIdentity.length > 0 ? (
                                    <ColorIdentityIcons identity={record.colorIdentity} size={15} />
                                  ) : null}
                                </div>
                              </div>
                              <p className="muted builder-card-subline">
                                {record.typeLine || "Card data pending"}
                              </p>
                            </div>
                            <div className="builder-card-actions">
                              <button
                                type="button"
                                className="btn-tertiary"
                                onClick={() => setDeckCards((current) => updateCardQty(current, card.name, -1))}
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className="btn-tertiary"
                                onClick={() => setDeckCards((current) => updateCardQty(current, card.name, 1))}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className="btn-tertiary"
                                onClick={() => removeNamedCard(card.name)}
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}

              <section className="saved-decks-panel">
                <h3>Saved Builds</h3>
                {saveMessage ? <p className="muted">{saveMessage}</p> : null}
                {savedDecks.length === 0 ? <p className="muted">No saved builder decks yet.</p> : <ul className="saved-decks-list">{savedDecks.map((saved) => (<li key={saved.id} className="saved-decks-item"><button type="button" className="saved-deck-load" onClick={() => loadSavedDeck(saved)}>{saved.name}</button><button type="button" className="saved-deck-remove" onClick={() => removeSavedDeck(saved.id)}>Remove</button></li>))}</ul>}
              </section>

              {analysis ? <div className="builder-inline-report-toggle"><button type="button" className="btn-secondary" onClick={() => setShowReportView((current) => !current)}>{showReportView ? "Hide Full Report" : "Open Full Report"}</button></div> : null}
            </>
          )}
        </section>
      </section>

      {showReportView && analysis ? <section className="panel builder-report-panel"><AnalysisReport result={analysis} showCommanderHero={false} /></section> : null}
    </main>
  );
}
