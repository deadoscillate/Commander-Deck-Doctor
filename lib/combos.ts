import rawComboDb from "./combos.json";

const COMMANDER_SPELLBOOK_SEARCH_URL = "https://commanderspellbook.com/search/";

export type ComboDefinition = {
  comboName: string;
  cards: string[];
  requires: string[];
  isConditional: boolean;
  commanderSpellbookUrl: string;
};

export type DetectedCombo = ComboDefinition & {
  matchedCards: string[];
};

export type ConditionalCombo = ComboDefinition & {
  matchedCards: string[];
};

export type PotentialCombo = ComboDefinition & {
  matchedCards: string[];
  missingCards: string[];
  matchCount: number;
  missingCount: number;
  completionRatio: number;
  commanderLegalMissing: boolean;
  colorIdentityMissing: boolean;
};

export type ComboReport = {
  detected: DetectedCombo[];
  conditional: ConditionalCombo[];
  potential: PotentialCombo[];
  databaseSize: number;
  disclaimer: string;
};

type ComboCardMetadata = {
  legalities?: Record<string, string>;
  colorIdentity?: string[];
};

type DetectCombosOptions = {
  minMatchedCards?: number;
  maxMissingCards?: number;
  maxPotentialResults?: number;
  commanderColorIdentity?: string[];
  cardMetadataLookup?: (cardName: string) => ComboCardMetadata | null;
};

type RawComboDefinition = {
  combo_name?: unknown;
  cards?: unknown;
  requires?: unknown;
  conditional?: unknown;
  commander_spellbook_url?: unknown;
};

function normalizeLookupName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildCommanderSpellbookSearchUrl(comboName: string, cards: string[]): string {
  const query = cards.length > 0 ? cards.join(" ") : comboName;
  const url = new URL(COMMANDER_SPELLBOOK_SEARCH_URL);
  url.searchParams.set("q", query);
  return url.toString();
}

function normalizeCommanderSpellbookUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (url.hostname !== "commanderspellbook.com" && url.hostname !== "www.commanderspellbook.com") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeComboDb(raw: unknown): ComboDefinition[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const combos: ComboDefinition[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as RawComboDefinition;
    const comboName = typeof candidate.combo_name === "string" ? candidate.combo_name.trim() : "";
    const cards = Array.isArray(candidate.cards)
      ? candidate.cards.filter((card): card is string => typeof card === "string").map((card) => card.trim())
      : [];
    const requires = Array.isArray(candidate.requires)
      ? candidate.requires
          .filter((requirement): requirement is string => typeof requirement === "string")
          .map((requirement) => requirement.trim())
          .filter(Boolean)
      : [];

    if (!comboName || cards.length < 2 || cards.some((card) => !card)) {
      continue;
    }

    combos.push({
      comboName,
      cards,
      requires,
      isConditional: Boolean(candidate.conditional) || requires.length > 0,
      commanderSpellbookUrl:
        normalizeCommanderSpellbookUrl(candidate.commander_spellbook_url) ??
        buildCommanderSpellbookSearchUrl(comboName, cards)
    });
  }

  return combos;
}

const COMBO_DATABASE = normalizeComboDb(rawComboDb);

function normalizeColorIdentity(identity: string[] | undefined): string[] {
  if (!Array.isArray(identity)) {
    return [];
  }

  return [...new Set(identity.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
}

function isCommanderLegal(metadata: ComboCardMetadata | null): boolean {
  const legality = metadata?.legalities?.commander;
  if (typeof legality !== "string") {
    return true;
  }

  return legality === "legal";
}

function isColorIdentityCompatible(metadata: ComboCardMetadata | null, commanderIdentity: Set<string>): boolean {
  if (commanderIdentity.size === 0) {
    return true;
  }

  const cardIdentity = normalizeColorIdentity(metadata?.colorIdentity);
  if (cardIdentity.length === 0) {
    return true;
  }

  return cardIdentity.every((symbol) => commanderIdentity.has(symbol));
}

/**
 * Detects combos where every combo card exists in the provided deck card names.
 */
export function detectCombosInDeck(deckCardNames: string[], options: DetectCombosOptions = {}): ComboReport {
  const minMatchedCards = Math.max(1, Math.floor(options.minMatchedCards ?? 2));
  const maxMissingCards = Math.max(1, Math.floor(options.maxMissingCards ?? 2));
  const maxPotentialResults = Math.max(0, Math.floor(options.maxPotentialResults ?? 15));
  const commanderIdentity = new Set(normalizeColorIdentity(options.commanderColorIdentity));
  const metadataCache = new Map<string, ComboCardMetadata | null>();

  const getMetadata = (cardName: string): ComboCardMetadata | null => {
    if (!options.cardMetadataLookup) {
      return null;
    }

    const normalized = normalizeLookupName(cardName);
    if (metadataCache.has(normalized)) {
      return metadataCache.get(normalized) ?? null;
    }

    const metadata = options.cardMetadataLookup(cardName);
    const normalizedMetadata = metadata
      ? {
          legalities: metadata.legalities,
          colorIdentity: normalizeColorIdentity(metadata.colorIdentity)
        }
      : null;
    metadataCache.set(normalized, normalizedMetadata);
    return normalizedMetadata;
  };

  const availableByNormalizedName = new Map<string, string>();

  for (const rawName of deckCardNames) {
    const trimmed = rawName.trim();
    if (!trimmed) {
      continue;
    }

    const normalized = normalizeLookupName(trimmed);
    if (!availableByNormalizedName.has(normalized)) {
      availableByNormalizedName.set(normalized, trimmed);
    }
  }

  const detected: DetectedCombo[] = [];
  const conditional: ConditionalCombo[] = [];
  const potential: PotentialCombo[] = [];

  for (const combo of COMBO_DATABASE) {
    const matchedCards: string[] = [];
    const missingCards: string[] = [];

    for (const comboCard of combo.cards) {
      const normalizedComboCard = normalizeLookupName(comboCard);
      const matchedDeckCard = availableByNormalizedName.get(normalizedComboCard);
      if (!matchedDeckCard) {
        missingCards.push(comboCard);
        continue;
      }

      matchedCards.push(matchedDeckCard);
    }

    if (missingCards.length === 0) {
      const row = {
        comboName: combo.comboName,
        cards: combo.cards,
        requires: combo.requires,
        isConditional: combo.isConditional,
        commanderSpellbookUrl: combo.commanderSpellbookUrl,
        matchedCards
      };

      if (combo.isConditional) {
        conditional.push(row);
      } else {
        detected.push(row);
      }
      continue;
    }

    if (matchedCards.length < minMatchedCards || missingCards.length > maxMissingCards) {
      continue;
    }

    const commanderLegalMissing = missingCards.every((cardName) => isCommanderLegal(getMetadata(cardName)));
    if (!commanderLegalMissing) {
      continue;
    }

    const colorIdentityMissing = missingCards.every((cardName) =>
      isColorIdentityCompatible(getMetadata(cardName), commanderIdentity)
    );
    if (!colorIdentityMissing) {
      continue;
    }

    const completionRatio = matchedCards.length / combo.cards.length;
    potential.push({
      comboName: combo.comboName,
      cards: combo.cards,
      requires: combo.requires,
      isConditional: combo.isConditional,
      commanderSpellbookUrl: combo.commanderSpellbookUrl,
      matchedCards,
      missingCards,
      matchCount: matchedCards.length,
      missingCount: missingCards.length,
      completionRatio: Number(completionRatio.toFixed(3)),
      commanderLegalMissing,
      colorIdentityMissing
    });
  }

  potential.sort((a, b) => {
    if (a.isConditional !== b.isConditional) {
      return a.isConditional ? 1 : -1;
    }

    if (a.missingCount !== b.missingCount) {
      return a.missingCount - b.missingCount;
    }

    if (a.matchCount !== b.matchCount) {
      return b.matchCount - a.matchCount;
    }

    if (a.completionRatio !== b.completionRatio) {
      return b.completionRatio - a.completionRatio;
    }

    return a.comboName.localeCompare(b.comboName);
  });
  conditional.sort((a, b) => a.comboName.localeCompare(b.comboName));

  return {
    detected,
    conditional,
    potential: maxPotentialResults > 0 ? potential.slice(0, maxPotentialResults) : [],
    databaseSize: COMBO_DATABASE.length,
    disclaimer:
      "Combo detection uses an offline Commander Spellbook-derived snapshot. " +
      "Conditional combos include setup requirements from Spellbook `requires`; potential combos are near-miss " +
      "heuristics filtered by Commander legality and commander color identity."
  };
}

