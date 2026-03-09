import { describe, expect, it } from "vitest";
import { buildRoleSuggestions, prewarmRoleSuggestionsIndex } from "@/lib/suggestions";

type MockCard = {
  oracleId: string;
  name: string;
  mv: number;
  typeLine: string;
  oracleText: string;
  keywords: string[];
  colorIdentity: string[];
  legalities: Record<string, string>;
  behaviorId?: string | null;
};

function createMockDb(cards: MockCard[]) {
  const byName = new Map(cards.map((card) => [card.name.toLowerCase(), card]));
  return {
    allCards: () => cards,
    getCardByName: (name: string) => byName.get(name.toLowerCase()) ?? null
  };
}

describe("buildRoleSuggestions", () => {
  it("returns ADD suggestions for LOW roles", () => {
    const result = buildRoleSuggestions({
      roleRows: [
        {
          key: "ramp",
          label: "Ramp",
          value: 4,
          recommendedText: "8-12",
          status: "LOW"
        }
      ],
      deckColorIdentity: ["G"],
      existingCardNames: ["Cultivate"],
      limit: 4
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.direction).toBe("ADD");
    expect(result[0]?.suggestions.length).toBeGreaterThan(0);
    expect(result[0]?.suggestions.map((name) => name.toLowerCase())).not.toContain("cultivate");
  });

  it("returns CUT suggestions for HIGH roles using role breakdown cards", () => {
    const mockDb = createMockDb([
      {
        oracleId: "1",
        name: "Sol Ring",
        mv: 1,
        typeLine: "Artifact",
        oracleText: "{T}: Add {C}{C}.",
        keywords: [],
        colorIdentity: [],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "2",
        name: "Cultivate",
        mv: 3,
        typeLine: "Sorcery",
        oracleText:
          "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",
        keywords: [],
        colorIdentity: ["G"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "3",
        name: "Gilded Lotus",
        mv: 5,
        typeLine: "Artifact",
        oracleText: "{T}: Add three mana of any one color.",
        keywords: [],
        colorIdentity: [],
        legalities: { commander: "legal" }
      }
    ]);

    const result = buildRoleSuggestions({
      roleRows: [
        {
          key: "ramp",
          label: "Ramp",
          value: 16,
          recommendedText: "8-12",
          status: "HIGH"
        }
      ],
      roleBreakdown: {
        ramp: [
          { name: "Sol Ring", qty: 1 },
          { name: "Cultivate", qty: 1 },
          { name: "Gilded Lotus", qty: 1 }
        ],
        draw: [],
        removal: [],
        wipes: [],
        tutors: [],
        protection: [],
        finishers: []
      },
      deckColorIdentity: ["G"],
      existingCardNames: ["Sol Ring", "Cultivate", "Gilded Lotus"],
      cardDatabase: mockDb,
      limit: 3
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.direction).toBe("CUT");
    expect(result[0]?.suggestions[0]).toBe("Gilded Lotus");
    expect(result[0]?.suggestions).toContain("Cultivate");
  });

  it("supports prewarming the indexed suggestion cache", () => {
    const mockDb = createMockDb([
      {
        oracleId: "1",
        name: "Rampant Growth",
        mv: 2,
        typeLine: "Sorcery",
        oracleText:
          "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.",
        keywords: [],
        colorIdentity: ["G"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "2",
        name: "Sign in Blood",
        mv: 2,
        typeLine: "Sorcery",
        oracleText: "Target player draws two cards and loses 2 life.",
        keywords: [],
        colorIdentity: ["B"],
        legalities: { commander: "legal" }
      }
    ]);

    prewarmRoleSuggestionsIndex(mockDb);

    const result = buildRoleSuggestions({
      roleRows: [
        {
          key: "ramp",
          label: "Ramp",
          value: 3,
          recommendedText: "8-12",
          status: "LOW"
        }
      ],
      deckColorIdentity: ["G"],
      existingCardNames: [],
      cardDatabase: mockDb,
      limit: 3
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.suggestions).toContain("Rampant Growth");
  });

  it("prefers cheaper ramp adds when the deck curve is top-heavy", () => {
    const mockDb = createMockDb([
      {
        oracleId: "1",
        name: "Rampant Growth",
        mv: 2,
        typeLine: "Sorcery",
        oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.",
        keywords: [],
        colorIdentity: ["G"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "2",
        name: "Explosive Vegetation",
        mv: 4,
        typeLine: "Sorcery",
        oracleText: "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.",
        keywords: [],
        colorIdentity: ["G"],
        legalities: { commander: "legal" }
      }
    ]);

    const result = buildRoleSuggestions({
      roleRows: [
        {
          key: "ramp",
          label: "Ramp",
          value: 4,
          recommendedText: "8-12",
          status: "LOW"
        }
      ],
      deckColorIdentity: ["G"],
      existingCardNames: [],
      archetypes: [],
      averageManaValue: 3.8,
      manaCurve: { "5": 9, "6": 6, "7+": 7 },
      cardDatabase: mockDb,
      limit: 4
    });

    expect(result[0]?.suggestions[0]).toBe("Rampant Growth");
    expect(result[0]?.rationale).toContain("Top-heavy curve");
  });

  it("avoids cutting on-plan token finishers before off-plan finishers", () => {
    const mockDb = createMockDb([
      {
        oracleId: "1",
        name: "Moonshaker Cavalry",
        mv: 8,
        typeLine: "Creature - Horse",
        oracleText: "Creatures you control gain flying and get +X/+X until end of turn, where X is the number of creatures you control.",
        keywords: [],
        colorIdentity: ["W"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "2",
        name: "Craterhoof Behemoth",
        mv: 8,
        typeLine: "Creature - Beast",
        oracleText: "Creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.",
        keywords: [],
        colorIdentity: ["G"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "3",
        name: "Aetherflux Reservoir",
        mv: 4,
        typeLine: "Artifact",
        oracleText: "Whenever you cast a spell, you gain 1 life for each spell you've cast this turn.",
        keywords: [],
        colorIdentity: [],
        legalities: { commander: "legal" }
      }
    ]);

    const result = buildRoleSuggestions({
      roleRows: [
        {
          key: "finishers",
          label: "Finishers",
          value: 8,
          recommendedText: "2-6",
          status: "HIGH"
        }
      ],
      roleBreakdown: {
        ramp: [],
        draw: [],
        removal: [],
        wipes: [],
        tutors: [],
        protection: [],
        finishers: [
          { name: "Moonshaker Cavalry", qty: 1 },
          { name: "Craterhoof Behemoth", qty: 1 },
          { name: "Aetherflux Reservoir", qty: 1 }
        ]
      },
      deckColorIdentity: ["G", "W"],
      existingCardNames: ["Moonshaker Cavalry", "Craterhoof Behemoth", "Aetherflux Reservoir"],
      archetypes: ["Tokens", "Go Wide"],
      averageManaValue: 3.2,
      manaCurve: { "4": 12, "5": 8, "6": 4, "7+": 3 },
      cardDatabase: mockDb,
      limit: 3
    });

    expect(result[0]?.direction).toBe("CUT");
    expect(result[0]?.suggestions[0]).toBe("Aetherflux Reservoir");
    expect(result[0]?.rationale).toContain("current archetypes");
  });

  it("prefers enchantress draw engines for Sythis over generic draw", () => {
    const mockDb = createMockDb([
      {
        oracleId: "1",
        name: "Sythis, Harvest's Hand",
        mv: 2,
        typeLine: "Legendary Enchantment Creature - Nymph",
        oracleText: "Whenever you cast an enchantment spell, you gain 1 life and draw a card.",
        keywords: [],
        colorIdentity: ["G", "W"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "2",
        name: "Enchantress's Presence",
        mv: 3,
        typeLine: "Enchantment",
        oracleText: "Whenever you cast an enchantment spell, draw a card.",
        keywords: [],
        colorIdentity: ["G"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "3",
        name: "Mesa Enchantress",
        mv: 3,
        typeLine: "Creature - Human Druid",
        oracleText: "Whenever you cast an enchantment spell, you may draw a card.",
        keywords: [],
        colorIdentity: ["W"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "4",
        name: "Rhystic Study",
        mv: 3,
        typeLine: "Enchantment",
        oracleText: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
        keywords: [],
        colorIdentity: ["U"],
        legalities: { commander: "legal" }
      }
    ]);

    const result = buildRoleSuggestions({
      roleRows: [
        {
          key: "draw",
          label: "Card Draw",
          value: 5,
          recommendedText: "8-12",
          status: "LOW"
        }
      ],
      deckColorIdentity: ["G", "W"],
      existingCardNames: [],
      commanderNames: ["Sythis, Harvest's Hand"],
      cardDatabase: mockDb,
      limit: 4
    });

    expect(result[0]?.direction).toBe("ADD");
    expect(result[0]?.suggestions[0]).toBe("Enchantress's Presence");
    expect(result[0]?.suggestions).toContain("Mesa Enchantress");
    expect(result[0]?.rationale).toContain("commander game plan");
  });

  it("prefers Edric-style combat finishers for Edric decks", () => {
    const mockDb = createMockDb([
      {
        oracleId: "1",
        name: "Edric, Spymaster of Trest",
        mv: 3,
        typeLine: "Legendary Creature - Elf Rogue",
        oracleText:
          "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card.",
        keywords: [],
        colorIdentity: ["G", "U"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "2",
        name: "Triumph of the Hordes",
        mv: 4,
        typeLine: "Sorcery",
        oracleText: "Until end of turn, creatures you control get +1/+1 and gain trample and infect.",
        keywords: [],
        colorIdentity: ["G"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "3",
        name: "Overwhelming Stampede",
        mv: 5,
        typeLine: "Sorcery",
        oracleText:
          "Until end of turn, creatures you control get +X/+X and gain trample, where X is the greatest power among creatures you control.",
        keywords: [],
        colorIdentity: ["G"],
        legalities: { commander: "legal" }
      },
      {
        oracleId: "4",
        name: "Aetherflux Reservoir",
        mv: 4,
        typeLine: "Artifact",
        oracleText: "Whenever you cast a spell, you gain 1 life for each spell you've cast this turn.",
        keywords: [],
        colorIdentity: [],
        legalities: { commander: "legal" }
      }
    ]);

    const result = buildRoleSuggestions({
      roleRows: [
        {
          key: "finishers",
          label: "Finishers",
          value: 1,
          recommendedText: "2-6",
          status: "LOW"
        }
      ],
      deckColorIdentity: ["G", "U"],
      existingCardNames: [],
      commanderNames: ["Edric, Spymaster of Trest"],
      cardDatabase: mockDb,
      limit: 4
    });

    expect(result[0]?.direction).toBe("ADD");
    expect(result[0]?.suggestions[0]).toBe("Triumph of the Hordes");
    expect(result[0]?.suggestions).toContain("Overwhelming Stampede");
    expect(result[0]?.rationale).toContain("Edric, Spymaster of Trest");
  });
});
