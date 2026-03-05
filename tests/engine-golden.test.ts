import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadFixture, runScenario } from "@/engine/tests/harness";

const GOLDEN_DIR = path.resolve("engine/tests/golden");
const FIXTURE_DIR = path.resolve("engine/tests/fixtures");

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

async function assertGolden(fixtureFile: string, goldenFile: string) {
  const fixture = await loadFixture(path.join(FIXTURE_DIR, fixtureFile));
  const result = runScenario(fixture);
  const actual = normalizeLineEndings(JSON.stringify(result.log, null, 2));

  const goldenPath = path.join(GOLDEN_DIR, goldenFile);
  const shouldUpdate = process.env.UPDATE_ENGINE_GOLDEN === "1";

  if (shouldUpdate || !fs.existsSync(goldenPath)) {
    fs.writeFileSync(goldenPath, `${actual}\n`, "utf8");
  }

  const expected = normalizeLineEndings(fs.readFileSync(goldenPath, "utf8")).trimEnd();
  expect(actual).toBe(expected);
}

describe("engine golden logs", () => {
  it("matches cast-shock-basic log", async () => {
    await assertGolden("cast-shock-basic.json", "cast-shock-basic.log.json");
  });

  it("matches etb-draw-trigger log", async () => {
    await assertGolden("etb-draw-trigger.json", "etb-draw-trigger.log.json");
  });
});
