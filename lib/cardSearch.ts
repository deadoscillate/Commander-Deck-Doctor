import { CardDatabase } from "@/engine/cards/CardDatabase";
import { evaluateCommanderConfiguration } from "@/lib/commanderConfiguration";
import type { CommanderChoice } from "@/lib/contracts";
import { getLocalDefaultCardByName, getLocalDefaultCardsByNames } from "@/lib/scryfallLocalDefaultStore";
import { getLocalPrintCardsByNames, type LocalPrintCardRecord } from "@/lib/scryfallLocalPrintIndexStore";
import { listSqlitePrintSetRows, searchSqlitePrintCards } from "@/lib/scryfallLocalPrintSqliteStore";
import { getScryfallSetName, getScryfallSetOption, listScryfallSetMetadata, type ScryfallSetOption } from "@/lib/scryfallSetMetadata";
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
let setOptions: ScryfallSetOption[] | null = null;
type EngineSearchMeta = {
  oracleId: string;
  commanderLegal: boolean;
  commanderEligible: boolean;
  duplicateLimit: number | null;
  isBasicLand: boolean;
  colorIdentity: string[];
};

let engineMetaByOracleId: Map<string, EngineSearchMeta> | null = null;
let engineMetaByName: Map<string, EngineSearchMeta> | null = null;

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

function isBuilderSearchExcludedType(typeLine: string | null | undefined): boolean {
  const lower = (typeLine ?? "").toLowerCase();
  return lower.includes("stickers") || lower.includes("attraction");
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

function ensureEngineMetaMaps(): {
  byOracleId: Map<string, EngineSearchMeta>;
  byName: Map<string, EngineSearchMeta>;
} {
  if (engineMetaByOracleId && engineMetaByName) {
    return {
      byOracleId: engineMetaByOracleId,
      byName: engineMetaByName
    };
  }

  const db = CardDatabase.loadFromCompiledFile();
  engineMetaByOracleId = new Map();
  engineMetaByName = new Map();

  for (const card of db.allCards()) {
    const meta: EngineSearchMeta = {
      oracleId: card.oracleId,
      commanderLegal: isCommanderLegal(card.legalities),
      commanderEligible: isLegendaryCreature(card.typeLine) || card.oracleText.toLowerCase().includes("can be your commander"),
      duplicateLimit: duplicateLimitForCard({
        oracle_text: card.oracleText ?? "",
        card_faces: []
      }),
      isBasicLand: BASIC_LANDS.has(normalizeName(card.name)),
      colorIdentity: normalizedColorIdentity(card.colorIdentity ?? [])
    };

    engineMetaByOracleId.set(card.oracleId, meta);
    engineMetaByName.set(normalizeName(card.name), meta);
  }

  return {
    byOracleId: engineMetaByOracleId,
    byName: engineMetaByName
  };
}

function toSearchRecord(card: ScryfallCard): CardSearchRecord {
  const cardImage = card.image_uris?.normal ?? card.card_faces[0]?.image_uris?.normal ?? null;
  const artImage = card.image_uris?.art_crop ?? card.card_faces[0]?.image_uris?.normal ?? cardImage;
  const setOption = getScryfallSetOption(card.set);

  return {
    name: card.name,
    manaCost: card.mana_cost ?? "",
    cmc: typeof card.cmc === "number" && Number.isFinite(card.cmc) ? card.cmc : 0,
    typeLine: card.type_line,
    oracleText: card.oracle_text ?? "",
    colorIdentity: normalizedColorIdentity(card.color_identity ?? []),
    setCode: typeof card.set === "string" && card.set ? card.set.toUpperCase() : null,
    setName: setOption?.setName ?? getScryfallSetName(card.set),
    setReleaseYear: setOption?.releaseYear ?? null,
    collectorNumber: typeof card.collector_number === "string" && card.collector_number ? card.collector_number : null,
    printingId: typeof card.id === "string" && card.id ? card.id : null,
    commanderEligible: isCommanderEligible(card),
    isBasicLand: BASIC_LANDS.has(normalizeName(card.name)),
    duplicateLimit: duplicateLimitForCard(card),
    previewImageUrl: cardImage,
    artUrl: artImage
  };
}

function toSearchRecordFromPrintCard(
  card: LocalPrintCardRecord,
  meta: EngineSearchMeta | null
): CardSearchRecord {
  const cardImage = card.image_uris?.normal ?? card.card_faces[0]?.image_uris?.normal ?? null;
  const artImage = card.image_uris?.art_crop ?? card.card_faces[0]?.image_uris?.normal ?? cardImage;
  const setOption = getScryfallSetOption(card.set);

  return {
    name: card.name,
    manaCost: card.mana_cost ?? "",
    cmc: typeof card.cmc === "number" && Number.isFinite(card.cmc) ? card.cmc : 0,
    typeLine: card.type_line ?? "",
    oracleText: card.oracle_text ?? "",
    colorIdentity: normalizedColorIdentity(card.color_identity ?? meta?.colorIdentity ?? []),
    setCode: typeof card.set === "string" && card.set ? card.set.toUpperCase() : null,
    setName: setOption?.setName ?? getScryfallSetName(card.set),
    setReleaseYear: setOption?.releaseYear ?? null,
    collectorNumber: card.collector_number ?? null,
    printingId: card.id ?? null,
    commanderEligible: meta?.commanderEligible ?? isCommanderEligible({
      type_line: card.type_line ?? "",
      oracle_text: card.oracle_text ?? "",
      card_faces: card.card_faces
    }),
    isBasicLand: meta?.isBasicLand ?? BASIC_LANDS.has(normalizeName(card.name)),
    duplicateLimit:
      meta?.duplicateLimit ??
      duplicateLimitForCard({
        oracle_text: card.oracle_text ?? "",
        card_faces: card.card_faces
      }),
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
  const { byOracleId } = ensureEngineMetaMaps();
  const next = db
    .allCards()
    .map((engineCard) => {
      const meta = byOracleId.get(engineCard.oracleId) ?? null;
      const localCard = getLocalDefaultCardByName(engineCard.name);
      if (localCard) {
        return {
          ...toSearchRecord(localCard),
          commanderEligible: meta?.commanderEligible ?? isCommanderEligible(localCard),
          isBasicLand: meta?.isBasicLand ?? BASIC_LANDS.has(normalizeName(localCard.name)),
          duplicateLimit: meta?.duplicateLimit ?? duplicateLimitForCard(localCard)
        };
      }

      return {
        name: engineCard.name,
        manaCost: engineCard.manaCost ?? "",
        cmc: engineCard.mv ?? 0,
        typeLine: engineCard.typeLine,
        oracleText: engineCard.oracleText ?? "",
        colorIdentity: meta?.colorIdentity ?? normalizedColorIdentity(engineCard.colorIdentity ?? []),
        setCode: null,
        setName: null,
        setReleaseYear: null,
        collectorNumber: null,
        printingId: null,
        commanderEligible: meta?.commanderEligible ?? (isLegendaryCreature(engineCard.typeLine) || engineCard.oracleText.toLowerCase().includes("can be your commander")),
        isBasicLand: meta?.isBasicLand ?? BASIC_LANDS.has(normalizeName(engineCard.name)),
        duplicateLimit: meta?.duplicateLimit ?? duplicateLimitForCard({
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
  commanderSearchIndex = next.filter((card) => {
    const meta = ensureEngineMetaMaps().byName.get(normalizeName(card.name));
    return card.commanderEligible && !isDigitalVariantName(card.name) && (meta?.commanderLegal ?? true);
  });
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

function searchCommanderCards(input: SearchOptions = {}): CardSearchRecord[] {
  const query = input.query?.trim() ?? "";
  const colors = normalizedColorIdentity(input.colors ?? []);
  const allowedColors = new Set(normalizedColorIdentity(input.allowedColors ?? []));
  const setCode = input.setCode?.trim().toUpperCase() ?? "";
  const cardType = input.cardType?.trim().toLowerCase() ?? "";
  const includePairs = input.includePairs === true;
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 24)));
  const sourceRows = commanderSearchIndex ?? buildSearchIndex().filter((card) => card.commanderEligible && !isDigitalVariantName(card.name));

  const rows = sourceRows
    .filter((card) => {
      if (!card.commanderEligible || isDigitalVariantName(card.name)) {
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
      if (!card.commanderEligible || !includePairs) {
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

export async function searchCards(input: SearchOptions = {}): Promise<CardSearchRecord[]> {
  const commanderOnly = Boolean(input.commanderOnly);
  if (commanderOnly) {
    return searchCommanderCards(input);
  }

  const query = input.query?.trim() ?? "";
  const colors = normalizedColorIdentity(input.colors ?? []);
  const allowedColors = new Set(normalizedColorIdentity(input.allowedColors ?? []));
  const setCode = input.setCode?.trim().toUpperCase() ?? "";
  const cardType = input.cardType?.trim().toLowerCase() ?? "";
  const limit = Math.max(1, Math.min(1000, Math.floor(input.limit ?? 24)));
  const { byOracleId, byName } = ensureEngineMetaMaps();

  const printCards = await searchSqlitePrintCards({
    query,
    setCode,
    cardType,
    limit
  });

  if (printCards.length === 0) {
    if (setCode) {
      return [];
    }

    return buildSearchIndex()
      .filter((card) => {
        const meta = byName.get(normalizeName(card.name));
        if (meta && !meta.commanderLegal) {
          return false;
        }

        if (isDigitalVariantName(card.name) || isBuilderSearchExcludedType(card.typeLine)) {
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

        if (cardType && !card.typeLine.toLowerCase().includes(cardType)) {
          return false;
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
      .slice(0, limit);
  }

  return printCards
    .map((card) => {
      const meta = byOracleId.get(card.oracle_id) ?? byName.get(normalizeName(card.name)) ?? null;
      return {
        record: toSearchRecordFromPrintCard(card, meta),
        commanderLegal: meta?.commanderLegal ?? true
      };
    })
    .filter(({ record, commanderLegal }) => {
      if (!commanderLegal || isDigitalVariantName(record.name) || isBuilderSearchExcludedType(record.typeLine)) {
        return false;
      }

      if (colors.length > 0 && !exactIdentityMatch(record.colorIdentity, colors)) {
        return false;
      }

      if (allowedColors.size > 0 && !subsetOf(record.colorIdentity, allowedColors)) {
        return false;
      }

      return true;
    })
    .map(({ record }) => record)
    .slice(0, limit);
}

export async function lookupCardsByNames(
  names: string[],
  input: Pick<SearchOptions, "allowedColors" | "commanderOnly" | "includePairs"> = {}
): Promise<CardSearchRecord[]> {
  const allowedColors = new Set(normalizedColorIdentity(input.allowedColors ?? []));
  const commanderOnly = Boolean(input.commanderOnly);
  const includePairs = input.includePairs === true;
  const byName = buildSearchIndexByName();
  const { byName: engineByName } = ensureEngineMetaMaps();
  const seen = new Set<string>();
  const rows: CardSearchRecord[] = [];

  if (!commanderOnly) {
    const { byOracleId } = ensureEngineMetaMaps();
    const defaultCards = getLocalDefaultCardsByNames(names);
    const printCards = await getLocalPrintCardsByNames(names);

    for (const name of names) {
      const normalized = normalizeName(name);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      const defaultRecord = defaultCards.get(`name:${normalized}`) ?? null;
      const printRecord = printCards.get(`name:${normalized}`);
      const meta =
        (defaultRecord?.oracle_id ? byOracleId.get(defaultRecord.oracle_id) : null) ??
        (printRecord?.oracle_id ? byOracleId.get(printRecord.oracle_id) : null) ??
        engineByName.get(normalized) ??
        null;

      if (meta && !meta.commanderLegal) {
        continue;
      }

      const card = defaultRecord
        ? toSearchRecord(defaultRecord)
        : printRecord
          ? toSearchRecordFromPrintCard(printRecord, meta)
          : byName.get(normalized);
      if (!card) {
        continue;
      }

      if (isBuilderSearchExcludedType(card.typeLine)) {
        continue;
      }

      if (allowedColors.size > 0 && !subsetOf(card.colorIdentity, allowedColors)) {
        continue;
      }

      rows.push(card);
    }

    return rows;
  }

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

    const meta = engineByName.get(normalized);
    if (meta && !meta.commanderLegal) {
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

export async function listSearchSetOptions(): Promise<ScryfallSetOption[]> {
  if (setOptions) {
    return setOptions;
  }

  const metadataByCode = new Map(
    listScryfallSetMetadata().map((row) => [row.setCode.toUpperCase(), row] as const)
  );
  const printRows = await listSqlitePrintSetRows();
  const seen = new Set<string>();
  const output: ScryfallSetOption[] = [];

  for (const row of printRows) {
    const setCode = row.setCode.toUpperCase();
    const meta = ensureEngineMetaMaps().byOracleId.get(row.oracleId);
    if (
      !setCode ||
      setCode === "SUNF" ||
      seen.has(setCode) ||
      (meta && !meta.commanderLegal) ||
      isDigitalVariantName(row.name) ||
      isBuilderSearchExcludedType(row.typeLine)
    ) {
      continue;
    }

    seen.add(setCode);
    const metadata = metadataByCode.get(setCode) ?? null;
    output.push({
      setCode,
      setName: metadata?.setName ?? getScryfallSetName(setCode) ?? setCode,
      releasedAt: metadata?.releasedAt ?? null,
      releaseYear: metadata?.releaseYear ?? null
    });
  }

  setOptions = output.sort((left, right) => {
    const leftYear = left.releaseYear ?? Number.MAX_SAFE_INTEGER;
    const rightYear = right.releaseYear ?? Number.MAX_SAFE_INTEGER;
    if (leftYear !== rightYear) {
      return leftYear - rightYear;
    }

    return left.setCode.localeCompare(right.setCode);
  });
  return setOptions;
}

export function clearCardSearchCache(): void {
  searchIndex = null;
  searchIndexByName = null;
  commanderPool = null;
  commanderSearchIndex = null;
  setOptions = null;
  engineMetaByOracleId = null;
  engineMetaByName = null;
}
