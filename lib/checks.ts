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

const NUMBER_WORDS = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12]
]);

function duplicateAllowanceForCard(card: DeckCard["card"] | null | undefined): number | null {
  if (!card) {
    return null;
  }

  const oracleText = [card.oracle_text, ...card.card_faces.map((face) => face.oracle_text ?? "")]
    .filter(Boolean)
    .join("\n");

  if (/a deck can have any number of cards named/i.test(oracleText)) {
    return Number.POSITIVE_INFINITY;
  }

  const limitedMatch = oracleText.match(/a deck can have up to ([a-z0-9-]+) cards? named/i);
  const rawLimit = limitedMatch?.[1]?.toLowerCase() ?? null;
  if (!rawLimit) {
    return null;
  }

  if (/^\d+$/.test(rawLimit)) {
    return Number.parseInt(rawLimit, 10);
  }

  return NUMBER_WORDS.get(rawLimit) ?? null;
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
export function buildDeckChecks(
  parsedDeck: ParsedDeckEntry[],
  unknownCards: string[],
  knownCards: DeckCard[] = []
): DeckChecks {
  const deckSize = parsedDeck.reduce((sum, entry) => sum + entry.qty, 0);
  const knownCardByName = new Map(
    knownCards.map((entry) => [normalizeName(entry.name), entry] as const)
  );
  const duplicates = parsedDeck
    .filter((entry) => {
      if (entry.qty <= 1 || isBasicLand(entry.name)) {
        return false;
      }

      const knownEntry = knownCardByName.get(normalizeName(entry.name)) ?? null;
      const duplicateAllowance = duplicateAllowanceForCard(knownEntry?.card);
      if (duplicateAllowance == null) {
        return true;
      }

      return entry.qty > duplicateAllowance;
    })
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
