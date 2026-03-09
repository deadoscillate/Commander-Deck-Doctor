type Provider = "archidekt";
const PROVIDER_FETCH_TIMEOUT_MS = 10_000;

type DeckEntry = {
  name: string;
  qty: number;
  setCode?: string;
  collectorNumber?: string;
};

type JsonRecord = Record<string, unknown>;

export type DeckImportResult = {
  provider: Provider;
  providerDeckId: string;
  deckName: string | null;
  decklist: string;
  cardCount: number;
  commanderCount: number;
  companionCount?: number;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asPositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }

  const rounded = Math.floor(num);
  return rounded > 0 ? rounded : null;
}

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

function mergeEntries(entries: DeckEntry[]): DeckEntry[] {
  const merged = new Map<string, DeckEntry>();

  for (const entry of entries) {
    const key = [
      normalizeName(entry.name),
      entry.setCode?.toLowerCase() ?? "",
      entry.collectorNumber?.toLowerCase() ?? ""
    ].join("|");
    const existing = merged.get(key);
    if (existing) {
      existing.qty += entry.qty;
      continue;
    }
    merged.set(key, { ...entry });
  }

  return [...merged.values()];
}

function toDecklist(commanders: DeckEntry[], companions: DeckEntry[], deckCards: DeckEntry[]): string {
  const formatEntry = (row: DeckEntry) => {
    if (row.setCode && row.collectorNumber) {
      return `${row.qty} ${row.name} (${row.setCode.toUpperCase()}) ${row.collectorNumber}`;
    }

    if (row.setCode) {
      return `${row.qty} ${row.name} (${row.setCode.toUpperCase()})`;
    }

    return `${row.qty} ${row.name}`;
  };
  const lines: string[] = [];

  if (commanders.length > 0) {
    lines.push("Commander");
    for (const row of commanders) {
      lines.push(formatEntry(row));
    }
    lines.push("");
  }

  if (companions.length > 0) {
    lines.push("Companion");
    for (const row of companions) {
      lines.push(formatEntry(row));
    }
    lines.push("");
  }

  lines.push("Deck");
  for (const row of deckCards) {
    lines.push(formatEntry(row));
  }

  return lines.join("\n");
}

function getEntryName(raw: unknown): string | null {
  const obj = asRecord(raw);
  if (!obj) {
    return null;
  }

  const card = asRecord(obj.card);
  const cardOracle = asRecord(card?.oracleCard);
  const cardPrinting = asRecord(card?.printingCard);
  const cardCard = asRecord(card?.card);
  const details = asRecord(obj.details);

  return (
    asString(card?.name) ??
    asString(obj.name) ??
    asString(obj.cardName) ??
    asString(cardOracle?.name) ??
    asString(cardPrinting?.name) ??
    asString(cardCard?.name) ??
    asString(details?.name) ??
    asString(obj.displayName)
  );
}

function getEntryQty(raw: unknown): number {
  const obj = asRecord(raw);
  return (
    asPositiveInt(obj?.quantity) ??
    asPositiveInt(obj?.qty) ??
    asPositiveInt(obj?.count) ??
    asPositiveInt(obj?.amount) ??
    1
  );
}

function getEntrySetCode(raw: unknown): string | null {
  const obj = asRecord(raw);
  if (!obj) {
    return null;
  }

  const edition = asRecord(obj.edition);
  const card = asRecord(obj.card);
  const rowEdition = asRecord(card?.edition);
  return (
    asString(edition?.editioncode) ??
    asString(rowEdition?.editioncode)
  );
}

function getEntryCollectorNumber(raw: unknown): string | null {
  const obj = asRecord(raw);
  if (!obj) {
    return null;
  }

  const card = asRecord(obj.card);
  return asString(obj.collectorNumber) ?? asString(card?.collectorNumber);
}

function toEntry(raw: unknown, fallbackName?: string): DeckEntry | null {
  const name = getEntryName(raw) ?? (fallbackName ? asString(fallbackName) : null);
  if (!name) {
    return null;
  }

  const setCode = getEntrySetCode(raw)?.toLowerCase() ?? undefined;
  const collectorNumber = getEntryCollectorNumber(raw) ?? undefined;
  return {
    name,
    qty: getEntryQty(raw),
    setCode,
    collectorNumber
  };
}

function categoriesContainCommander(raw: unknown): boolean {
  if (!Array.isArray(raw)) {
    return false;
  }

  for (const item of raw) {
    if (typeof item === "string" && item.toLowerCase().includes("commander")) {
      return true;
    }

    const objName = asString(asRecord(item)?.name);
    if (objName && objName.toLowerCase().includes("commander")) {
      return true;
    }
  }

  return false;
}

function parseProvider(urlInput: string): { provider: Provider; id: string } {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlInput);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS deck URLs are supported.");
  }

  const host = parsedUrl.hostname.toLowerCase();
  const path = parsedUrl.pathname;

  if (host === "archidekt.com" || host.endsWith(".archidekt.com")) {
    const match = path.match(/\/(?:api\/)?decks\/(\d+)/i);
    if (!match) {
      throw new Error("Could not parse Archidekt deck ID from URL.");
    }

    return { provider: "archidekt", id: match[1] };
  }

  throw new Error("Unsupported deck URL. Supported provider: Archidekt.");
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Commander-Deck-Doctor/1.0"
      },
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Provider API timed out. Please retry.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Deck not found. Check the URL and make sure the deck is public.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("Provider denied access. Make sure the deck is public.");
    }

    throw new Error(`Import failed (${response.status}) from provider API.`);
  }

  return response.json();
}

function buildCategoryInclusionLookup(raw: unknown): Map<string, boolean> {
  const rows = Array.isArray(raw) ? raw : [];
  const lookup = new Map<string, boolean>();
  for (const row of rows) {
    const category = asRecord(row);
    const name = asString(category?.name);
    if (!name) {
      continue;
    }

    lookup.set(normalizeCategoryName(name), category?.includedInDeck !== false);
  }

  return lookup;
}

function rowIncludedInDeck(
  rawCategories: unknown,
  categoryInclusionLookup: Map<string, boolean>
): boolean {
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    return true;
  }

  let sawKnownCategory = false;
  let included = false;
  for (const row of rawCategories) {
    const name = typeof row === "string" ? row : asString(asRecord(row)?.name);
    if (!name) {
      continue;
    }

    const normalizedName = normalizeCategoryName(name);
    const categoryIncluded = categoryInclusionLookup.get(normalizedName);
    if (typeof categoryIncluded !== "boolean") {
      continue;
    }

    sawKnownCategory = true;
    if (categoryIncluded) {
      included = true;
      break;
    }
  }

  return sawKnownCategory ? included : true;
}

async function importFromArchidekt(id: string): Promise<DeckImportResult> {
  const data = asRecord(await fetchJson(`https://archidekt.com/api/decks/${id}/`));
  const cards = Array.isArray(data?.cards) ? data.cards : [];
  const categoryInclusionLookup = buildCategoryInclusionLookup(data?.categories);

  const commanders: DeckEntry[] = [];
  const companions: DeckEntry[] = [];
  const mainboard: DeckEntry[] = [];

  for (const cardRow of cards) {
    const cardRowObj = asRecord(cardRow);
    if (!rowIncludedInDeck(cardRowObj?.categories, categoryInclusionLookup)) {
      continue;
    }

    const entry = toEntry(cardRowObj);
    if (!entry) {
      continue;
    }

    const isCompanion = cardRowObj?.companion === true;
    const isCommander = categoriesContainCommander(cardRowObj?.categories);
    if (isCompanion) {
      companions.push(entry);
    } else if (isCommander) {
      commanders.push(entry);
    } else {
      mainboard.push(entry);
    }
  }

  const mergedCommanders = mergeEntries(commanders);
  const mergedCompanions = mergeEntries(companions);
  const mergedMainboard = mergeEntries(mainboard);

  return {
    provider: "archidekt",
    providerDeckId: id,
    deckName: asString(data?.name),
    decklist: toDecklist(mergedCommanders, mergedCompanions, mergedMainboard),
    cardCount: mergedMainboard.reduce((sum, row) => sum + row.qty, 0) +
      mergedCommanders.reduce((sum, row) => sum + row.qty, 0),
    commanderCount: mergedCommanders.reduce((sum, row) => sum + row.qty, 0),
    companionCount: mergedCompanions.reduce((sum, row) => sum + row.qty, 0)
  };
}

/**
 * Imports supported deck URLs and returns normalized decklist text.
 */
export async function importDeckFromUrl(urlInput: string): Promise<DeckImportResult> {
  const { id } = parseProvider(urlInput);
  return importFromArchidekt(id);
}
