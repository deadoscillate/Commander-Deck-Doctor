import { describe, expect, it } from "vitest";
import { parseDecklistWithCommander } from "@/lib/decklist";

describe("decklist parser", () => {
  it("parses Companion sections outside the 100-card deck", () => {
    const parsed = parseDecklistWithCommander(
      [
        "Commander",
        "1 Tymna the Weaver",
        "",
        "Companion",
        "1 Lurrus of the Dream-Den (IKO) 226",
        "",
        "Deck",
        "99 Plains"
      ].join("\n")
    );

    expect(parsed.commandersFromSection).toEqual(["Tymna the Weaver"]);
    expect(parsed.companionFromSection).toBe("Lurrus of the Dream-Den");
    expect(parsed.companionsFromSection).toEqual([
      {
        name: "Lurrus of the Dream-Den",
        qty: 1,
        setCode: "iko",
        collectorNumber: "226"
      }
    ]);
    expect(parsed.entries).toEqual([
      { name: "Tymna the Weaver", qty: 1 },
      { name: "Plains", qty: 99 }
    ]);
  });

  it("parses inline Companion declarations outside the 100-card deck", () => {
    const parsed = parseDecklistWithCommander(
      [
        "Commander: Tymna the Weaver",
        "Companion: Lurrus of the Dream-Den",
        "98 Plains",
        "1 Soul Warden"
      ].join("\n")
    );

    expect(parsed.commanderFromSection).toBe("Tymna the Weaver");
    expect(parsed.companionFromSection).toBe("Lurrus of the Dream-Den");
    expect(parsed.entries).toEqual([
      { name: "Tymna the Weaver", qty: 1 },
      { name: "Plains", qty: 98 },
      { name: "Soul Warden", qty: 1 }
    ]);
  });
});
