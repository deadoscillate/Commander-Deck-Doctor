import fs from "node:fs/promises";
import path from "node:path";

const DECK_LIST_URL = "https://mtgjson.com/api/v5/DeckList.json";
const DECK_FILE_BASE_URL = "https://mtgjson.com/api/v5/decks";
const OUTPUT_PATH = path.join(process.cwd(), "data", "precons", "commander-precons.json");
const INCLUDED_TYPES = new Set(["Commander Deck", "MTGO Commander Deck"]);
const DEFAULT_CONCURRENCY = 8;

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

    const key = card.name.trim().toLowerCase();
    const current = rows.get(key);
    if (current) {
      current.count += Number(card.count) || 1;
      rows.set(key, current);
      continue;
    }

    rows.set(key, {
      name: card.name.trim(),
      count: Number(card.count) || 1
    });
  }

  return [...rows.values()];
}

function buildDecklist(deck) {
  const commanderCards = dedupeCards(deck.commander);
  const commanderKeys = new Set(commanderCards.map((card) => card.name.toLowerCase()));
  const mainBoard = dedupeCards(deck.mainBoard).filter((card) => !commanderKeys.has(card.name.toLowerCase()));

  const commanderLines = commanderCards.map((card) => `${card.count} ${card.name}`);
  const mainBoardLines = mainBoard.map((card) => `${card.count} ${card.name}`);

  return ["Commander", ...commanderLines, "", ...mainBoardLines].join("\n").trim();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CommanderDeckDoctor/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
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
