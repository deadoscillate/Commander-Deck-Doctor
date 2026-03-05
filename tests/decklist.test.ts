import { describe, expect, it } from "vitest";
import { parseDecklist, parseDecklistWithCommander } from "@/lib/decklist";

describe("decklist parser", () => {
  it("captures inline commander and merges duplicate card names case-insensitively", () => {
    const parsed = parseDecklistWithCommander(`
Commander: Atraxa, Praetors' Voice
1 Sol Ring
1 sol ring
    `);

    expect(parsed.commanderFromSection).toBe("Atraxa, Praetors' Voice");
    expect(parsed.entries).toEqual(
      expect.arrayContaining([
        { name: "Atraxa, Praetors' Voice", qty: 1 },
        { name: "Sol Ring", qty: 2 }
      ])
    );
  });

  it("captures commander section headings and keeps deck rows", () => {
    const parsed = parseDecklistWithCommander(`
Commander
1 Muldrotha, the Gravetide

1 Sol Ring
1 Arcane Signet
    `);

    expect(parsed.commanderFromSection).toBe("Muldrotha, the Gravetide");
    expect(parsed.entries).toEqual(
      expect.arrayContaining([
        { name: "Muldrotha, the Gravetide", qty: 1 },
        { name: "Sol Ring", qty: 1 },
        { name: "Arcane Signet", qty: 1 }
      ])
    );
  });

  it("does not strip split cards when parsing comment markers", () => {
    const entries = parseDecklist(`
1 Fire // Ice
1 Cyclonic Rift # note
    `);

    expect(entries).toEqual(
      expect.arrayContaining([
        { name: "Fire // Ice", qty: 1 },
        { name: "Cyclonic Rift", qty: 1 }
      ])
    );
  });
});

