import fs from "node:fs/promises";
import path from "node:path";

const BULK_DATA_URL = "https://api.scryfall.com/bulk-data";
const OUTPUT_DIR = path.resolve("data/scryfall");
const BULK_DOWNLOADS = [
  {
    type: "oracle_cards",
    rawPath: path.join(OUTPUT_DIR, "oracle-cards.raw.json"),
    metaPath: path.join(OUTPUT_DIR, "oracle-cards.meta.json")
  },
  {
    type: "default_cards",
    rawPath: path.join(OUTPUT_DIR, "default-cards.raw.json"),
    metaPath: path.join(OUTPUT_DIR, "default-cards.meta.json")
  }
];

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

  for (const target of BULK_DOWNLOADS) {
    const entry = bulk.data.find((row) => row && row.type === target.type);
    if (!entry || typeof entry.download_uri !== "string" || entry.download_uri.length === 0) {
      fail(`Could not find ${target.type} download_uri in Scryfall bulk-data response`);
    }

    const downloadResponse = await fetch(entry.download_uri);
    if (!downloadResponse.ok) {
      fail(`${target.type} download failed (${downloadResponse.status}) for ${entry.download_uri}`);
    }

    const text = await downloadResponse.text();
    JSON.parse(text);
    await fs.writeFile(target.rawPath, text, "utf8");

    const metadata = {
      downloaded_at: new Date().toISOString(),
      updated_at: entry.updated_at ?? null,
      download_uri: entry.download_uri,
      compressed_size: entry.compressed_size ?? null,
      content_type: entry.content_type ?? null,
      content_encoding: entry.content_encoding ?? null
    };

    await fs.writeFile(target.metaPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    console.log(`Downloaded ${target.type} to: ${target.rawPath}`);
    console.log(`Wrote metadata to: ${target.metaPath}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`scryfall:download failed: ${message}`);
  process.exit(1);
});
