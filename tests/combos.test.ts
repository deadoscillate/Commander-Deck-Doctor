import { describe, expect, it } from "vitest";
import { detectCombosInDeck } from "@/lib/combos";

describe("combo detection", () => {
  it("includes a Commander Spellbook URL for detected combos", () => {
    const report = detectCombosInDeck(["Thassa's Oracle", "Demonic Consultation"]);
    const combo = report.detected[0];

    expect(combo).toBeDefined();
    const url = new URL(combo?.commanderSpellbookUrl ?? "");
    expect(url.origin).toBe("https://commanderspellbook.com");
    expect(url.pathname === "/search/" || url.pathname.startsWith("/combo/")).toBe(true);
  });
});
