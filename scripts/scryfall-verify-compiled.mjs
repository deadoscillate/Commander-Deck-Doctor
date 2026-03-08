import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const DATASETS = [
  {
    compiledPath: path.resolve("data/scryfall/oracle-cards.compiled.json"),
    requiredFields: ["oracle_id", "name", "type_line"],
    minRecords: 10000,
    label: "oracle-cards"
  },
  {
    compiledPath: path.resolve("data/scryfall/default-cards.compiled.json.gz"),
    requiredFields: ["oracle_id", "id", "name", "set", "type_line"],
    minRecords: 10000,
    label: "default-cards"
  },
  {
    manifestPath: path.resolve("data/scryfall/print-index/manifest.compiled.json.gz"),
    shardDir: path.resolve("data/scryfall/print-index/shards"),
    requiredFields: ["oracle_id", "id", "name", "set", "collector_number"],
    minRecords: 10000,
    label: "print-index",
    payloadType: "sharded"
  }
];

function fail(message) {
  throw new Error(message);
}

async function verifyDataset(dataset) {
  if (dataset.payloadType === "sharded") {
    return verifyShardedDataset(dataset);
  }

  try {
    await fs.access(dataset.compiledPath);
  } catch {
    fail(`Missing compiled Scryfall file: ${dataset.compiledPath}. Run: npm run scryfall:update`);
  }

  const payload = await fs.readFile(dataset.compiledPath);
  const raw = dataset.compiledPath.endsWith(".gz")
    ? zlib.gunzipSync(payload).toString("utf8")
    : payload.toString("utf8");
  const parsed = JSON.parse(raw);
  const records =
    dataset.payloadType === "object"
      ? parsed?.[dataset.recordPath]
      : parsed;

  if (!Array.isArray(records)) {
    fail(`Compiled ${dataset.label} file is invalid: expected card records array.`);
  }

  if (records.length < dataset.minRecords) {
    fail(
      `Compiled ${dataset.label} file looks incomplete (${records.length} records). Re-run: npm run scryfall:update`
    );
  }

  const sample = records[0];
  if (!sample || typeof sample !== "object") {
    fail(`Compiled ${dataset.label} file is invalid: first record missing.`);
  }

  for (const field of dataset.requiredFields) {
    if (!(field in sample)) {
      fail(`Compiled ${dataset.label} file is invalid: missing required field "${field}" in card records.`);
    }
  }

  console.log(`Verified compiled Scryfall file: ${dataset.compiledPath} (${records.length} cards)`);
}

async function verifyShardedDataset(dataset) {
  try {
    await fs.access(dataset.manifestPath);
    await fs.access(dataset.shardDir);
  } catch {
    fail(`Missing compiled ${dataset.label} files. Run: npm run scryfall:update`);
  }

  const manifestRaw = zlib.gunzipSync(await fs.readFile(dataset.manifestPath)).toString("utf8");
  const manifest = JSON.parse(manifestRaw);
  if (!manifest || typeof manifest !== "object" || !manifest.byId || typeof manifest.byId !== "object") {
    fail(`Compiled ${dataset.label} manifest is invalid.`);
  }

  const shardFiles = (await fs.readdir(dataset.shardDir)).filter((file) => file.endsWith(".json.gz"));
  if (shardFiles.length === 0) {
    fail(`Compiled ${dataset.label} shard directory is empty.`);
  }

  let totalRecords = 0;
  let sample = null;
  for (const shardFile of shardFiles) {
    const shardRaw = zlib
      .gunzipSync(await fs.readFile(path.join(dataset.shardDir, shardFile)))
      .toString("utf8");
    const shard = JSON.parse(shardRaw);
    if (!shard || typeof shard !== "object" || !Array.isArray(shard.records)) {
      fail(`Compiled ${dataset.label} shard ${shardFile} is invalid.`);
    }

    totalRecords += shard.records.length;
    if (!sample && shard.records.length > 0) {
      sample = shard.records[0];
    }
  }

  if (totalRecords < dataset.minRecords) {
    fail(
      `Compiled ${dataset.label} files look incomplete (${totalRecords} records). Re-run: npm run scryfall:update`
    );
  }

  if (!sample || typeof sample !== "object") {
    fail(`Compiled ${dataset.label} files are invalid: no sample record found.`);
  }

  for (const field of dataset.requiredFields) {
    if (!(field in sample)) {
      fail(`Compiled ${dataset.label} files are invalid: missing required field "${field}" in card records.`);
    }
  }

  console.log(
    `Verified compiled Scryfall files: ${dataset.shardDir} (${totalRecords} cards across ${shardFiles.length} shards)`
  );
}

async function main() {
  for (const dataset of DATASETS) {
    await verifyDataset(dataset);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`scryfall:verify failed: ${message}`);
  process.exit(1);
});
