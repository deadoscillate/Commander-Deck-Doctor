import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve("data/scryfall");
const RAW_PATH = path.join(OUTPUT_DIR, "oracle-cards.raw.json");
const COMPILED_PATH = path.join(OUTPUT_DIR, "oracle-cards.compiled.json");

function fail(message) {
  throw new Error(message);
}

function pickFace(face) {
  if (!face || typeof face !== "object") {
    return null;
  }

  return {
    name: typeof face.name === "string" ? face.name : undefined,
    mana_cost: typeof face.mana_cost === "string" ? face.mana_cost : undefined,
    type_line: typeof face.type_line === "string" ? face.type_line : undefined,
    oracle_text: typeof face.oracle_text === "string" ? face.oracle_text : undefined,
    power: typeof face.power === "string" ? face.power : undefined,
    toughness: typeof face.toughness === "string" ? face.toughness : undefined,
    loyalty: typeof face.loyalty === "string" ? face.loyalty : undefined,
    colors: Array.isArray(face.colors) ? face.colors.filter((value) => typeof value === "string") : undefined
  };
}

function toCompiledCard(card) {
  if (!card || typeof card !== "object") {
    return null;
  }

  const oracleId = typeof card.oracle_id === "string" ? card.oracle_id : "";
  const name = typeof card.name === "string" ? card.name : "";
  if (!oracleId || !name) {
    return null;
  }

  const manaValue =
    typeof card.mana_value === "number" && Number.isFinite(card.mana_value)
      ? card.mana_value
      : typeof card.cmc === "number" && Number.isFinite(card.cmc)
        ? card.cmc
        : undefined;

  const cardFaces = Array.isArray(card.card_faces)
    ? card.card_faces
        .map((face) => pickFace(face))
        .filter((face) => Boolean(face))
    : null;

  return {
    oracle_id: oracleId,
    name,
    mana_cost: typeof card.mana_cost === "string" ? card.mana_cost : undefined,
    mana_value: manaValue,
    type_line: typeof card.type_line === "string" ? card.type_line : undefined,
    colors: Array.isArray(card.colors) ? card.colors.filter((value) => typeof value === "string") : undefined,
    color_identity: Array.isArray(card.color_identity)
      ? card.color_identity.filter((value) => typeof value === "string")
      : undefined,
    oracle_text: typeof card.oracle_text === "string" ? card.oracle_text : undefined,
    keywords: Array.isArray(card.keywords)
      ? card.keywords.filter((value) => typeof value === "string")
      : undefined,
    legalities:
      card.legalities && typeof card.legalities === "object"
        ? Object.fromEntries(
            Object.entries(card.legalities).filter(
              ([format, status]) => typeof format === "string" && typeof status === "string"
            )
          )
        : undefined,
    power: typeof card.power === "string" ? card.power : undefined,
    toughness: typeof card.toughness === "string" ? card.toughness : undefined,
    loyalty: typeof card.loyalty === "string" ? card.loyalty : undefined,
    layout: typeof card.layout === "string" ? card.layout : undefined,
    card_faces: cardFaces
  };
}

async function main() {
  try {
    await fs.access(RAW_PATH);
  } catch {
    fail(`Missing raw Oracle file: ${RAW_PATH}. Run: npm run scryfall:download`);
  }

  const rawText = await fs.readFile(RAW_PATH, "utf8");
  const raw = JSON.parse(rawText);
  if (!Array.isArray(raw)) {
    fail("Unexpected oracle-cards format: expected top-level array");
  }

  const compiled = raw
    .map((card) => toCompiledCard(card))
    .filter((card) => Boolean(card));

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(COMPILED_PATH, JSON.stringify(compiled), "utf8");

  console.log(`Compiled ${compiled.length} cards to: ${COMPILED_PATH}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`scryfall:compile failed: ${message}`);
  process.exit(1);
});
