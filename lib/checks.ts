import type { DeckChecks } from "./contracts";
import type { DeckCard, ParsedDeckEntry } from "./types";

const BASIC_LANDS = new Set<string>([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snowcoveredplains",
  "snowcoveredisland",
  "snowcoveredswamp",
  "snowcoveredmountain",
  "snowcoveredforest",
  "snowcoveredwastes"
]);

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isBasicLand(name: string): boolean {
  return BASIC_LANDS.has(normalizeName(name));
}

function colorLabel(code: string): string {
  if (code === "W") return "White";
  if (code === "U") return "Blue";
  if (code === "B") return "Black";
  if (code === "R") return "Red";
  if (code === "G") return "Green";
  return code;
}

/**
 * Builds simple Commander sanity checks: deck size, unknown cards, and singleton duplicates.
 */
export function buildDeckChecks(parsedDeck: ParsedDeckEntry[], unknownCards: string[]): DeckChecks {
  const deckSize = parsedDeck.reduce((sum, entry) => sum + entry.qty, 0);
  const duplicates = parsedDeck
    .filter((entry) => entry.qty > 1 && !isBasicLand(entry.name))
    .map((entry) => ({ name: entry.name, qty: entry.qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

  const unknownCount = unknownCards.length;
  const duplicateCount = duplicates.length;

  return {
    deckSize: {
      ok: deckSize === 100,
      expected: 100,
      actual: deckSize,
      message:
        deckSize === 100
          ? "Deck size is 100."
          : `Deck size is ${deckSize}; Commander decks are typically 100 cards.`
    },
    unknownCards: {
      ok: unknownCount === 0,
      count: unknownCount,
      cards: unknownCards,
      message:
        unknownCount === 0
          ? "All card names resolved."
          : `${unknownCount} unknown card name${unknownCount === 1 ? "" : "s"} found.`
    },
    singleton: {
      ok: duplicateCount === 0,
      duplicateCount,
      duplicates,
      message:
        duplicateCount === 0
          ? "No non-basic duplicates detected."
          : `${duplicateCount} non-basic duplicate${duplicateCount === 1 ? "" : "s"} detected.`
    },
    colorIdentity: {
      ok: false,
      enabled: false,
      commanderName: null,
      commanderColorIdentity: [],
      offColorCount: 0,
      offColorCards: [],
      message: "Commander not selected. Choose a commander to validate color identity."
    }
  };
}

/**
 * Validates all known cards against commander's color identity.
 */
export function buildColorIdentityCheck(
  deckCards: DeckCard[],
  commanderName: string | null,
  commanderColorIdentity: string[]
): DeckChecks["colorIdentity"] {
  if (!commanderName) {
    return {
      ok: false,
      enabled: false,
      commanderName: null,
      commanderColorIdentity: [],
      offColorCount: 0,
      offColorCards: [],
      message: "Commander not selected. Choose a commander to validate color identity."
    };
  }

  const commanderColorSet = new Set(commanderColorIdentity);
  const offColorCards = deckCards
    .map((entry) => {
      const disallowed = entry.card.color_identity.filter((code) => !commanderColorSet.has(code));
      if (disallowed.length === 0) {
        return null;
      }

      return {
        name: entry.card.name,
        qty: entry.qty,
        disallowedColors: disallowed.map(colorLabel)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));

  const offColorCount = offColorCards.length;
  const ciText = commanderColorIdentity.length > 0 ? commanderColorIdentity.join("/") : "colorless";

  return {
    ok: offColorCount === 0,
    enabled: true,
    commanderName,
    commanderColorIdentity,
    offColorCount,
    offColorCards,
    message:
      offColorCount === 0
        ? `All known cards fit ${commanderName}'s color identity (${ciText}).`
        : `${offColorCount} off-color card${offColorCount === 1 ? "" : "s"} detected against ${commanderName}'s color identity (${ciText}).`
  };
}
