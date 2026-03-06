import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("data/spellbook");
const RAW_PATH = path.join(OUT_DIR, "variants.raw.json");
const META_PATH = path.join(OUT_DIR, "variants.meta.json");
const START_URL = "https://backend.commanderspellbook.com/variants?groupByCombo=true&limit=100";
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 3;

async function fetchJsonWithRetry(url, retries = MAX_RETRIES) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "CommanderDeckDoctor/1.0"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, DEFAULT_RETRY_DELAY_MS * attempt));
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allResults = [];
  const visited = new Set();
  let nextUrl = START_URL;
  let pages = 0;
  let remoteCount = null;

  while (nextUrl) {
    if (visited.has(nextUrl)) {
      throw new Error(`Pagination loop detected at ${nextUrl}`);
    }
    visited.add(nextUrl);

    pages += 1;
    const payload = await fetchJsonWithRetry(nextUrl);
    const results = Array.isArray(payload?.results) ? payload.results : null;
    if (!results) {
      throw new Error(`Unexpected response shape at page ${pages}`);
    }

    if (typeof payload.count === "number") {
      remoteCount = payload.count;
    }

    allResults.push(...results);
    nextUrl = typeof payload.next === "string" && payload.next.trim() ? payload.next : null;
  }

  fs.writeFileSync(RAW_PATH, JSON.stringify(allResults), "utf8");
  fs.writeFileSync(
    META_PATH,
    JSON.stringify(
      {
        downloaded_at: new Date().toISOString(),
        source: START_URL,
        page_count: pages,
        fetched_variants: allResults.length,
        reported_count: remoteCount
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Downloaded ${allResults.length} Spellbook variants to: ${RAW_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

