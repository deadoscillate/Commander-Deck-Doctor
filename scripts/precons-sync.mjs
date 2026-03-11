import fs from "node:fs/promises";
import path from "node:path";

const DECK_LIST_URL = "https://mtgjson.com/api/v5/DeckList.json";
const DECK_FILE_BASE_URL = "https://mtgjson.com/api/v5/decks";
const OUTPUT_PATH = path.join(process.cwd(), "data", "precons", "commander-precons.json");
const INCLUDED_TYPES = new Set(["Commander Deck", "MTGO Commander Deck"]);
const DEFAULT_CONCURRENCY = Number(process.env.PRECONS_SYNC_CONCURRENCY || 4);
const FETCH_TIMEOUT_MS = Number(process.env.PRECONS_SYNC_TIMEOUT_MS || 30000);
const MAX_FETCH_RETRIES = Number(process.env.PRECONS_SYNC_RETRIES || 5);
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unionColorIdentity(cards) {
  return [...new Set(cards.flatMap((card) => card.colorIdentity ?? []))].sort();
}

function dedupeCards(cards) {
  const rows = new Map();
  for (const card of cards ?? []) {
    if (!card || typeof card.name !== "string" || !card.name.trim()) {
      continue;
    }

    const key = [
      card.name.trim().toLowerCase(),
      typeof card.setCode === "string" ? card.setCode.trim().toLowerCase() : "",
      typeof card.number === "string" ? card.number.trim().toLowerCase() : ""
    ].join("|");
    const current = rows.get(key);
    if (current) {
      current.count += Number(card.count) || 1;
      rows.set(key, current);
      continue;
    }

    rows.set(key, {
      name: card.name.trim(),
      count: Number(card.count) || 1,
      setCode: typeof card.setCode === "string" ? card.setCode.trim().toUpperCase() : "",
      collectorNumber: typeof card.number === "string" ? card.number.trim() : ""
    });
  }

  return [...rows.values()];
}

function formatDecklistLine(card) {
  const setCode = typeof card.setCode === "string" ? card.setCode.trim().toUpperCase() : "";
  const collectorNumber =
    typeof card.collectorNumber === "string" ? card.collectorNumber.trim() : "";

  if (setCode && collectorNumber) {
    return `${card.count} ${card.name} (${setCode}) ${collectorNumber}`;
  }

  if (setCode) {
    return `${card.count} ${card.name} [${setCode}]`;
  }

  return `${card.count} ${card.name}`;
}

function buildDecklist(deck) {
  const commanderCards = dedupeCards(deck.commander);
  const commanderKeys = new Set(commanderCards.map((card) => card.name.toLowerCase()));
  const mainBoard = dedupeCards(deck.mainBoard).filter((card) => !commanderKeys.has(card.name.toLowerCase()));

  const commanderLines = commanderCards.map(formatDecklistLine);
  const mainBoardLines = mainBoard.map(formatDecklistLine);

  return ["Commander", ...commanderLines, "", ...mainBoardLines].join("\n").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt, response) {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  return Math.min(1000 * 2 ** (attempt - 1), 10000);
}

async function fetchJson(url, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CommanderDeckDoctor/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      if (attempt < MAX_FETCH_RETRIES && RETRYABLE_STATUS_CODES.has(response.status)) {
        await sleep(retryDelayMs(attempt, response));
        return fetchJson(url, attempt + 1);
      }

      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    const isNetworkError = error instanceof TypeError || isAbort;

    if (attempt < MAX_FETCH_RETRIES && isNetworkError) {
      await sleep(retryDelayMs(attempt));
      return fetchJson(url, attempt + 1);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => worker());
  await Promise.all(workers);
  return results;
}

function isIncludedDeck(record) {
  if (!INCLUDED_TYPES.has(record.type)) {
    return false;
  }

  if (/collector'?s edition/i.test(record.name)) {
    return false;
  }

  return true;
}

function toPreconDeck(record, deck) {
  const commanderCards = dedupeCards(deck.commander);
  const displayCommanderCards = dedupeCards(deck.displayCommander?.length ? deck.displayCommander : deck.commander);
  const cardCount =
    commanderCards.reduce((sum, card) => sum + card.count, 0) +
    dedupeCards(deck.mainBoard)
      .filter((card) => !new Set(commanderCards.map((entry) => entry.name.toLowerCase())).has(card.name.toLowerCase()))
      .reduce((sum, card) => sum + card.count, 0);

  return {
    slug: `${record.code.toLowerCase()}-${slugify(record.name)}`,
    code: record.code,
    fileName: record.fileName,
    name: record.name,
    releaseDate: record.releaseDate,
    type: record.type,
    commanderNames: dedupeCards(deck.commander).map((card) => card.name),
    displayCommanderNames: displayCommanderCards.map((card) => card.name),
    colorIdentity: unionColorIdentity(commanderCards),
    cardCount,
    sourceUrl: `${DECK_FILE_BASE_URL}/${record.fileName}.json`,
    decklist: buildDecklist(deck)
  };
}

async function main() {
  const deckList = await fetchJson(DECK_LIST_URL);
  const records = (deckList.data ?? [])
    .filter(isIncludedDeck)
    .sort((left, right) => {
      const byRelease = right.releaseDate.localeCompare(left.releaseDate);
      return byRelease !== 0 ? byRelease : left.name.localeCompare(right.name);
    });

  const decks = await mapWithConcurrency(records, DEFAULT_CONCURRENCY, async (record) => {
    const payload = await fetchJson(`${DECK_FILE_BASE_URL}/${record.fileName}.json`);
    return toPreconDeck(record, payload.data);
  });

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceUrl: DECK_LIST_URL,
      totalDecks: decks.length
    },
    data: decks
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${decks.length} commander precons to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
