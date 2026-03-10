import { describe, expect, it } from "vitest";
import {
  buildColorStapleSuggestionNames,
  buildBuilderDecklist,
  buildManaBaseSuggestionNames,
  computePreconSimilarity,
  extractNeeds,
  totalDeckCardCount
} from "@/lib/builder";

describe("builder utilities", () => {
  it("builds a commander-first decklist with paired commanders", () => {
    const decklist = buildBuilderDecklist(
      {
        primary: "Tymna the Weaver",
        secondary: "Thrasios, Triton Hero"
      },
      [
        { name: "Sol Ring", qty: 1 },
        { name: "Arcane Signet", qty: 1 }
      ]
    );

    expect(decklist).toContain("Commander");
    expect(decklist).toContain("1 Tymna the Weaver");
    expect(decklist).toContain("1 Thrasios, Triton Hero");
    expect(decklist).toContain("\n\nDeck\n1 Sol Ring\n1 Arcane Signet");
  });

  it("extracts low-count needs sorted by the largest deficit", () => {
    const needs = extractNeeds([
      {
        key: "lands",
        label: "Lands",
        value: 33,
        status: "LOW",
        recommendedMin: 36,
        recommendedMax: 38,
        recommendedText: "36-38",
        diagnostic: "short"
      },
      {
        key: "ramp",
        label: "Ramp",
        value: 4,
        status: "LOW",
        recommendedMin: 10,
        recommendedMax: 12,
        recommendedText: "10-12",
        diagnostic: "short"
      },
      {
        key: "draw",
        label: "Draw",
        value: 10,
        status: "OK",
        recommendedMin: 8,
        recommendedMax: 12,
        recommendedText: "8-12",
        diagnostic: "fine"
      }
    ]);

    expect(needs).toEqual([
      {
        key: "ramp",
        label: "Ramp",
        deficit: 6,
        current: 4,
        recommendedMin: 10
      },
      {
        key: "lands",
        label: "Lands",
        deficit: 3,
        current: 33,
        recommendedMin: 36
      }
    ]);
  });

  it("computes stock precon overlap against the current deck", () => {
    const summary = computePreconSimilarity(
      [
        { name: "Sol Ring", qty: 1 },
        { name: "Arcane Signet", qty: 1 },
        { name: "Counterspell", qty: 1 }
      ],
      {
        slug: "test-precon",
        name: "Test Precon",
        releaseDate: "2026-01-01",
        decklist: "Commander\n1 Edric, Spymaster of Trest\n\nDeck\n1 Sol Ring\n1 Island\n1 Arcane Signet"
      }
    );

    expect(summary).toEqual({
      slug: "test-precon",
      name: "Test Precon",
      releaseDate: "2026-01-01",
      overlapCount: 2,
      overlapPct: 50
    });
  });

  it("counts total main-deck cards", () => {
    expect(
      totalDeckCardCount([
        { name: "Island", qty: 10 },
        { name: "Forest", qty: 12 },
        { name: "Sol Ring", qty: 1 }
      ])
    ).toBe(23);
  });

  it("returns colorless staple suggestions for empty commander color identity", () => {
    expect(buildColorStapleSuggestionNames([])).toEqual([
      "Forsaken Monument",
      "All Is Dust",
      "Ugin, the Ineffable",
      "Introduction to Annihilation"
    ]);
  });

  it("returns colorless mana base suggestions for empty commander color identity", () => {
    expect(buildManaBaseSuggestionNames([])).toEqual([
      "Command Tower",
      "Exotic Orchard",
      "Path of Ancestry",
      "Reflecting Pool",
      "Fabled Passage",
      "Terramorphic Expanse",
      "Evolving Wilds",
      "Wastes",
      "War Room",
      "Myriad Landscape",
      "Reliquary Tower",
      "Rogue's Passage"
    ]);
  });
});
