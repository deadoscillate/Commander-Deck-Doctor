import { describe, expect, it } from "vitest";
import { evaluateCommanderRules } from "@/lib/rulesEngine";
import type { DeckCard, ScryfallCard } from "@/lib/types";

function buildCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    name: "Test Card",
    type_line: "Artifact",
    cmc: 1,
    mana_cost: "{1}",
    colors: [],
    color_identity: [],
    oracle_text: "",
    image_uris: null,
    card_faces: [],
    prices: {
      usd: null,
      usd_foil: null,
      usd_etched: null,
      tix: null
    },
    ...overrides
  };
}

function buildDeckCard(name: string, qty: number, overrides: Partial<ScryfallCard> = {}): DeckCard {
  return {
    name,
    qty,
    card: buildCard({ name, ...overrides })
  };
}

describe("Commander rules engine", () => {
  it("passes a legal mono-green commander shell", () => {
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Omnath, Locus of Mana", qty: 1 },
        { name: "Forest", qty: 99 }
      ],
      knownCards: [
        buildDeckCard("Omnath, Locus of Mana", 1, {
          type_line: "Legendary Creature - Elemental",
          color_identity: ["G"],
          colors: ["G"]
        }),
        buildDeckCard("Forest", 99, {
          type_line: "Basic Land - Forest",
          cmc: 0,
          mana_cost: "",
          color_identity: ["G"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Omnath, Locus of Mana",
        colorIdentity: ["G"],
        resolved: true
      }
    });

    expect(report.status).toBe("PASS");
    expect(report.failedRules).toBe(0);
    expect(report.passedRules).toBe(6);
    expect(report.rules.every((rule) => rule.outcome === "PASS")).toBe(true);
  });

  it("fails deck size and singleton for illegal counts", () => {
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Omnath, Locus of Mana", qty: 1 },
        { name: "Sol Ring", qty: 2 },
        { name: "Forest", qty: 98 }
      ],
      knownCards: [
        buildDeckCard("Omnath, Locus of Mana", 1, {
          type_line: "Legendary Creature - Elemental",
          color_identity: ["G"],
          colors: ["G"]
        }),
        buildDeckCard("Sol Ring", 2, {
          type_line: "Artifact",
          cmc: 1,
          mana_cost: "{1}",
          color_identity: [],
          colors: []
        }),
        buildDeckCard("Forest", 98, {
          type_line: "Basic Land - Forest",
          cmc: 0,
          mana_cost: "",
          color_identity: ["G"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Omnath, Locus of Mana",
        colorIdentity: ["G"],
        resolved: true
      }
    });

    const deckSizeRule = report.rules.find((rule) => rule.id === "commander.deck-size-exactly-100");
    const singletonRule = report.rules.find((rule) => rule.id === "commander.singleton-non-basic");

    expect(report.status).toBe("FAIL");
    expect(report.failedRules).toBeGreaterThanOrEqual(2);
    expect(deckSizeRule?.outcome).toBe("FAIL");
    expect(singletonRule?.outcome).toBe("FAIL");
    expect(singletonRule?.findings.some((entry) => entry.name === "Sol Ring" && entry.qty === 2)).toBe(true);
  });

  it("skips color identity when commander resolution is unavailable", () => {
    const report = evaluateCommanderRules({
      parsedDeck: [{ name: "Forest", qty: 100 }],
      knownCards: [
        buildDeckCard("Forest", 100, {
          type_line: "Basic Land - Forest",
          cmc: 0,
          mana_cost: "",
          color_identity: ["G"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Custom Commander",
        colorIdentity: [],
        resolved: false
      }
    });

    const colorRule = report.rules.find((rule) => rule.id === "commander.color-identity");

    expect(report.status).toBe("PASS");
    expect(colorRule?.outcome).toBe("SKIP");
    expect(colorRule?.message).toContain("could not be resolved");
  });

  it("fails when a banned card is present", () => {
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Omnath, Locus of Mana", qty: 1 },
        { name: "Black Lotus", qty: 1 },
        { name: "Forest", qty: 98 }
      ],
      knownCards: [
        buildDeckCard("Omnath, Locus of Mana", 1, {
          type_line: "Legendary Creature - Elemental",
          color_identity: ["G"],
          colors: ["G"]
        }),
        buildDeckCard("Black Lotus", 1, {
          type_line: "Artifact",
          cmc: 0,
          mana_cost: "{0}",
          color_identity: [],
          colors: []
        }),
        buildDeckCard("Forest", 98, {
          type_line: "Basic Land - Forest",
          cmc: 0,
          mana_cost: "",
          color_identity: ["G"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Omnath, Locus of Mana",
        colorIdentity: ["G"],
        resolved: true
      }
    });

    const banlistRule = report.rules.find((rule) => rule.id === "commander.banlist");

    expect(report.status).toBe("FAIL");
    expect(banlistRule?.outcome).toBe("FAIL");
    expect(banlistRule?.findings.some((entry) => entry.name === "Black Lotus" && entry.qty === 1)).toBe(
      true
    );
  });
});
