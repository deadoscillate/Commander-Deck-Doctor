import type { AnalyzeResponse } from "@/lib/contracts";

export function createAnalyzeResponseFixture(
  overrides: Partial<AnalyzeResponse> = {}
): AnalyzeResponse {
  const base: AnalyzeResponse = {
    schemaVersion: "1.0",
    input: {
      deckPriceMode: "decklist-set",
      targetBracket: null,
      expectedWinTurn: null,
      commanderName: "Atraxa, Praetors' Voice",
      userCedhFlag: false,
      userHighPowerNoGCFlag: false
    },
    commander: {
      detectedFromSection: "Atraxa, Praetors' Voice",
      selectedName: "Atraxa, Praetors' Voice",
      selectedColorIdentity: ["W", "U", "B", "G"],
      selectedManaCost: "{G}{W}{U}{B}",
      selectedCmc: 4,
      selectedArtUrl: "https://img.test/atraxa-art.jpg",
      selectedCardImageUrl: "https://img.test/atraxa-card.jpg",
      selectedSetCode: "2xm",
      selectedCollectorNumber: "190",
      selectedPrintingId: "fixture-printing-id",
      source: "section",
      options: [
        {
          name: "Atraxa, Praetors' Voice",
          colorIdentity: ["W", "U", "B", "G"]
        }
      ],
      needsManualSelection: false
    },
    parsedDeck: [
      {
        name: "Sol Ring",
        qty: 1,
        resolvedName: "Sol Ring",
        previewImageUrl: "https://img.test/sol-ring.jpg",
        prices: {
          usd: 1.5,
          usdFoil: 5.1,
          usdEtched: null,
          tix: 0.03
        },
        sellerLinks: {
          tcgplayer: "https://example.test/tcg/sol-ring",
          cardKingdom: "https://example.test/ck/sol-ring"
        },
        known: true,
        isGameChanger: false,
        gameChangerName: null
      },
      {
        name: "Arcane Signet",
        qty: 1,
        resolvedName: "Arcane Signet",
        previewImageUrl: "https://img.test/arcane-signet.jpg",
        prices: {
          usd: 0.8,
          usdFoil: 1.7,
          usdEtched: null,
          tix: 0.01
        },
        sellerLinks: {
          tcgplayer: "https://example.test/tcg/arcane-signet",
          cardKingdom: "https://example.test/ck/arcane-signet"
        },
        known: true,
        isGameChanger: false,
        gameChangerName: null
      }
    ],
    unknownCards: [],
    summary: {
      deckSize: 100,
      uniqueCards: 100,
      colors: ["W", "U", "B", "G"],
      averageManaValue: 2.82,
      types: {
        creature: 24,
        instant: 8,
        sorcery: 10,
        artifact: 14,
        enchantment: 7,
        planeswalker: 1,
        land: 36,
        battle: 0
      },
      manaCurve: {
        "0": 2,
        "1": 9,
        "2": 18,
        "3": 20,
        "4": 16,
        "5": 11,
        "6": 7,
        "7+": 5
      }
    },
    metrics: {
      deckSize: 100,
      uniqueCards: 100,
      colors: ["W", "U", "B", "G"],
      averageManaValue: 2.82,
      types: {
        creature: 24,
        instant: 8,
        sorcery: 10,
        artifact: 14,
        enchantment: 7,
        planeswalker: 1,
        land: 36,
        battle: 0
      },
      manaCurve: {
        "0": 2,
        "1": 9,
        "2": 18,
        "3": 20,
        "4": 16,
        "5": 11,
        "6": 7,
        "7+": 5
      }
    },
    roles: {
      ramp: 10,
      draw: 9,
      removal: 8,
      wipes: 3,
      tutors: 2,
      protection: 4,
      finishers: 4
    },
    roleBreakdown: {
      ramp: [{ name: "Sol Ring", qty: 1 }],
      draw: [{ name: "Mystic Remora", qty: 1 }],
      removal: [{ name: "Swords to Plowshares", qty: 1 }],
      wipes: [{ name: "Farewell", qty: 1 }],
      tutors: [{ name: "Demonic Tutor", qty: 1 }],
      protection: [{ name: "Teferi's Protection", qty: 1 }],
      finishers: [{ name: "Craterhoof Behemoth", qty: 1 }]
    },
    tutorSummary: {
      trueTutors: 2,
      tutorSignals: 3,
      trueTutorBreakdown: [{ name: "Demonic Tutor", qty: 1 }],
      tutorSignalOnlyBreakdown: [{ name: "Traverse the Ulvenwald", qty: 1 }],
      disclaimer: "Tutor summary fixture."
    },
    checks: {
      deckSize: {
        ok: true,
        expected: 100,
        actual: 100,
        message: "Deck size is 100."
      },
      unknownCards: {
        ok: true,
        count: 0,
        cards: [],
        message: "All card names resolved."
      },
      singleton: {
        ok: true,
        duplicateCount: 0,
        duplicates: [],
        message: "No non-basic duplicates detected."
      },
      colorIdentity: {
        ok: true,
        enabled: true,
        commanderName: "Atraxa, Praetors' Voice",
        commanderColorIdentity: ["W", "U", "B", "G"],
        offColorCount: 0,
        offColorCards: [],
        message: "All cards are in-color."
      }
    },
    rulesEngine: {
      format: "commander",
      engineVersion: "fixture",
      status: "PASS",
      passedRules: 6,
      failedRules: 0,
      skippedRules: 0,
      rules: [
        {
          id: "commander.deck-size-exactly-100",
          name: "Deck Size",
          description: "Deck must have exactly 100 cards including commander.",
          domain: "DECK_CONSTRUCTION",
          severity: "ERROR",
          outcome: "PASS",
          message: "Deck size is valid.",
          findings: []
        }
      ],
      warnings: [],
      disclaimer: "Rules engine fixture."
    },
    deckHealth: {
      rows: [
        {
          key: "lands",
          label: "Lands",
          value: 36,
          status: "OK",
          recommendedMin: 34,
          recommendedMax: 38,
          recommendedText: "34-38",
          diagnostic: "Healthy land count."
        },
        {
          key: "ramp",
          label: "Ramp",
          value: 10,
          status: "OK",
          recommendedMin: 8,
          recommendedMax: 12,
          recommendedText: "8-12",
          diagnostic: "Healthy ramp count."
        },
        {
          key: "draw",
          label: "Card Draw",
          value: 9,
          status: "OK",
          recommendedMin: 8,
          recommendedMax: 12,
          recommendedText: "8-12",
          diagnostic: "Healthy draw count."
        },
        {
          key: "removal",
          label: "Removal",
          value: 8,
          status: "OK",
          recommendedMin: 6,
          recommendedMax: 10,
          recommendedText: "6-10",
          diagnostic: "Healthy removal count."
        },
        {
          key: "wipes",
          label: "Board Wipes",
          value: 3,
          status: "OK",
          recommendedMin: 2,
          recommendedMax: 4,
          recommendedText: "2-4",
          diagnostic: "Healthy wipe count."
        },
        {
          key: "protection",
          label: "Protection",
          value: 4,
          status: "OK",
          recommendedMin: 3,
          recommendedMax: 7,
          recommendedText: "3-7",
          diagnostic: "Healthy protection count."
        },
        {
          key: "finishers",
          label: "Finishers",
          value: 4,
          status: "OK",
          recommendedMin: 2,
          recommendedMax: 6,
          recommendedText: "2-6",
          diagnostic: "Healthy finisher count."
        }
      ],
      warnings: [],
      okays: ["Deck composition is within recommended ranges."],
      disclaimer: "Deck health fixture."
    },
    deckPrice: {
      totals: {
        usd: 245.77,
        usdFoil: 612.12,
        usdEtched: null,
        tix: 8.51
      },
      pricedCardQty: {
        usd: 98,
        usdFoil: 92,
        usdEtched: 0,
        tix: 90
      },
      totalKnownCardQty: 100,
      coverage: {
        usd: 0.98,
        usdFoil: 0.92,
        usdEtched: 0,
        tix: 0.9
      },
      pricingMode: "decklist-set",
      setTaggedCardQty: 100,
      setMatchedCardQty: 95,
      disclaimer: "Deck price fixture."
    },
    openingHandSimulation: {
      simulations: 250,
      playableHands: 191,
      deadHands: 59,
      rampInOpening: 142,
      playablePct: 76.4,
      deadPct: 23.6,
      rampInOpeningPct: 56.8,
      averageFirstSpellTurn: 2.1,
      estimatedCommanderCastTurn: 4.7,
      cardCounts: {
        lands: 36,
        rampCards: 10,
        manaRocks: 7
      },
      totalDeckSize: 100,
      unknownCardCount: 0,
      disclaimer: "Simulation fixture."
    },
    archetypeReport: {
      primary: {
        archetype: "Tokens",
        tagCount: 72,
        confidence: 0.72
      },
      secondary: {
        archetype: "Aristocrats",
        tagCount: 41,
        confidence: 0.41
      },
      confidence: 0.72,
      counts: [
        { archetype: "Tokens", tagCount: 72, confidence: 0.72 },
        { archetype: "Aristocrats", tagCount: 41, confidence: 0.41 }
      ],
      disclaimer: "Archetype fixture."
    },
    comboReport: {
      detected: [
        {
          comboName: "Oracle Consultation",
          cards: ["Thassa's Oracle", "Demonic Consultation"],
          requires: [],
          isConditional: false,
          commanderSpellbookUrl: "https://commanderspellbook.com/search/?q=Thassa%27s+Oracle",
          matchedCards: ["Thassa's Oracle", "Demonic Consultation"]
        }
      ],
      conditional: [],
      potential: [],
      databaseSize: 1000,
      disclaimer: "Combo fixture."
    },
    ruleZero: {
      winStyle: {
        primary: "COMBO",
        secondary: "COMBAT",
        evidence: ["Thassa's Oracle", "Demonic Consultation", "Ad Nauseam"]
      },
      speedBand: {
        value: "MID",
        turnBand: "7-9",
        explanation: "Moderate acceleration and tutor density."
      },
      consistency: {
        score: 64,
        bucket: "MED",
        commanderEngine: true,
        explanation: "Balanced draw/ramp profile with moderate tutor access."
      },
      tableImpact: {
        flags: [
          {
            kind: "fastMana",
            severity: "INFO",
            count: 2,
            message: "Fast mana present.",
            cards: ["Sol Ring", "Mana Crypt"]
          }
        ],
        extraTurnsCount: 0,
        massLandDenialCount: 0,
        staxPiecesCount: 0,
        freeInteractionCount: 1,
        fastManaCount: 2
      },
      disclaimer: "Rule 0 fixture."
    },
    improvementSuggestions: {
      colorIdentity: ["W", "U", "B", "G"],
      items: [
        {
          key: "draw",
          label: "Card Draw",
          currentCount: 9,
          recommendedRange: "8-12",
          direction: "ADD",
          suggestions: ["Rhystic Study", "Mystic Remora"]
        }
      ],
      disclaimer: "Suggestions fixture."
    },
    warnings: [],
    bracketReport: {
      estimatedBracket: 3,
      estimatedLabel: "Upgraded",
      gameChangersVersion: "fixture",
      gameChangersCount: 0,
      bracket3AllowanceText: "0 / 3 allowed in Bracket 3",
      gameChangersFound: [],
      extraTurnsCount: 0,
      extraTurnCards: [],
      massLandDenialCount: 0,
      massLandDenialCards: [],
      notes: [],
      warnings: [],
      explanation: "No major bracket escalators detected.",
      disclaimer: "Bracket fixture."
    }
  };

  return {
    ...base,
    ...overrides
  };
}
