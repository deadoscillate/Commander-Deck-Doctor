import rawComboDb from "./combos.json";

const COMMANDER_SPELLBOOK_SEARCH_URL = "https://commanderspellbook.com/search/";

export type ComboDefinition = {
  comboName: string;
  cards: string[];
  commanderSpellbookUrl: string;
};

export type DetectedCombo = ComboDefinition & {
  matchedCards: string[];
};

export type ComboReport = {
  detected: DetectedCombo[];
  databaseSize: number;
  disclaimer: string;
};

type RawComboDefinition = {
  combo_name?: unknown;
  cards?: unknown;
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

    if (!comboName || cards.length < 2 || cards.some((card) => !card)) {
      continue;
    }

    combos.push({
      comboName,
      cards,
      commanderSpellbookUrl:
        normalizeCommanderSpellbookUrl(candidate.commander_spellbook_url) ??
        buildCommanderSpellbookSearchUrl(comboName, cards)
    });
  }

  return combos;
}

const COMBO_DATABASE = normalizeComboDb(rawComboDb);

/**
 * Detects combos where every combo card exists in the provided deck card names.
 */
export function detectCombosInDeck(deckCardNames: string[]): ComboReport {
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

  for (const combo of COMBO_DATABASE) {
    const matchedCards: string[] = [];
    let isComplete = true;

    for (const comboCard of combo.cards) {
      const normalizedComboCard = normalizeLookupName(comboCard);
      const matchedDeckCard = availableByNormalizedName.get(normalizedComboCard);
      if (!matchedDeckCard) {
        isComplete = false;
        break;
      }

      matchedCards.push(matchedDeckCard);
    }

    if (isComplete) {
      detected.push({
        comboName: combo.comboName,
        cards: combo.cards,
        commanderSpellbookUrl: combo.commanderSpellbookUrl,
        matchedCards
      });
    }
  }

  return {
    detected,
    databaseSize: COMBO_DATABASE.length,
    disclaimer: "Combo detection uses an offline Commander Spellbook-derived combo snapshot."
  };
}

