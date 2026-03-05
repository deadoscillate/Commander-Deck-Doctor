import fs from "node:fs/promises";
import path from "node:path";

const COMPILED_PATH = path.resolve("data/scryfall/oracle-cards.compiled.json");
const REQUIRED_FIELDS = ["oracle_id", "name", "type_line"];

function fail(message) {
  throw new Error(message);
}

async function main() {
  try {
    await fs.access(COMPILED_PATH);
  } catch {
    fail(`Missing compiled Scryfall file: ${COMPILED_PATH}. Run: npm run scryfall:update`);
  }

  const raw = await fs.readFile(COMPILED_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    fail("Compiled Scryfall file is invalid: expected top-level array.");
  }

  if (parsed.length < 10000) {
    fail(`Compiled Scryfall file looks incomplete (${parsed.length} records). Re-run: npm run scryfall:update`);
  }

  const sample = parsed[0];
  if (!sample || typeof sample !== "object") {
    fail("Compiled Scryfall file is invalid: first record missing.");
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in sample)) {
      fail(`Compiled Scryfall file is invalid: missing required field "${field}" in card records.`);
    }
  }

  console.log(`Verified compiled Scryfall file: ${COMPILED_PATH} (${parsed.length} cards)`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`scryfall:verify failed: ${message}`);
  process.exit(1);
});
