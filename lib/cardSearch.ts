import { CardDatabase } from "@/engine/cards/CardDatabase";
import { evaluateCommanderConfiguration } from "@/lib/commanderConfiguration";
import type { CommanderChoice } from "@/lib/contracts";
import { getLocalDefaultCardByName } from "@/lib/scryfallLocalDefaultStore";
import type { ScryfallCard } from "@/lib/types";

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

export type CardSearchRecord = {
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colorIdentity: string[];
  setCode: string | null;
  commanderEligible: boolean;
  isBasicLand: boolean;
  duplicateLimit: number | null;
  previewImageUrl: string | null;
  artUrl: string | null;
  pairOptions?: CommanderChoice["pairOptions"];
  pairOptionsResolved?: boolean;
};

type SearchOptions = {
  query?: string;
  commanderOnly?: boolean;
  colors?: string[];
  allowedColors?: string[];
  setCode?: string;
  cardType?: string;
  includePairs?: boolean;
  limit?: number;
};

let searchIndex: CardSearchRecord[] | null = null;
let searchIndexByName: Map<string, CardSearchRecord> | null = null;
let commanderPool: ScryfallCard[] | null = null;
let commanderSearchIndex: CardSearchRecord[] | null = null;
let setOptions: string[] | null = null;

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizedColorIdentity(identity: string[]): string[] {
  return [...new Set(identity.filter(Boolean).map((value) => value.toUpperCase()))].sort();
}

function isDigitalVariantName(name: string): boolean {
  return /^a-/i.test(name.trim());
}

function isLegendaryCreature(typeLine: string): boolean {
  const lower = typeLine.toLowerCase();
  return lower.includes("legendary") && lower.includes("creature");
}

function isCommanderEligible(card: Pick<ScryfallCard, "type_line" | "oracle_text" | "card_faces">): boolean {
  if (isLegendaryCreature(card.type_line)) {
    return true;
  }

  const oracleText = [card.oracle_text, ...card.card_faces.map((face) => face.oracle_text ?? "")]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return oracleText.includes("can be your commander");
}

function duplicateLimitForCard(card: Pick<ScryfallCard, "oracle_text" | "card_faces">): number | null {
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

function toSearchRecord(card: ScryfallCard): CardSearchRecord {
  const cardImage = card.image_uris?.normal ?? card.card_faces[0]?.image_uris?.normal ?? null;
  const artImage = card.image_uris?.art_crop ?? card.card_faces[0]?.image_uris?.normal ?? cardImage;

  return {
    name: card.name,
    manaCost: card.mana_cost ?? "",
    cmc: typeof card.cmc === "number" && Number.isFinite(card.cmc) ? card.cmc : 0,
    typeLine: card.type_line,
    oracleText: card.oracle_text ?? "",
    colorIdentity: normalizedColorIdentity(card.color_identity ?? []),
    setCode: typeof card.set === "string" && card.set ? card.set.toUpperCase() : null,
    commanderEligible: isCommanderEligible(card),
    isBasicLand: BASIC_LANDS.has(normalizeName(card.name)),
    duplicateLimit: duplicateLimitForCard(card),
    previewImageUrl: cardImage,
    artUrl: artImage
  };
}

function buildFallbackScryfallCard(record: CardSearchRecord): ScryfallCard {
  return {
    name: record.name,
    type_line: record.typeLine,
    cmc: record.cmc,
    mana_cost: record.manaCost,
    colors: [],
    color_identity: record.colorIdentity,
    oracle_text: record.oracleText,
    set: record.setCode?.toLowerCase(),
    image_uris: null,
    card_faces: [],
    prices: null
  };
}

function buildCommanderPool(): ScryfallCard[] {
  if (commanderPool) {
    return commanderPool;
  }

  commanderPool = buildSearchIndex()
    .filter((record) => record.commanderEligible)
    .map((record) => getLocalDefaultCardByName(record.name) ?? buildFallbackScryfallCard(record));
  return commanderPool;
}

function sortColorIdentity(identity: string[]): string[] {
  const order = ["W", "U", "B", "R", "G", "C"];
  return [...identity].sort((left, right) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex === -1 || rightIndex === -1) {
      return left.localeCompare(right);
    }

    return leftIndex - rightIndex;
  });
}

function getPairOptionsForCard(card: ScryfallCard): CommanderChoice["pairOptions"] | undefined {
  const options = buildCommanderPool()
    .filter((other) => normalizeName(other.name) !== normalizeName(card.name))
    .map((other) => {
      const configuration = evaluateCommanderConfiguration([card.name, other.name], [card, other], true);
      if (!configuration.ok || !configuration.pairType || configuration.pairType === "single") {
        return null;
      }

      return {
        name: other.name,
        colorIdentity: normalizedColorIdentity(other.color_identity ?? []),
        combinedColorIdentity: sortColorIdentity([
          ...new Set([...normalizedColorIdentity(card.color_identity ?? []), ...normalizedColorIdentity(other.color_identity ?? [])])
        ]),
        pairType: configuration.pairType
      } satisfies NonNullable<CommanderChoice["pairOptions"]>[number];
    })
    .filter((entry): entry is NonNullable<CommanderChoice["pairOptions"]>[number] => Boolean(entry))
    .sort((left, right) => left.name.localeCompare(right.name));

  return options.length > 0 ? options : undefined;
}

function buildSearchIndex(): CardSearchRecord[] {
  if (searchIndex) {
    return searchIndex;
  }

  const db = CardDatabase.loadFromCompiledFile();
  const next = db
    .allCards()
    .map((engineCard) => {
      const localCard = getLocalDefaultCardByName(engineCard.name);
      if (localCard) {
        return toSearchRecord(localCard);
      }

      return {
        name: engineCard.name,
        manaCost: engineCard.manaCost ?? "",
        cmc: engineCard.mv ?? 0,
        typeLine: engineCard.typeLine,
        oracleText: engineCard.oracleText ?? "",
        colorIdentity: normalizedColorIdentity(engineCard.colorIdentity ?? []),
        setCode: null,
        commanderEligible: isLegendaryCreature(engineCard.typeLine) || engineCard.oracleText.toLowerCase().includes("can be your commander"),
        isBasicLand: BASIC_LANDS.has(normalizeName(engineCard.name)),
        duplicateLimit: duplicateLimitForCard({
          oracle_text: engineCard.oracleText ?? "",
          card_faces: []
        }),
        previewImageUrl: null,
        artUrl: null
      } satisfies CardSearchRecord;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  searchIndex = next;
  searchIndexByName = new Map(next.map((card) => [normalizeName(card.name), card]));
  commanderSearchIndex = next.filter((card) => card.commanderEligible && !isDigitalVariantName(card.name));
  return next;
}

function buildSearchIndexByName(): Map<string, CardSearchRecord> {
  if (searchIndexByName) {
    return searchIndexByName;
  }

  buildSearchIndex();
  return searchIndexByName ?? new Map();
}

function subsetOf(identity: string[], allowed: Set<string>): boolean {
  return identity.every((color) => allowed.has(color));
}

function exactIdentityMatch(identity: string[], colors: string[]): boolean {
  if (identity.length !== colors.length) {
    return false;
  }

  return identity.every((color, index) => color === colors[index]);
}

function searchScore(card: CardSearchRecord, query: string): number {
  if (!query) {
    return 0;
  }

  const normalizedQuery = normalizeName(query);
  const normalizedCardName = normalizeName(card.name);
  if (normalizedCardName === normalizedQuery) {
    return 100;
  }

  if (normalizedCardName.startsWith(normalizedQuery)) {
    return 75;
  }

  if (normalizedCardName.includes(normalizedQuery)) {
    return 50;
  }

  const typeLine = normalizeName(card.typeLine);
  if (typeLine.includes(normalizedQuery)) {
    return 20;
  }

  return 0;
}

export function searchCards(input: SearchOptions = {}): CardSearchRecord[] {
  const query = input.query?.trim() ?? "";
  const commanderOnly = Boolean(input.commanderOnly);
  const colors = normalizedColorIdentity(input.colors ?? []);
  const allowedColors = new Set(normalizedColorIdentity(input.allowedColors ?? []));
  const setCode = input.setCode?.trim().toUpperCase() ?? "";
  const cardType = input.cardType?.trim().toLowerCase() ?? "";
  const includePairs = input.includePairs === true;
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 24)));
  const sourceRows = commanderOnly ? (commanderSearchIndex ?? buildSearchIndex().filter((card) => card.commanderEligible && !isDigitalVariantName(card.name))) : buildSearchIndex();

  const rows = sourceRows
    .filter((card) => {
      if (commanderOnly && !card.commanderEligible) {
        return false;
      }

      if (commanderOnly && isDigitalVariantName(card.name)) {
        return false;
      }

      if (colors.length > 0 && !exactIdentityMatch(card.colorIdentity, colors)) {
        return false;
      }

      if (allowedColors.size > 0 && !subsetOf(card.colorIdentity, allowedColors)) {
        return false;
      }

      if (setCode && card.setCode !== setCode) {
        return false;
      }

      if (cardType) {
        const normalizedTypeLine = card.typeLine.toLowerCase();
        if (!normalizedTypeLine.includes(cardType)) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      return searchScore(card, query) > 0;
    })
    .sort((left, right) => {
      const scoreDelta = searchScore(right, query) - searchScore(left, query);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, limit)
    .map((card) => {
      if (!commanderOnly || !card.commanderEligible || !includePairs) {
        return card;
      }

      const resolvedCard = getLocalDefaultCardByName(card.name) ?? buildFallbackScryfallCard(card);
      return {
        ...card,
        pairOptionsResolved: true,
        pairOptions: getPairOptionsForCard(resolvedCard)
      };
    });

  return rows;
}

export function lookupCardsByNames(
  names: string[],
  input: Pick<SearchOptions, "allowedColors" | "commanderOnly" | "includePairs"> = {}
): CardSearchRecord[] {
  const allowedColors = new Set(normalizedColorIdentity(input.allowedColors ?? []));
  const commanderOnly = Boolean(input.commanderOnly);
  const includePairs = input.includePairs === true;
  const byName = buildSearchIndexByName();
  const seen = new Set<string>();
  const rows: CardSearchRecord[] = [];

  for (const name of names) {
    const normalized = normalizeName(name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    const card = byName.get(normalized);
    if (!card) {
      continue;
    }

    if (commanderOnly && !card.commanderEligible) {
      continue;
    }

    if (allowedColors.size > 0 && !subsetOf(card.colorIdentity, allowedColors)) {
      continue;
    }

    if (!commanderOnly || !card.commanderEligible || !includePairs) {
      rows.push(card);
      continue;
    }

    const resolvedCard = getLocalDefaultCardByName(card.name) ?? buildFallbackScryfallCard(card);
    rows.push({
      ...card,
      pairOptionsResolved: true,
      pairOptions: getPairOptionsForCard(resolvedCard)
    });
  }

  return rows;
}

export function listSearchSetOptions(): string[] {
  if (setOptions) {
    return setOptions;
  }

  const seen = new Set<string>();
  const output: string[] = [];

  for (const card of buildSearchIndex()) {
    if (!card.setCode || seen.has(card.setCode)) {
      continue;
    }

    seen.add(card.setCode);
    output.push(card.setCode);
  }

  setOptions = output.sort((left, right) => left.localeCompare(right));
  return setOptions;
}

export function clearCardSearchCache(): void {
  searchIndex = null;
  searchIndexByName = null;
  commanderPool = null;
  commanderSearchIndex = null;
  setOptions = null;
}
