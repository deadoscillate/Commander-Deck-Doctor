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
    expect(report.passedRules).toBe(9);
    expect(report.skippedRules).toBe(1);
    expect(report.rules.find((rule) => rule.id === "commander.companion-legality")?.outcome).toBe("SKIP");
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

  it("fails when the selected commander is not commander-eligible", () => {
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Ornithopter", qty: 1 },
        { name: "Island", qty: 99 }
      ],
      knownCards: [
        buildDeckCard("Ornithopter", 1, {
          type_line: "Artifact Creature - Thopter",
          color_identity: [],
          colors: []
        }),
        buildDeckCard("Island", 99, {
          type_line: "Basic Land - Island",
          cmc: 0,
          mana_cost: "",
          color_identity: ["U"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Ornithopter",
        colorIdentity: [],
        resolved: true,
        card: buildCard({
          name: "Ornithopter",
          type_line: "Artifact Creature - Thopter",
          color_identity: [],
          colors: []
        })
      }
    });

    const eligibilityRule = report.rules.find((rule) => rule.id === "commander.commander-eligible");

    expect(report.status).toBe("FAIL");
    expect(eligibilityRule?.outcome).toBe("FAIL");
    expect(eligibilityRule?.message).toContain("not a legal commander");
  });

  it("fails when the selected commander is not present in the decklist", () => {
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
        name: "Omnath, Locus of Mana",
        colorIdentity: ["G"],
        resolved: true,
        card: buildCard({
          name: "Omnath, Locus of Mana",
          type_line: "Legendary Creature - Elemental",
          color_identity: ["G"],
          colors: ["G"]
        })
      }
    });

    const presenceRule = report.rules.find((rule) => rule.id === "commander.commander-present-in-deck");

    expect(report.status).toBe("FAIL");
    expect(presenceRule?.outcome).toBe("FAIL");
    expect(presenceRule?.message).toContain("not present");
  });

  it("passes a legal Partner pair", () => {
    const tymna = buildCard({
      name: "Tymna the Weaver",
      type_line: "Legendary Creature - Human Cleric",
      color_identity: ["W", "B"],
      colors: ["W", "B"],
      oracle_text: "Partner"
    });
    const thrasios = buildCard({
      name: "Thrasios, Triton Hero",
      type_line: "Legendary Creature - Merfolk Wizard",
      color_identity: ["G", "U"],
      colors: ["G", "U"],
      oracle_text: "Partner"
    });
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Tymna the Weaver", qty: 1 },
        { name: "Thrasios, Triton Hero", qty: 1 },
        { name: "Island", qty: 98 }
      ],
      knownCards: [
        { name: "Tymna the Weaver", qty: 1, card: tymna },
        { name: "Thrasios, Triton Hero", qty: 1, card: thrasios },
        buildDeckCard("Island", 98, {
          type_line: "Basic Land - Island",
          cmc: 0,
          mana_cost: "",
          color_identity: ["U"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Tymna the Weaver + Thrasios, Triton Hero",
        names: ["Tymna the Weaver", "Thrasios, Triton Hero"],
        colorIdentity: ["W", "U", "B", "G"],
        resolved: true,
        card: tymna,
        cards: [tymna, thrasios]
      }
    });

    expect(report.status).toBe("PASS");
    expect(report.rules.find((rule) => rule.id === "commander.commander-eligible")?.outcome).toBe("PASS");
  });

  it("fails an invalid partner pair when only one commander has Partner", () => {
    const tymna = buildCard({
      name: "Tymna the Weaver",
      type_line: "Legendary Creature - Human Cleric",
      color_identity: ["W", "B"],
      colors: ["W", "B"],
      oracle_text: "Partner"
    });
    const edric = buildCard({
      name: "Edric, Spymaster of Trest",
      type_line: "Legendary Creature - Elf Rogue",
      color_identity: ["G", "U"],
      colors: ["G", "U"],
      oracle_text:
        "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card."
    });
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Tymna the Weaver", qty: 1 },
        { name: "Edric, Spymaster of Trest", qty: 1 },
        { name: "Island", qty: 98 }
      ],
      knownCards: [
        { name: "Tymna the Weaver", qty: 1, card: tymna },
        { name: "Edric, Spymaster of Trest", qty: 1, card: edric },
        buildDeckCard("Island", 98, {
          type_line: "Basic Land - Island",
          cmc: 0,
          mana_cost: "",
          color_identity: ["U"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Tymna the Weaver + Edric, Spymaster of Trest",
        names: ["Tymna the Weaver", "Edric, Spymaster of Trest"],
        colorIdentity: ["W", "U", "B", "G"],
        resolved: true,
        card: tymna,
        cards: [tymna, edric]
      }
    });

    expect(report.status).toBe("FAIL");
    expect(report.rules.find((rule) => rule.id === "commander.commander-eligible")?.outcome).toBe("FAIL");
  });

  it("passes a legal Choose a Background pairing", () => {
    const burakos = buildCard({
      name: "Burakos, Party Leader",
      type_line: "Legendary Creature - Orc",
      color_identity: ["B"],
      colors: ["B"],
      oracle_text: "Choose a Background"
    });
    const background = buildCard({
      name: "Cloakwood Hermit",
      type_line: "Legendary Enchantment - Background",
      color_identity: ["G"],
      colors: ["G"],
      oracle_text: "Commander creatures you own have..."
    });
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Burakos, Party Leader", qty: 1 },
        { name: "Cloakwood Hermit", qty: 1 },
        { name: "Forest", qty: 98 }
      ],
      knownCards: [
        { name: "Burakos, Party Leader", qty: 1, card: burakos },
        { name: "Cloakwood Hermit", qty: 1, card: background },
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
        name: "Burakos, Party Leader + Cloakwood Hermit",
        names: ["Burakos, Party Leader", "Cloakwood Hermit"],
        colorIdentity: ["B", "G"],
        resolved: true,
        card: burakos,
        cards: [burakos, background]
      }
    });

    expect(report.status).toBe("PASS");
    expect(report.rules.find((rule) => rule.id === "commander.commander-eligible")?.outcome).toBe("PASS");
  });

  it("fails an invalid background pairing when the second commander is not a Background", () => {
    const burakos = buildCard({
      name: "Burakos, Party Leader",
      type_line: "Legendary Creature - Orc",
      color_identity: ["B"],
      colors: ["B"],
      oracle_text: "Choose a Background"
    });
    const edric = buildCard({
      name: "Edric, Spymaster of Trest",
      type_line: "Legendary Creature - Elf Rogue",
      color_identity: ["G", "U"],
      colors: ["G", "U"],
      oracle_text:
        "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card."
    });
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Burakos, Party Leader", qty: 1 },
        { name: "Edric, Spymaster of Trest", qty: 1 },
        { name: "Forest", qty: 98 }
      ],
      knownCards: [
        { name: "Burakos, Party Leader", qty: 1, card: burakos },
        { name: "Edric, Spymaster of Trest", qty: 1, card: edric },
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
        name: "Burakos, Party Leader + Edric, Spymaster of Trest",
        names: ["Burakos, Party Leader", "Edric, Spymaster of Trest"],
        colorIdentity: ["B", "G", "U"],
        resolved: true,
        card: burakos,
        cards: [burakos, edric]
      }
    });

    expect(report.status).toBe("FAIL");
    expect(report.rules.find((rule) => rule.id === "commander.commander-eligible")?.outcome).toBe("FAIL");
  });

  it("passes a legal Doctor's companion pairing", () => {
    const doctor = buildCard({
      name: "The Twelfth Doctor",
      type_line: "Legendary Creature - Time Lord Doctor",
      color_identity: ["U", "R"],
      colors: ["U", "R"],
      oracle_text: "Whenever you cast..."
    });
    const companion = buildCard({
      name: "Clara Oswald",
      type_line: "Legendary Creature - Human Advisor",
      color_identity: ["W"],
      colors: ["W"],
      oracle_text: "Doctor's companion"
    });
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "The Twelfth Doctor", qty: 1 },
        { name: "Clara Oswald", qty: 1 },
        { name: "Island", qty: 98 }
      ],
      knownCards: [
        { name: "The Twelfth Doctor", qty: 1, card: doctor },
        { name: "Clara Oswald", qty: 1, card: companion },
        buildDeckCard("Island", 98, {
          type_line: "Basic Land - Island",
          cmc: 0,
          mana_cost: "",
          color_identity: ["U"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "The Twelfth Doctor + Clara Oswald",
        names: ["The Twelfth Doctor", "Clara Oswald"],
        colorIdentity: ["W", "U", "R"],
        resolved: true,
        card: doctor,
        cards: [doctor, companion]
      }
    });

    expect(report.status).toBe("PASS");
    expect(report.rules.find((rule) => rule.id === "commander.commander-eligible")?.outcome).toBe("PASS");
  });

  it("surfaces pair-specific messaging for Partner with mismatches", () => {
    const pir = buildCard({
      name: "Pir, Imaginative Rascal",
      type_line: "Legendary Creature - Human",
      color_identity: ["G"],
      colors: ["G"],
      oracle_text: "Partner with Toothy, Imaginary Friend"
    });
    const edric = buildCard({
      name: "Edric, Spymaster of Trest",
      type_line: "Legendary Creature - Elf Rogue",
      color_identity: ["G", "U"],
      colors: ["G", "U"],
      oracle_text:
        "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card."
    });

    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Pir, Imaginative Rascal", qty: 1 },
        { name: "Edric, Spymaster of Trest", qty: 1 },
        { name: "Forest", qty: 98 }
      ],
      knownCards: [
        { name: "Pir, Imaginative Rascal", qty: 1, card: pir },
        { name: "Edric, Spymaster of Trest", qty: 1, card: edric },
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
        name: "Pir, Imaginative Rascal + Edric, Spymaster of Trest",
        names: ["Pir, Imaginative Rascal", "Edric, Spymaster of Trest"],
        colorIdentity: ["G", "U"],
        resolved: true,
        card: pir,
        cards: [pir, edric]
      }
    });

    const configurationRule = report.rules.find((rule) => rule.id === "commander.commander-eligible");
    expect(configurationRule?.outcome).toBe("FAIL");
    expect(configurationRule?.message).toContain("does not name it back");
  });

  it("passes a legal Lurrus companion shell", () => {
    const tymna = buildCard({
      name: "Tymna the Weaver",
      type_line: "Legendary Creature - Human Cleric",
      color_identity: ["W", "B"],
      colors: ["W", "B"],
      mana_cost: "{1}{W}{B}",
      oracle_text: "Partner"
    });
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Tymna the Weaver", qty: 1 },
        { name: "Soul Warden", qty: 1 },
        { name: "Plains", qty: 98 }
      ],
      knownCards: [
        { name: "Tymna the Weaver", qty: 1, card: tymna },
        buildDeckCard("Soul Warden", 1, {
          type_line: "Creature - Human Cleric",
          cmc: 1,
          mana_cost: "{W}",
          color_identity: ["W"],
          colors: ["W"]
        }),
        buildDeckCard("Plains", 98, {
          type_line: "Basic Land - Plains",
          cmc: 0,
          mana_cost: "",
          color_identity: ["W"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Tymna the Weaver",
        colorIdentity: ["W", "B"],
        resolved: true,
        card: tymna
      },
      companion: {
        name: "Lurrus of the Dream-Den",
        entries: [{ name: "Lurrus of the Dream-Den", qty: 1 }],
        resolved: true,
        card: buildCard({
          name: "Lurrus of the Dream-Den",
          type_line: "Legendary Creature - Cat Nightmare",
          cmc: 3,
          mana_cost: "{1}{W/B}{W/B}",
          color_identity: ["W", "B"],
          colors: ["W", "B"]
        })
      }
    });

    const companionRule = report.rules.find((rule) => rule.id === "commander.companion-legality");
    expect(report.status).toBe("PASS");
    expect(companionRule?.outcome).toBe("PASS");
    expect(companionRule?.message).toContain("Lurrus condition satisfied");
  });

  it("fails Yorion as a Commander companion", () => {
    const brago = buildCard({
      name: "Brago, King Eternal",
      type_line: "Legendary Creature - Spirit",
      color_identity: ["W", "U"],
      colors: ["W", "U"],
      mana_cost: "{2}{W}{U}"
    });
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Brago, King Eternal", qty: 1 },
        { name: "Plains", qty: 99 }
      ],
      knownCards: [
        { name: "Brago, King Eternal", qty: 1, card: brago },
        buildDeckCard("Plains", 99, {
          type_line: "Basic Land - Plains",
          cmc: 0,
          mana_cost: "",
          color_identity: ["W"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Brago, King Eternal",
        colorIdentity: ["W", "U"],
        resolved: true,
        card: brago
      },
      companion: {
        name: "Yorion, Sky Nomad",
        entries: [{ name: "Yorion, Sky Nomad", qty: 1 }],
        resolved: true,
        card: buildCard({
          name: "Yorion, Sky Nomad",
          type_line: "Legendary Creature - Bird Serpent",
          cmc: 5,
          mana_cost: "{3}{W}{U}",
          color_identity: ["W", "U"],
          colors: ["W", "U"]
        })
      }
    });

    const companionRule = report.rules.find((rule) => rule.id === "commander.companion-legality");
    expect(report.status).toBe("FAIL");
    expect(companionRule?.outcome).toBe("FAIL");
    expect(companionRule?.message).toContain("fixed 100-card deck");
  });

  it("flags banned companions through the banlist rule", () => {
    const niv = buildCard({
      name: "Niv-Mizzet, Parun",
      type_line: "Legendary Creature - Dragon Wizard",
      color_identity: ["U", "R"],
      colors: ["U", "R"],
      mana_cost: "{U}{U}{U}{R}{R}{R}"
    });
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Niv-Mizzet, Parun", qty: 1 },
        { name: "Island", qty: 99 }
      ],
      knownCards: [
        { name: "Niv-Mizzet, Parun", qty: 1, card: niv },
        buildDeckCard("Island", 99, {
          type_line: "Basic Land - Island",
          cmc: 0,
          mana_cost: "",
          color_identity: ["U"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Niv-Mizzet, Parun",
        colorIdentity: ["U", "R"],
        resolved: true,
        card: niv
      },
      companion: {
        name: "Lutri, the Spellchaser",
        entries: [{ name: "Lutri, the Spellchaser", qty: 1 }],
        resolved: true,
        card: buildCard({
          name: "Lutri, the Spellchaser",
          type_line: "Legendary Creature - Elemental Otter",
          cmc: 3,
          mana_cost: "{1}{U/R}{U/R}",
          color_identity: ["U", "R"],
          colors: ["U", "R"]
        })
      }
    });

    const banlistRule = report.rules.find((rule) => rule.id === "commander.banlist");
    expect(report.status).toBe("FAIL");
    expect(banlistRule?.outcome).toBe("FAIL");
    expect(banlistRule?.findings.some((entry) => entry.name === "Lutri, the Spellchaser")).toBe(true);
  });

  it("fails when a declared companion also appears in the 100-card deck", () => {
    const tymna = buildCard({
      name: "Tymna the Weaver",
      type_line: "Legendary Creature - Human Cleric",
      color_identity: ["W", "B"],
      colors: ["W", "B"],
      mana_cost: "{1}{W}{B}"
    });
    const lurrus = buildCard({
      name: "Lurrus of the Dream-Den",
      type_line: "Legendary Creature - Cat Nightmare",
      color_identity: ["W", "B"],
      colors: ["W", "B"],
      cmc: 3,
      mana_cost: "{1}{W/B}{W/B}"
    });
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Tymna the Weaver", qty: 1 },
        { name: "Lurrus of the Dream-Den", qty: 1 },
        { name: "Plains", qty: 98 }
      ],
      knownCards: [
        { name: "Tymna the Weaver", qty: 1, card: tymna },
        { name: "Lurrus of the Dream-Den", qty: 1, card: lurrus },
        buildDeckCard("Plains", 98, {
          type_line: "Basic Land - Plains",
          cmc: 0,
          mana_cost: "",
          color_identity: ["W"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Tymna the Weaver",
        colorIdentity: ["W", "B"],
        resolved: true,
        card: tymna
      },
      companion: {
        name: "Lurrus of the Dream-Den",
        entries: [{ name: "Lurrus of the Dream-Den", qty: 1 }],
        resolved: true,
        card: lurrus
      }
    });

    const companionRule = report.rules.find((rule) => rule.id === "commander.companion-legality");
    expect(report.status).toBe("FAIL");
    expect(companionRule?.outcome).toBe("FAIL");
    expect(companionRule?.message).toContain("cannot also be declared as the companion");
  });

  it("allows duplicate cards when Oracle text says any number of copies are legal", () => {
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Marrow-Gnawer", qty: 1 },
        { name: "Relentless Rats", qty: 25 },
        { name: "Swamp", qty: 74 }
      ],
      knownCards: [
        buildDeckCard("Marrow-Gnawer", 1, {
          type_line: "Legendary Creature - Rat Rogue",
          color_identity: ["B"],
          colors: ["B"],
          cmc: 5,
          mana_cost: "{3}{B}{B}"
        }),
        buildDeckCard("Relentless Rats", 25, {
          type_line: "Creature - Rat",
          color_identity: ["B"],
          colors: ["B"],
          cmc: 3,
          mana_cost: "{1}{B}{B}",
          oracle_text: "A deck can have any number of cards named Relentless Rats."
        }),
        buildDeckCard("Swamp", 74, {
          type_line: "Basic Land - Swamp",
          cmc: 0,
          mana_cost: "",
          color_identity: ["B"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Marrow-Gnawer",
        colorIdentity: ["B"],
        resolved: true,
        card: buildCard({
          name: "Marrow-Gnawer",
          type_line: "Legendary Creature - Rat Rogue",
          color_identity: ["B"],
          colors: ["B"],
          cmc: 5,
          mana_cost: "{3}{B}{B}"
        })
      }
    });

    const singletonRule = report.rules.find((rule) => rule.id === "commander.singleton-non-basic");
    expect(singletonRule?.outcome).toBe("PASS");
  });

  it("allows Seven Dwarves up to seven copies but no more", () => {
    const commander = buildCard({
      name: "Torbran, Thane of Red Fell",
      type_line: "Legendary Creature - Dwarf Noble",
      color_identity: ["R"],
      colors: ["R"],
      cmc: 4,
      mana_cost: "{1}{R}{R}{R}"
    });
    const baseInput = {
      unknownCards: [] as string[],
      commander: {
        name: "Torbran, Thane of Red Fell",
        colorIdentity: ["R"],
        resolved: true,
        card: commander
      }
    };

    const legalReport = evaluateCommanderRules({
      parsedDeck: [
        { name: "Torbran, Thane of Red Fell", qty: 1 },
        { name: "Seven Dwarves", qty: 7 },
        { name: "Mountain", qty: 92 }
      ],
      knownCards: [
        { name: "Torbran, Thane of Red Fell", qty: 1, card: commander },
        buildDeckCard("Seven Dwarves", 7, {
          type_line: "Creature - Dwarf",
          color_identity: ["R"],
          colors: ["R"],
          cmc: 2,
          mana_cost: "{1}{R}",
          oracle_text: "A deck can have up to seven cards named Seven Dwarves."
        }),
        buildDeckCard("Mountain", 92, {
          type_line: "Basic Land - Mountain",
          cmc: 0,
          mana_cost: "",
          color_identity: ["R"],
          colors: []
        })
      ],
      ...baseInput
    });

    const illegalReport = evaluateCommanderRules({
      parsedDeck: [
        { name: "Torbran, Thane of Red Fell", qty: 1 },
        { name: "Seven Dwarves", qty: 8 },
        { name: "Mountain", qty: 91 }
      ],
      knownCards: [
        { name: "Torbran, Thane of Red Fell", qty: 1, card: commander },
        buildDeckCard("Seven Dwarves", 8, {
          type_line: "Creature - Dwarf",
          color_identity: ["R"],
          colors: ["R"],
          cmc: 2,
          mana_cost: "{1}{R}",
          oracle_text: "A deck can have up to seven cards named Seven Dwarves."
        }),
        buildDeckCard("Mountain", 91, {
          type_line: "Basic Land - Mountain",
          cmc: 0,
          mana_cost: "",
          color_identity: ["R"],
          colors: []
        })
      ],
      ...baseInput
    });

    expect(legalReport.rules.find((rule) => rule.id === "commander.singleton-non-basic")?.outcome).toBe("PASS");
    expect(illegalReport.rules.find((rule) => rule.id === "commander.singleton-non-basic")?.outcome).toBe("FAIL");
  });

  it("fails Conspiracy cards through category-based Commander restrictions", () => {
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Marchesa, the Black Rose", qty: 1 },
        { name: "Conspiracy", qty: 1 },
        { name: "Island", qty: 98 }
      ],
      knownCards: [
        buildDeckCard("Marchesa, the Black Rose", 1, {
          type_line: "Legendary Creature - Human Wizard",
          color_identity: ["U", "B", "R"],
          colors: ["U", "B", "R"],
          cmc: 4,
          mana_cost: "{1}{U}{B}{R}"
        }),
        buildDeckCard("Conspiracy", 1, {
          type_line: "Conspiracy",
          oracle_text: "",
          color_identity: ["B"],
          colors: ["B"],
          cmc: 5,
          mana_cost: "{3}{B}{B}"
        }),
        buildDeckCard("Island", 98, {
          type_line: "Basic Land - Island",
          cmc: 0,
          mana_cost: "",
          color_identity: ["U"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Marchesa, the Black Rose",
        colorIdentity: ["U", "B", "R"],
        resolved: true,
        card: buildCard({
          name: "Marchesa, the Black Rose",
          type_line: "Legendary Creature - Human Wizard",
          color_identity: ["U", "B", "R"],
          colors: ["U", "B", "R"],
          cmc: 4,
          mana_cost: "{1}{U}{B}{R}"
        })
      }
    });

    const rule = report.rules.find((entry) => entry.id === "commander.special-card-type-bans");
    expect(report.status).toBe("FAIL");
    expect(rule?.outcome).toBe("FAIL");
    expect(rule?.findings.some((entry) => entry.name === "Conspiracy")).toBe(true);
  });

  it("fails ante cards through category-based Commander restrictions", () => {
    const report = evaluateCommanderRules({
      parsedDeck: [
        { name: "Ayli, Eternal Pilgrim", qty: 1 },
        { name: "Contract from Below", qty: 1 },
        { name: "Plains", qty: 98 }
      ],
      knownCards: [
        buildDeckCard("Ayli, Eternal Pilgrim", 1, {
          type_line: "Legendary Creature - Kor Cleric",
          color_identity: ["W", "B"],
          colors: ["W", "B"],
          cmc: 2,
          mana_cost: "{W}{B}"
        }),
        buildDeckCard("Contract from Below", 1, {
          type_line: "Sorcery",
          color_identity: ["B"],
          colors: ["B"],
          cmc: 1,
          mana_cost: "{B}",
          oracle_text: "Remove Contract from Below from your deck before playing if you're not playing for ante. Discard your hand, ante the top card of your library, then draw seven cards."
        }),
        buildDeckCard("Plains", 98, {
          type_line: "Basic Land - Plains",
          cmc: 0,
          mana_cost: "",
          color_identity: ["W"],
          colors: []
        })
      ],
      unknownCards: [],
      commander: {
        name: "Ayli, Eternal Pilgrim",
        colorIdentity: ["W", "B"],
        resolved: true,
        card: buildCard({
          name: "Ayli, Eternal Pilgrim",
          type_line: "Legendary Creature - Kor Cleric",
          color_identity: ["W", "B"],
          colors: ["W", "B"],
          cmc: 2,
          mana_cost: "{W}{B}"
        })
      }
    });

    const rule = report.rules.find((entry) => entry.id === "commander.special-card-type-bans");
    expect(report.status).toBe("FAIL");
    expect(rule?.outcome).toBe("FAIL");
    expect(rule?.findings.some((entry) => entry.name === "Contract from Below")).toBe(true);
  });
});
