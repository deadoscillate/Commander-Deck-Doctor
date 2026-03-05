/**
 * Parsed decklist row from user text input.
 */
export type ParsedDeckEntry = {
  name: string;
  qty: number;
};

/**
 * Minimal Scryfall fields needed by this MVP analyzer.
 */
export type ScryfallCard = {
  name: string;
  type_line: string;
  cmc: number;
  colors: string[];
  color_identity: string[];
  oracle_text: string;
};

/**
 * Resolved card row after lookup.
 */
export type DeckCard = ParsedDeckEntry & {
  card: ScryfallCard;
};

/**
 * Counts by gameplay role. These are heuristic tags, not oracle-accurate rules.
 */
export type RoleCounts = {
  ramp: number;
  draw: number;
  removal: number;
  wipes: number;
  tutors: number;
  protection: number;
  finishers: number;
};

/**
 * Counts by primary card type buckets shown in the UI.
 */
export type TypeCounts = {
  creature: number;
  instant: number;
  sorcery: number;
  artifact: number;
  enchantment: number;
  planeswalker: number;
  land: number;
  battle: number;
};

/**
 * Deck-level aggregate stats returned to the UI.
 */
export type DeckSummary = {
  deckSize: number;
  uniqueCards: number;
  colors: string[];
  averageManaValue: number;
  types: TypeCounts;
  manaCurve: Record<string, number>;
};

/**
 * Bracket estimate object with human-readable label and rationale.
 */
export type BracketEstimate = {
  value: 1 | 2 | 3 | 4 | 5;
  label: "Exhibition" | "Core" | "Upgraded" | "Optimized" | "cEDH";
  rationale: string;
};
