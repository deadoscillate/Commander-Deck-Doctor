import fs from "node:fs/promises";
import path from "node:path";

const BULK_DATA_URL = "https://api.scryfall.com/bulk-data";
const OUTPUT_DIR = path.resolve("data/scryfall");
const RAW_PATH = path.join(OUTPUT_DIR, "oracle-cards.raw.json");
const META_PATH = path.join(OUTPUT_DIR, "oracle-cards.meta.json");

function fail(message) {
  throw new Error(message);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    fail(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const bulk = await fetchJson(BULK_DATA_URL);
  if (!bulk || !Array.isArray(bulk.data)) {
    fail("Unexpected bulk-data response: expected object with data[]");
  }

  const oracle = bulk.data.find((entry) => entry && entry.type === "oracle_cards");
  if (!oracle || typeof oracle.download_uri !== "string" || oracle.download_uri.length === 0) {
    fail("Could not find oracle_cards download_uri in Scryfall bulk-data response");
  }

  const downloadResponse = await fetch(oracle.download_uri);
  if (!downloadResponse.ok) {
    fail(`Oracle cards download failed (${downloadResponse.status}) for ${oracle.download_uri}`);
  }

  const text = await downloadResponse.text();
  JSON.parse(text);
  await fs.writeFile(RAW_PATH, text, "utf8");

  const metadata = {
    downloaded_at: new Date().toISOString(),
    updated_at: oracle.updated_at ?? null,
    download_uri: oracle.download_uri,
    compressed_size: oracle.compressed_size ?? null,
    content_type: oracle.content_type ?? null,
    content_encoding: oracle.content_encoding ?? null
  };

  await fs.writeFile(META_PATH, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  console.log(`Downloaded Oracle Cards to: ${RAW_PATH}`);
  console.log(`Wrote metadata to: ${META_PATH}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`scryfall:download failed: ${message}`);
  process.exit(1);
});
