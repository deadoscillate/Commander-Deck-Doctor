import { describe, expect, it } from "vitest";
import { computePlayerHeuristics } from "@/lib/playerHeuristics";
import type { DeckCard, ScryfallCard } from "@/lib/types";

function buildCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    name: "Test Card",
    type_line: "Sorcery",
    cmc: 3,
    mana_cost: "{2}{U}",
    colors: ["U"],
    color_identity: ["U"],
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

function buildDeckCard(
  name: string,
  qty: number,
  oracleText: string,
  overrides: Partial<ScryfallCard> = {}
): DeckCard {
  return {
    name,
    qty,
    card: buildCard({
      name,
      oracle_text: oracleText,
      ...overrides
    })
  };
}

function flagByKind(
  report: ReturnType<typeof computePlayerHeuristics>,
  kind: "extraTurns" | "massLandDenial" | "staxPieces" | "freeInteraction" | "fastMana"
) {
  return report.tableImpact.flags.find((flag) => flag.kind === kind) ?? null;
}

describe("player heuristics - speed and consistency", () => {
  it("classifies fast turbo shells as VERY_FAST and HIGH consistency", () => {
    const deckCards: DeckCard[] = [
      buildDeckCard("Sol Ring", 1, "{T}: Add {C}{C}.", { type_line: "Artifact", cmc: 1, mana_cost: "{1}" }),
      buildDeckCard("Mana Crypt", 1, "{T}: Add {C}{C}.", { type_line: "Artifact", cmc: 0, mana_cost: "{0}" }),
      buildDeckCard(
        "Demonic Tutor",
        1,
        "Search your library for a card, put that card into your hand, then shuffle.",
        { type_line: "Sorcery", cmc: 2, mana_cost: "{1}{B}" }
      ),
      buildDeckCard("Force of Will", 1, "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.", {
        type_line: "Instant",
        cmc: 5,
        mana_cost: "{3}{U}{U}"
      }),
      buildDeckCard("Thassa's Oracle", 1, "When Thassa's Oracle enters the battlefield, look at the top X cards of your library.", {
        type_line: "Creature - Merfolk Wizard",
        cmc: 2,
        mana_cost: "{U}{U}"
      }),
      buildDeckCard("Time Warp", 1, "Target player takes an extra turn after this one.", {
        type_line: "Sorcery",
        cmc: 5,
        mana_cost: "{3}{U}{U}"
      })
    ];

    const report = computePlayerHeuristics({
      deckCards,
      averageManaValue: 2.1,
      landCount: 31,
      rampCount: 16,
      drawCount: 12,
      tutorCount: 8,
      comboDetectedCount: 2,
      commanderCard: buildCard({
        name: "Tymna the Weaver",
        type_line: "Legendary Creature - Human Cleric",
        cmc: 3,
        mana_cost: "{1}{W}{B}",
        oracle_text: "At the beginning of your postcombat main phase, you may pay X life. If you do, draw X cards."
      }),
      openingHand: {
        playableHandsPct: 82,
        deadHandsPct: 8,
        rampInOpeningPct: 61
      },
      goldfish: {
        avgFirstSpellTurn: 1.9,
        avgCommanderCastTurn: 3.6,
        avgManaByTurn3: 4.8
      }
    });

    expect(report.speedBand.value).toBe("VERY_FAST");
    expect(report.consistency.bucket).toBe("HIGH");
    expect(flagByKind(report, "fastMana")?.severity).toBe("WARN");
  });

  it("classifies clunkier shells as SLOW with LOW consistency", () => {
    const deckCards: DeckCard[] = [
      buildDeckCard("Harmonize", 1, "Draw three cards.", { type_line: "Sorcery", cmc: 4, mana_cost: "{2}{G}{G}" }),
      buildDeckCard("Solemn Simulacrum", 1, "When Solemn Simulacrum enters the battlefield, you may search your library for a basic land card.", {
        type_line: "Artifact Creature - Golem",
        cmc: 4,
        mana_cost: "{4}"
      }),
      buildDeckCard("Ancient Craving", 1, "You draw three cards and you lose 3 life.", {
        type_line: "Sorcery",
        cmc: 4,
        mana_cost: "{3}{B}"
      })
    ];

    const report = computePlayerHeuristics({
      deckCards,
      averageManaValue: 4.4,
      landCount: 40,
      rampCount: 6,
      drawCount: 5,
      tutorCount: 0,
      comboDetectedCount: 0,
      commanderCard: null,
      openingHand: {
        playableHandsPct: 52,
        deadHandsPct: 31,
        rampInOpeningPct: 18
      },
      goldfish: {
        avgFirstSpellTurn: 4.9,
        avgCommanderCastTurn: 7.2,
        avgManaByTurn3: 2.8
      }
    });

    expect(report.speedBand.value).toBe("SLOW");
    expect(report.consistency.bucket).toBe("LOW");
  });
});

describe("player heuristics - table impact", () => {
  it("keeps moderate table-impact packages at INFO severity", () => {
    const deckCards: DeckCard[] = [
      buildDeckCard("Sol Ring", 1, "{T}: Add {C}{C}.", { type_line: "Artifact", cmc: 1, mana_cost: "{1}" }),
      buildDeckCard("Mana Vault", 1, "{T}: Add {C}{C}{C}.", { type_line: "Artifact", cmc: 1, mana_cost: "{1}" }),
      buildDeckCard("Force of Will", 1, "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.", {
        type_line: "Instant",
        cmc: 5,
        mana_cost: "{3}{U}{U}"
      }),
      buildDeckCard("Pact of Negation", 1, "Counter target spell.", {
        type_line: "Instant",
        cmc: 0,
        mana_cost: "{0}"
      }),
      buildDeckCard("Rule of Law", 1, "Each player can't cast more than one spell each turn.", {
        type_line: "Enchantment",
        cmc: 3,
        mana_cost: "{2}{W}"
      })
    ];

    const report = computePlayerHeuristics({
      deckCards,
      averageManaValue: 3.1,
      landCount: 36,
      rampCount: 9,
      drawCount: 8,
      tutorCount: 2,
      comboDetectedCount: 0,
      commanderCard: null
    });

    expect(flagByKind(report, "fastMana")?.severity).toBe("INFO");
    expect(flagByKind(report, "freeInteraction")?.severity).toBe("INFO");
    expect(flagByKind(report, "staxPieces")?.severity).toBe("INFO");
  });

  it("escalates lock pressure to WARN when mass land denial is present", () => {
    const deckCards: DeckCard[] = [
      buildDeckCard("Armageddon", 1, "Destroy all lands.", {
        type_line: "Sorcery",
        cmc: 4,
        mana_cost: "{3}{W}"
      }),
      buildDeckCard("Drannith Magistrate", 1, "Your opponents can't cast spells from anywhere other than their hands.", {
        type_line: "Creature - Human Wizard",
        cmc: 2,
        mana_cost: "{1}{W}"
      })
    ];

    const report = computePlayerHeuristics({
      deckCards,
      averageManaValue: 3.2,
      landCount: 36,
      rampCount: 8,
      drawCount: 7,
      tutorCount: 1,
      comboDetectedCount: 0,
      commanderCard: null
    });

    expect(flagByKind(report, "massLandDenial")?.severity).toBe("WARN");
    expect(flagByKind(report, "staxPieces")?.severity).toBe("WARN");
  });
});
