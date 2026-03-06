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

  it("parses optional set tags and keeps normalized lowercase set codes", () => {
    const entries = parseDecklist(`
1 Sol Ring [CMM]
1 Rhystic Study [JMP]
    `);

    expect(entries).toEqual(
      expect.arrayContaining([
        { name: "Sol Ring", qty: 1, setCode: "cmm" },
        { name: "Rhystic Study", qty: 1, setCode: "jmp" }
      ])
    );
  });

  it("parses parenthetical print metadata and ignores standalone foil markers", () => {
    const entries = parseDecklist(`
1 Evolving Wilds (PLST) C18-245
1 Forest (ONE) 369 *F*
Negate (BBD) 123
Otawara, Soaring City (NEO) 271
*F*
    `);

    expect(entries).toEqual(
      expect.arrayContaining([
        { name: "Evolving Wilds", qty: 1, setCode: "plst", collectorNumber: "C18-245" },
        { name: "Forest", qty: 1, setCode: "one", collectorNumber: "369" },
        { name: "Negate", qty: 1, setCode: "bbd", collectorNumber: "123" },
        { name: "Otawara, Soaring City", qty: 1, setCode: "neo", collectorNumber: "271" }
      ])
    );
    expect(entries.find((entry) => entry.name === "*F*")).toBeUndefined();
  });

  it("drops ambiguous collector numbers when duplicate names share set but conflict", () => {
    const entries = parseDecklist(`
1 Sol Ring (CMM) 217
1 Sol Ring (CMM) 218
    `);

    expect(entries).toEqual(expect.arrayContaining([{ name: "Sol Ring", qty: 2, setCode: "cmm" }]));
    expect(entries.find((entry) => entry.name === "Sol Ring")?.collectorNumber).toBeUndefined();
  });

  it("preserves alphanumeric collector casing for Spellbook-style collector numbers", () => {
    const entries = parseDecklist(`
1 Winding Constrictor (PLST) AER-140
    `);

    expect(entries).toEqual(
      expect.arrayContaining([
        { name: "Winding Constrictor", qty: 1, setCode: "plst", collectorNumber: "AER-140" }
      ])
    );
  });

  it("parses collector suffixes with star glyphs and hash prefixes", () => {
    const entries = parseDecklist(`
1 Chaos Theory (SLD) 741★
1 Shock (7ED) 219★
1 Sol Ring (SLD) #1494★
    `);

    expect(entries).toEqual(
      expect.arrayContaining([
        { name: "Chaos Theory", qty: 1, setCode: "sld", collectorNumber: "741" },
        { name: "Shock", qty: 1, setCode: "7ed", collectorNumber: "219" },
        { name: "Sol Ring", qty: 1, setCode: "sld", collectorNumber: "1494" }
      ])
    );
  });

  it("drops ambiguous set tags when duplicate names use conflicting sets", () => {
    const entries = parseDecklist(`
1 Sol Ring [CMM]
1 Sol Ring [2X2]
    `);

    expect(entries).toEqual(expect.arrayContaining([{ name: "Sol Ring", qty: 2 }]));
    expect(entries.find((entry) => entry.name === "Sol Ring")?.setCode).toBeUndefined();
  });
});

