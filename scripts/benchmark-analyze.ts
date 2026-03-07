import fs from "node:fs/promises";
import { POST } from "../app/api/analyze/route";

type BenchmarkOptions = {
  filePath: string;
  deckPriceMode: "oracle-default" | "decklist-set";
  repeatHits: number;
};

type AnalyzeRunResult = {
  status: number;
  wallMs: number;
  cache: string;
  totalMs: string;
  parseMs: string;
  lookupMs: string;
  computeMs: string;
  serializeMs: string;
  responseBytesHeader: string;
  responseBytesBody: number;
};

function parseArgs(argv: string[]): BenchmarkOptions {
  let filePath = "";
  let deckPriceMode: "oracle-default" | "decklist-set" = "decklist-set";
  let repeatHits = 1;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if ((current === "--file" || current === "-f") && argv[index + 1]) {
      filePath = argv[index + 1];
      index += 1;
      continue;
    }

    if ((current === "--mode" || current === "-m") && argv[index + 1]) {
      const mode = argv[index + 1];
      deckPriceMode = mode === "oracle-default" ? "oracle-default" : "decklist-set";
      index += 1;
      continue;
    }

    if ((current === "--repeat-hits" || current === "-r") && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed >= 1) {
        repeatHits = Math.floor(parsed);
      }
      index += 1;
      continue;
    }
  }

  if (!filePath) {
    throw new Error("Missing --file <decklist path>.");
  }

  return {
    filePath,
    deckPriceMode,
    repeatHits
  };
}

async function runAnalyze(decklist: string, deckPriceMode: "oracle-default" | "decklist-set"): Promise<AnalyzeRunResult> {
  const request = new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      decklist,
      deckPriceMode
    })
  });

  const startedAt = performance.now();
  const response = await POST(request);
  const wallMs = performance.now() - startedAt;
  const bodyText = await response.text();

  return {
    status: response.status,
    wallMs,
    cache: response.headers.get("x-analyze-cache") ?? "n/a",
    totalMs: response.headers.get("x-analyze-total-ms") ?? "n/a",
    parseMs: response.headers.get("x-analyze-parse-ms") ?? "n/a",
    lookupMs: response.headers.get("x-analyze-lookup-ms") ?? "n/a",
    computeMs: response.headers.get("x-analyze-compute-ms") ?? "n/a",
    serializeMs: response.headers.get("x-analyze-serialize-ms") ?? "n/a",
    responseBytesHeader: response.headers.get("x-analyze-response-bytes") ?? "n/a",
    responseBytesBody: Buffer.byteLength(bodyText, "utf8")
  };
}

function printRun(label: string, run: AnalyzeRunResult): void {
  console.log(`${label}`);
  console.log(`  status=${run.status} cache=${run.cache} wall=${run.wallMs.toFixed(1)}ms`);
  console.log(
    `  headers: total=${run.totalMs}ms parse=${run.parseMs}ms lookup=${run.lookupMs}ms compute=${run.computeMs}ms serialize=${run.serializeMs}ms`
  );
  console.log(`  response-bytes: header=${run.responseBytesHeader} body=${run.responseBytesBody}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const decklist = await fs.readFile(options.filePath, "utf8");

  const lines = decklist.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  console.log("Analyze benchmark");
  console.log(`  file=${options.filePath}`);
  console.log(`  mode=${options.deckPriceMode}`);
  console.log(`  non-empty-lines=${lines}`);

  const missRun = await runAnalyze(decklist, options.deckPriceMode);
  printRun("Run 1 (expected miss)", missRun);

  for (let index = 0; index < options.repeatHits; index += 1) {
    const hitRun = await runAnalyze(decklist, options.deckPriceMode);
    printRun(`Run ${index + 2} (expected hit)`, hitRun);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`benchmark-analyze failed: ${message}`);
  process.exit(1);
});
