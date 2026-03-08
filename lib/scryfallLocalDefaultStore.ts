import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { ScryfallCard } from "./types";

const DEFAULT_COMPILED_FILE = "data/scryfall/default-cards.compiled.json.gz";

let cardsByNormalizedName: Map<string, ScryfallCard> | null = null;

function normalizeLookupName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildNameKey(name: string): string {
  return `name:${normalizeLookupName(name)}`;
}

function normalizeLocalCard(card: ScryfallCard): ScryfallCard {
  return {
    ...card,
    colors: Array.isArray(card.colors) ? card.colors : [],
    color_identity: Array.isArray(card.color_identity) ? card.color_identity : [],
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    image_uris: card.image_uris ?? null,
    card_faces: Array.isArray(card.card_faces) ? card.card_faces : [],
    prices: card.prices ?? null,
    purchase_uris: card.purchase_uris ?? null
  };
}

function loadCardsByName(): Map<string, ScryfallCard> {
  if (cardsByNormalizedName) {
    return cardsByNormalizedName;
  }

  const compiledPath = path.resolve(DEFAULT_COMPILED_FILE);
  if (!fs.existsSync(compiledPath)) {
    cardsByNormalizedName = new Map();
    return cardsByNormalizedName;
  }

  const compressed = fs.readFileSync(compiledPath);
  const raw = zlib.gunzipSync(compressed).toString("utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid default-cards compiled file at ${compiledPath}: expected array.`);
  }

  const next = new Map<string, ScryfallCard>();
  for (const row of parsed) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const card = row as ScryfallCard;
    if (typeof card.name !== "string" || !card.name.trim()) {
      continue;
    }

    const key = buildNameKey(card.name);
    if (!key || next.has(key)) {
      continue;
    }

    next.set(key, normalizeLocalCard(card));
  }

  cardsByNormalizedName = next;
  return next;
}

export function getLocalDefaultCardByName(name: string): ScryfallCard | null {
  const key = buildNameKey(name);
  if (!key) {
    return null;
  }

  return loadCardsByName().get(key) ?? null;
}

export function getLocalDefaultCardsByNames(names: string[]): Map<string, ScryfallCard> {
  const loaded = loadCardsByName();
  const rows = new Map<string, ScryfallCard>();

  for (const rawName of names) {
    const key = buildNameKey(rawName);
    if (!key || rows.has(key)) {
      continue;
    }

    const card = loaded.get(key);
    if (card) {
      rows.set(key, card);
    }
  }

  return rows;
}
