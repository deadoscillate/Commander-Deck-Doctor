import { describe, expect, it } from "vitest";
import { computeDeckSummary, computeRoleBreakdown, computeRoleCounts, computeTutorSummary } from "@/lib/analysis";
import type { DeckCard, ScryfallCard } from "@/lib/types";

function buildCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    name: "Test Card",
    type_line: "Sorcery",
    cmc: 4,
    mana_cost: "{2}{W}{W}",
    colors: ["W"],
    color_identity: ["W"],
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

function buildDeckCard(name: string, qty: number, oracleText: string): DeckCard {
  return {
    name,
    qty,
    card: buildCard({
      name,
      oracle_text: oracleText
    })
  };
}

describe("analysis role tagging - board wipes", () => {
  it("tags true mass-removal cards as wipes", () => {
    const cards: DeckCard[] = [
      buildDeckCard("Wrath of God", 1, "Destroy all creatures. They can't be regenerated."),
      buildDeckCard("Blasphemous Act", 1, "Blasphemous Act deals 13 damage to each creature."),
      buildDeckCard("Farewell", 1, "Choose one or more - Exile all artifacts, all creatures, all enchantments, and/or all graveyards.")
    ];

    const roles = computeRoleCounts(cards);
    const breakdown = computeRoleBreakdown(cards);

    expect(roles.wipes).toBe(3);
    expect(breakdown.wipes.map((row) => row.name)).toEqual([
      "Blasphemous Act",
      "Farewell",
      "Wrath of God"
    ]);
  });

  it("does not tag non-wipe cards that contain broad keywords", () => {
    const cards: DeckCard[] = [
      buildDeckCard("Trumpet Blast", 1, "Attacking creatures get +2/+0 until end of turn."),
      buildDeckCard("Overrun Glimpse", 1, "Each creature you control gets +1/+1 and gains trample until end of turn."),
      buildDeckCard("Drain Pulse", 1, "Whenever a creature enters the battlefield, each opponent loses 1 life and you gain 1 life.")
    ];

    const roles = computeRoleCounts(cards);
    const breakdown = computeRoleBreakdown(cards);

    expect(roles.wipes).toBe(0);
    expect(breakdown.wipes).toEqual([]);
  });
});

describe("analysis role tagging - tutors", () => {
  it("tags true tutors and excludes land-ramp search effects", () => {
    const cards: DeckCard[] = [
      buildDeckCard("Demonic Tutor", 1, "Search your library for a card, put that card into your hand, then shuffle."),
      buildDeckCard("Worldly Tutor", 1, "Search your library for a creature card, reveal it, then shuffle and put that card on top."),
      buildDeckCard("Cultivate", 1, "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle."),
      buildDeckCard("Rampant Growth", 1, "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.")
    ];

    const roles = computeRoleCounts(cards);
    const breakdown = computeRoleBreakdown(cards);

    expect(roles.tutors).toBe(2);
    expect(breakdown.tutors.map((row) => row.name)).toEqual([
      "Demonic Tutor",
      "Worldly Tutor"
    ]);
  });
});

describe("analysis role tagging - all core roles", () => {
  it("classifies representative cards into the expected role buckets", () => {
    const cards: DeckCard[] = [
      buildDeckCard("Sol Ring", 1, "{T}: Add {C}{C}."),
      buildDeckCard("Farseek", 1, "Search your library for a Plains, Island, Swamp, or Mountain card and put it onto the battlefield tapped, then shuffle."),
      buildDeckCard("Divination", 1, "Draw two cards."),
      buildDeckCard("Swords to Plowshares", 1, "Exile target creature. Its controller gains life equal to its power."),
      buildDeckCard("Wrath of God", 1, "Destroy all creatures. They can't be regenerated."),
      buildDeckCard("Demonic Tutor", 1, "Search your library for a card, put that card into your hand, then shuffle."),
      buildDeckCard("Heroic Intervention", 1, "Permanents you control gain hexproof and indestructible until end of turn."),
      buildDeckCard("Craterhoof Behemoth", 1, "Creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control."),
      buildDeckCard("Drain Ping", 1, "Each opponent loses 1 life and you gain 1 life.")
    ];

    const roles = computeRoleCounts(cards);

    expect(roles.ramp).toBe(2);
    expect(roles.draw).toBe(1);
    expect(roles.removal).toBe(1);
    expect(roles.wipes).toBe(1);
    expect(roles.tutors).toBe(1);
    expect(roles.protection).toBe(1);
    expect(roles.finishers).toBe(1);
  });

  it("does not double-count mass wipes as targeted removal", () => {
    const cards: DeckCard[] = [
      buildDeckCard("Damnation", 1, "Destroy all creatures. They can't be regenerated."),
      buildDeckCard("Swords to Plowshares", 1, "Exile target creature. Its controller gains life equal to its power.")
    ];

    const roles = computeRoleCounts(cards);
    const breakdown = computeRoleBreakdown(cards);

    expect(roles.wipes).toBe(1);
    expect(roles.removal).toBe(1);
    expect(breakdown.wipes.map((row) => row.name)).toEqual(["Damnation"]);
    expect(breakdown.removal.map((row) => row.name)).toEqual(["Swords to Plowshares"]);
  });

  it("does not count basic lands as ramp sources", () => {
    const cards: DeckCard[] = [
      {
        name: "Forest",
        qty: 10,
        card: buildCard({
          name: "Forest",
          type_line: "Basic Land - Forest",
          cmc: 0,
          mana_cost: "",
          oracle_text: "({T}: Add {G}.)"
        })
      },
      buildDeckCard("Arcane Signet", 1, "{T}: Add one mana of any color in your commander's color identity."),
      buildDeckCard("Cultivate", 1, "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.")
    ];

    const roles = computeRoleCounts(cards);
    const breakdown = computeRoleBreakdown(cards);

    expect(roles.ramp).toBe(2);
    expect(breakdown.ramp.map((row) => row.name)).toEqual(["Arcane Signet", "Cultivate"]);
  });
});

describe("analysis tutor classification", () => {
  it("separates true tutors from broader tutor signals", () => {
    const cards: DeckCard[] = [
      buildDeckCard("Demonic Tutor", 1, "Search your library for a card, put that card into your hand, then shuffle."),
      buildDeckCard(
        "Cultivate",
        1,
        "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle."
      ),
      buildDeckCard(
        "Ancient Stirrings",
        1,
        "Look at the top five cards of your library. You may reveal a colorless card from among them and put it into your hand. Put the rest on the bottom of your library in any order."
      )
    ];

    const summary = computeTutorSummary(cards);

    expect(summary.trueTutors).toBe(1);
    expect(summary.tutorSignals).toBe(3);
    expect(summary.trueTutorBreakdown.map((row) => row.name)).toEqual(["Demonic Tutor"]);
    expect(summary.tutorSignalOnlyBreakdown.map((row) => row.name)).toEqual([
      "Ancient Stirrings",
      "Cultivate"
    ]);
  });
});

describe("analysis category counting", () => {
  it("counts card categories from type lines instead of oracle keywords", () => {
    const cards: DeckCard[] = [
      {
        name: "Opt",
        qty: 1,
        card: buildCard({ name: "Opt", type_line: "Instant", cmc: 1, mana_cost: "{U}" })
      },
      {
        name: "Llanowar Elves",
        qty: 1,
        card: buildCard({ name: "Llanowar Elves", type_line: "Creature - Elf Druid", cmc: 1, mana_cost: "{G}" })
      },
      {
        name: "Command Tower",
        qty: 1,
        card: buildCard({ name: "Command Tower", type_line: "Land", cmc: 0, mana_cost: "" })
      }
    ];

    const summary = computeDeckSummary(cards);

    expect(summary.types.instant).toBe(1);
    expect(summary.types.creature).toBe(1);
    expect(summary.types.land).toBe(1);
    expect(summary.types.sorcery).toBe(0);
  });
});
