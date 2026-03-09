import { describe, expect, it } from "vitest";
import { detectCombosInDeck } from "@/lib/combos";

describe("combo detection", () => {
  it("detects staple exact combos players expect to see", () => {
    const cases = [
      {
        deck: ["Thassa's Oracle", "Demonic Consultation"],
        expected: "Demonic Consultation + Thassa's Oracle"
      },
      {
        deck: ["Heliod, Sun-Crowned", "Walking Ballista"],
        expected: "Walking Ballista + Heliod, Sun-Crowned"
      },
      {
        deck: ["Dramatic Reversal", "Isochron Scepter"],
        expected: "Dramatic Reversal + Isochron Scepter"
      },
      {
        deck: ["Underworld Breach", "Brain Freeze", "Lion's Eye Diamond"],
        expected: "Underworld Breach + Lion's Eye Diamond + Brain Freeze"
      },
      {
        deck: ["Food Chain", "Squee, the Immortal"],
        expected: "Squee, the Immortal + Food Chain"
      },
      {
        deck: ["Kiki-Jiki, Mirror Breaker", "Zealous Conscripts"],
        expected: "Kiki-Jiki, Mirror Breaker + Zealous Conscripts"
      },
      {
        deck: ["Niv-Mizzet, Parun", "Curiosity"],
        expected: "Niv-Mizzet, Parun + Curiosity"
      }
    ];

    for (const testCase of cases) {
      const report = detectCombosInDeck(testCase.deck);
      expect(report.detected.some((combo) => combo.comboName === testCase.expected)).toBe(true);
    }
  });

  it("includes a Commander Spellbook URL for detected combos", () => {
    const report = detectCombosInDeck(["Thassa's Oracle", "Demonic Consultation"]);
    const combo = report.detected[0];

    expect(combo).toBeDefined();
    const url = new URL(combo?.commanderSpellbookUrl ?? "");
    expect(url.origin).toBe("https://commanderspellbook.com");
    expect(url.pathname === "/search/" || url.pathname.startsWith("/combo/")).toBe(true);
    expect(Array.isArray(report.conditional)).toBe(true);
    expect(Array.isArray(report.potential)).toBe(true);
  });

  it("does not claim non-deterministic two-card shells as exact combos when Spellbook requires more pieces", () => {
    const report = detectCombosInDeck(["Dockside Extortionist", "Temur Sabertooth"]);

    expect(
      report.detected.some((combo) => combo.cards.length === 2 && combo.comboName.includes("Dockside Extortionist"))
    ).toBe(false);
  });

  it("prioritizes staple exact combos ahead of adjacent lines when multiple combos are live", () => {
    const report = detectCombosInDeck([
      "Thassa's Oracle",
      "Demonic Consultation",
      "Doomsday",
      "Jace, Wielder of Mysteries"
    ]);

    expect(report.detected[0]?.comboName).toBe("Demonic Consultation + Thassa's Oracle");
    expect(report.detected[1]?.comboName).toBe("Demonic Consultation + Jace, Wielder of Mysteries");
  });
});
