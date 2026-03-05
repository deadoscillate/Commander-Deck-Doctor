type Provider = "moxfield" | "archidekt";

type DeckEntry = {
  name: string;
  qty: number;
};

type JsonRecord = Record<string, unknown>;

export type DeckImportResult = {
  provider: Provider;
  providerDeckId: string;
  deckName: string | null;
  decklist: string;
  cardCount: number;
  commanderCount: number;
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

function mergeEntries(entries: DeckEntry[]): DeckEntry[] {
  const merged = new Map<string, DeckEntry>();

  for (const entry of entries) {
    const key = normalizeName(entry.name);
    const existing = merged.get(key);
    if (existing) {
      existing.qty += entry.qty;
      continue;
    }
    merged.set(key, { ...entry });
  }

  return [...merged.values()];
}

function toDecklist(commanders: DeckEntry[], deckCards: DeckEntry[]): string {
  const lines: string[] = [];

  if (commanders.length > 0) {
    lines.push("Commander");
    for (const row of commanders) {
      lines.push(`${row.qty} ${row.name}`);
    }
    lines.push("");
  }

  lines.push("Deck");
  for (const row of deckCards) {
    lines.push(`${row.qty} ${row.name}`);
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

function toEntry(raw: unknown, fallbackName?: string): DeckEntry | null {
  const name = getEntryName(raw) ?? (fallbackName ? asString(fallbackName) : null);
  if (!name) {
    return null;
  }

  return {
    name,
    qty: getEntryQty(raw)
  };
}

function extractEntriesFromUnknownBoard(board: unknown): DeckEntry[] {
  if (!board) {
    return [];
  }

  if (Array.isArray(board)) {
    return board.map((item) => toEntry(item)).filter((item): item is DeckEntry => Boolean(item));
  }

  if (typeof board === "object") {
    const rows: DeckEntry[] = [];
    for (const [key, value] of Object.entries(board as Record<string, unknown>)) {
      if (typeof value === "number") {
        const name = asString(key);
        const qty = asPositiveInt(value);
        if (name && qty) {
          rows.push({ name, qty });
        }
        continue;
      }

      const entry = toEntry(value, key);
      if (entry) {
        rows.push(entry);
      }
    }
    return rows;
  }

  return [];
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

  const host = parsedUrl.hostname.toLowerCase();
  const path = parsedUrl.pathname;

  if (host.includes("moxfield.com")) {
    const match = path.match(/\/decks\/([^/?#]+)/i);
    if (!match) {
      throw new Error("Could not parse Moxfield deck ID from URL.");
    }

    return { provider: "moxfield", id: match[1] };
  }

  if (host.includes("archidekt.com")) {
    const match = path.match(/\/(?:api\/)?decks\/(\d+)/i);
    if (!match) {
      throw new Error("Could not parse Archidekt deck ID from URL.");
    }

    return { provider: "archidekt", id: match[1] };
  }

  throw new Error("Unsupported deck URL. Supported providers: Moxfield, Archidekt.");
}

function looksLikeCloudflareBlock(body: string): boolean {
  return /cloudflare|attention required|you have been blocked/i.test(body);
}

async function fetchJson(url: string, provider: Provider): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Commander-Deck-Doctor/1.0"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    if (provider === "moxfield" && (response.status === 403 || looksLikeCloudflareBlock(body))) {
      throw new Error(
        "Moxfield blocked automated requests from this environment (Cloudflare). Use an Archidekt URL or paste decklist text directly."
      );
    }

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

async function importFromArchidekt(id: string): Promise<DeckImportResult> {
  const data = asRecord(await fetchJson(`https://archidekt.com/api/decks/${id}/`, "archidekt"));
  const cards = Array.isArray(data?.cards) ? data.cards : [];

  const commanders: DeckEntry[] = [];
  const mainboard: DeckEntry[] = [];

  for (const cardRow of cards) {
    const cardRowObj = asRecord(cardRow);
    const rowCard = asRecord(cardRowObj?.card);
    const oracleCard = asRecord(rowCard?.oracleCard);
    const name = asString(oracleCard?.name) ?? asString(rowCard?.name);
    const qty = asPositiveInt(cardRowObj?.quantity) ?? 1;
    if (!name) {
      continue;
    }

    const isCommander =
      categoriesContainCommander(cardRowObj?.categories) || cardRowObj?.companion === true;
    if (isCommander) {
      commanders.push({ name, qty });
    } else {
      mainboard.push({ name, qty });
    }
  }

  const mergedCommanders = mergeEntries(commanders);
  const mergedMainboard = mergeEntries(mainboard);

  return {
    provider: "archidekt",
    providerDeckId: id,
    deckName: asString(data?.name),
    decklist: toDecklist(mergedCommanders, mergedMainboard),
    cardCount: mergedMainboard.reduce((sum, row) => sum + row.qty, 0) +
      mergedCommanders.reduce((sum, row) => sum + row.qty, 0),
    commanderCount: mergedCommanders.reduce((sum, row) => sum + row.qty, 0)
  };
}

function splitMoxfieldBoards(data: JsonRecord): { commanders: DeckEntry[]; mainboard: DeckEntry[] } {
  const commanders: DeckEntry[] = [];
  const mainboard: DeckEntry[] = [];

  commanders.push(...extractEntriesFromUnknownBoard(data?.commanders));
  mainboard.push(...extractEntriesFromUnknownBoard(data?.mainboard));

  const boards = asRecord(data.boards);
  if (boards) {
    for (const [boardName, boardValue] of Object.entries(boards)) {
      const key = boardName.toLowerCase();
      const boardObj = asRecord(boardValue);
      const rows = extractEntriesFromUnknownBoard(boardObj?.cards ?? boardValue);
      if (rows.length === 0) {
        continue;
      }

      if (key.includes("commander")) {
        commanders.push(...rows);
      } else if (key.includes("main") || key.includes("deck")) {
        mainboard.push(...rows);
      }
    }
  }

  if (mainboard.length === 0 && Array.isArray(data?.cards)) {
    for (const row of data.cards) {
      const entry = toEntry(row);
      if (!entry) {
        continue;
      }

      const rowObj = asRecord(row);
      const commanderHint =
        rowObj?.isCommander === true ||
        asString(rowObj?.board)?.toLowerCase().includes("commander") === true ||
        asString(rowObj?.zone)?.toLowerCase().includes("commander") === true ||
        categoriesContainCommander(rowObj?.categories);

      if (commanderHint) {
        commanders.push(entry);
      } else {
        mainboard.push(entry);
      }
    }
  }

  return {
    commanders: mergeEntries(commanders),
    mainboard: mergeEntries(mainboard)
  };
}

async function importFromMoxfield(id: string): Promise<DeckImportResult> {
  const data = asRecord(await fetchJson(`https://api.moxfield.com/v2/decks/${id}`, "moxfield"));
  if (!data) {
    throw new Error("Import failed: unexpected Moxfield response format.");
  }

  const { commanders, mainboard } = splitMoxfieldBoards(data);

  return {
    provider: "moxfield",
    providerDeckId: id,
    deckName: asString(data?.name),
    decklist: toDecklist(commanders, mainboard),
    cardCount: mainboard.reduce((sum, row) => sum + row.qty, 0) +
      commanders.reduce((sum, row) => sum + row.qty, 0),
    commanderCount: commanders.reduce((sum, row) => sum + row.qty, 0)
  };
}

/**
 * Imports supported deck URLs and returns normalized decklist text.
 */
export async function importDeckFromUrl(urlInput: string): Promise<DeckImportResult> {
  const { provider, id } = parseProvider(urlInput);

  if (provider === "archidekt") {
    return importFromArchidekt(id);
  }

  return importFromMoxfield(id);
}
