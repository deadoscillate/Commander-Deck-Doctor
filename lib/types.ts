/**
 * Parsed decklist row from user text input.
 */
export type ParsedDeckEntry = {
  name: string;
  qty: number;
  setCode?: string;
  collectorNumber?: string;
  printingId?: string;
};

/**
 * Minimal Scryfall fields needed by this MVP analyzer.
 */
export type ScryfallImageUris = {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
};

export type ScryfallCardFace = {
  oracle_text?: string;
  mana_cost?: string;
  image_uris?: ScryfallImageUris;
};

export type ScryfallPrices = {
  usd: string | null;
  usd_foil: string | null;
  usd_etched: string | null;
  tix: string | null;
};

export type ScryfallCard = {
  id?: string;
  oracle_id?: string;
  set?: string;
  name: string;
  type_line: string;
  cmc: number;
  mana_cost: string;
  colors: string[];
  color_identity: string[];
  oracle_text: string;
  keywords?: string[];
  image_uris: ScryfallImageUris | null;
  card_faces: ScryfallCardFace[];
  prices: ScryfallPrices | null;
};

/**
 * Resolved card row after lookup.
 */
export type DeckCard = ParsedDeckEntry & {
  card: ScryfallCard;
};

/**
 * Counts by gameplay role using engine behavior templates plus structured card-text patterns.
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
