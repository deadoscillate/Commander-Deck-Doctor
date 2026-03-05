import { describe, expect, it } from "vitest";
import { CardDatabase } from "@/engine";

describe("CardDatabase compiled loader", () => {
  it("throws a clear message when compiled data is missing", () => {
    expect(() => CardDatabase.loadFromCompiledFile("data/scryfall/does-not-exist.compiled.json")).toThrow(
      /Run: npm run scryfall:update/
    );
  });
});
