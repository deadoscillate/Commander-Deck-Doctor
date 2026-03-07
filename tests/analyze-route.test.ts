import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "@/lib/types";

function buildRequest(payload: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

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

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unmock("@/lib/scryfall");
});

describe("POST /api/analyze", () => {
  it("returns 400 when decklist is empty", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const response = await POST(buildRequest({ decklist: "   " }));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Decklist is required.");
  }, 15000);

  it("returns controlled 500 when analysis dependency throws", async () => {
    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: vi.fn(async () => {
        throw new Error("synthetic failure");
      }),
      getCardById: vi.fn(async () => null),
      getCardByName: vi.fn(async () => null),
      getCardByNameWithSet: vi.fn(async () => null)
    }));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/analyze/route");
    const response = await POST(buildRequest({ decklist: "1 Sol Ring" }));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("Analysis failed due to a server error. Please retry.");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("returns deck price totals from resolved card prices", async () => {
    const fetchDeckCardsMock = vi.fn(async () => ({
      knownCards: [
        {
          name: "Sol Ring",
          qty: 2,
          card: buildCard({
            name: "Sol Ring",
            set: "cmm",
            type_line: "Artifact",
            cmc: 1,
            mana_cost: "{1}",
            oracle_text: "{T}: Add {C}{C}.",
            prices: {
              usd: "1.50",
              usd_foil: "6.00",
              usd_etched: null,
              tix: "0.03"
            }
          })
        },
        {
          name: "Arcane Signet",
          qty: 1,
          card: buildCard({
            name: "Arcane Signet",
            set: "clb",
            type_line: "Artifact",
            cmc: 2,
            mana_cost: "{2}",
            oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
            prices: {
              usd: "0.75",
              usd_foil: "1.20",
              usd_etched: null,
              tix: "0.02"
            }
          })
        }
      ],
      unknownCards: []
    }));

    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: fetchDeckCardsMock,
      getCardById: vi.fn(async () => null),
      getCardByName: vi.fn(async () => null),
      getCardByNameWithSet: vi.fn(async () => null)
    }));

    const { POST } = await import("@/app/api/analyze/route");
    const response = await POST(
      buildRequest({
        decklist: "2 Sol Ring [CMM]\n1 Arcane Signet [MH3]",
        deckPriceMode: "decklist-set"
      })
    );
    const body = (await response.json()) as {
      input?: {
        deckPriceMode?: string;
      };
      deckPrice?: {
        totals?: { usd?: number | null; usdFoil?: number | null; tix?: number | null };
        pricedCardQty?: { usd?: number };
        totalKnownCardQty?: number;
        pricingMode?: string;
        setTaggedCardQty?: number;
        setMatchedCardQty?: number;
      };
      roleBreakdown?: {
        ramp?: Array<{ name?: string; qty?: number }>;
      };
      tutorSummary?: {
        trueTutors?: number;
        tutorSignals?: number;
      };
      rulesEngine?: {
        status?: string;
        rules?: Array<{ id?: string; outcome?: string }>;
      };
    };

    expect(response.status).toBe(200);
    expect(fetchDeckCardsMock).toHaveBeenCalledTimes(1);
    expect(fetchDeckCardsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "Sol Ring", qty: 2, setCode: "cmm" }),
        expect.objectContaining({ name: "Arcane Signet", qty: 1, setCode: "mh3" })
      ]),
      8,
      { deckPriceMode: "decklist-set" }
    );
    expect(body.input?.deckPriceMode).toBe("decklist-set");
    expect(body.deckPrice?.totals?.usd).toBe(3.75);
    expect(body.deckPrice?.totals?.usdFoil).toBe(13.2);
    expect(body.deckPrice?.totals?.tix).toBe(0.08);
    expect(body.deckPrice?.pricedCardQty?.usd).toBe(3);
    expect(body.deckPrice?.totalKnownCardQty).toBe(3);
    expect(body.deckPrice?.pricingMode).toBe("decklist-set");
    expect(body.deckPrice?.setTaggedCardQty).toBe(3);
    expect(body.deckPrice?.setMatchedCardQty).toBe(2);
    expect(body.roleBreakdown?.ramp?.some((entry) => entry.name === "Sol Ring" && entry.qty === 2)).toBe(true);
    expect(body.roleBreakdown?.ramp?.some((entry) => entry.name === "Arcane Signet" && entry.qty === 1)).toBe(true);
    expect(body.tutorSummary?.trueTutors).toBe(0);
    expect(body.tutorSummary?.tutorSignals).toBe(0);
    expect(body.rulesEngine?.status).toBeDefined();
    expect(Array.isArray(body.rulesEngine?.rules)).toBe(true);
    expect(body.rulesEngine?.rules?.some((rule) => rule.id === "commander.deck-size-exactly-100")).toBe(true);
  }, 15000);

  it("reuses analyze cache for identical requests", async () => {
    const fetchDeckCardsMock = vi.fn(async () => ({
      knownCards: [
        {
          name: "Sol Ring",
          qty: 1,
          card: buildCard({
            name: "Sol Ring",
            set: "cmm",
            type_line: "Artifact",
            cmc: 1,
            mana_cost: "{1}",
            oracle_text: "{T}: Add {C}{C}.",
            prices: {
              usd: "1.50",
              usd_foil: null,
              usd_etched: null,
              tix: null
            }
          })
        },
        {
          name: "Arcane Signet",
          qty: 1,
          card: buildCard({
            name: "Arcane Signet",
            set: "clb",
            type_line: "Artifact",
            cmc: 2,
            mana_cost: "{2}",
            oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
            prices: {
              usd: "0.75",
              usd_foil: null,
              usd_etched: null,
              tix: null
            }
          })
        }
      ],
      unknownCards: []
    }));

    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: fetchDeckCardsMock,
      getCardById: vi.fn(async () => null),
      getCardByName: vi.fn(async () => null),
      getCardByNameWithSet: vi.fn(async () => null)
    }));

    const { POST } = await import("@/app/api/analyze/route");
    const payload = { decklist: "1 Sol Ring\n1 Arcane Signet" };
    const responseOne = await POST(buildRequest(payload));
    const responseTwo = await POST(buildRequest(payload));

    expect(responseOne.status).toBe(200);
    expect(responseTwo.status).toBe(200);
    expect(fetchDeckCardsMock).toHaveBeenCalledTimes(1);
  });

  it("returns opening hand simulation metrics", async () => {
    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: vi.fn(async () => ({
        knownCards: [
          {
            name: "Forest",
            qty: 35,
            card: buildCard({
              name: "Forest",
              type_line: "Basic Land - Forest",
              cmc: 0,
              mana_cost: "",
              oracle_text: "({T}: Add {G}.)"
            })
          },
          {
            name: "Arcane Signet",
            qty: 8,
            card: buildCard({
              name: "Arcane Signet",
              type_line: "Artifact",
              cmc: 2,
              mana_cost: "{2}",
              oracle_text: "{T}: Add one mana of any color in your commander's color identity."
            })
          },
          {
            name: "Cultivate",
            qty: 8,
            card: buildCard({
              name: "Cultivate",
              type_line: "Sorcery",
              cmc: 3,
              mana_cost: "{2}{G}",
              oracle_text:
                "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand."
            })
          }
        ],
        unknownCards: []
      })),
      getCardById: vi.fn(async () => null),
      getCardByName: vi.fn(async () =>
        buildCard({
          name: "Aesi, Tyrant of Gyre Strait",
          type_line: "Legendary Creature - Serpent",
          cmc: 6,
          mana_cost: "{4}{G}{U}",
          colors: ["G", "U"],
          color_identity: ["G", "U"]
        })
      ),
      getCardByNameWithSet: vi.fn(async () => null)
    }));

    const { POST } = await import("@/app/api/analyze/route");
    const response = await POST(
      buildRequest({
        decklist: "35 Forest\n8 Arcane Signet\n8 Cultivate",
        commanderName: "Aesi, Tyrant of Gyre Strait"
      })
    );
    const body = (await response.json()) as {
      openingHandSimulation?: {
        simulations?: number;
        playablePct?: number;
        deadPct?: number;
        rampInOpeningPct?: number;
        averageFirstSpellTurn?: number | null;
        estimatedCommanderCastTurn?: number | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.openingHandSimulation).toBeDefined();
    expect(body.openingHandSimulation?.simulations).toBeGreaterThanOrEqual(100);
    expect(body.openingHandSimulation?.playablePct).toBeGreaterThanOrEqual(0);
    expect(body.openingHandSimulation?.playablePct).toBeLessThanOrEqual(100);
    expect(body.openingHandSimulation?.deadPct).toBeGreaterThanOrEqual(0);
    expect(body.openingHandSimulation?.deadPct).toBeLessThanOrEqual(100);
    expect(body.openingHandSimulation?.rampInOpeningPct).toBeGreaterThanOrEqual(0);
    expect(body.openingHandSimulation?.rampInOpeningPct).toBeLessThanOrEqual(100);
    expect(body.openingHandSimulation?.averageFirstSpellTurn).not.toBeNull();
    expect(body.openingHandSimulation?.estimatedCommanderCastTurn).not.toBeNull();
  });

  it("applies set overrides from UI printing selection before lookup", async () => {
    const fetchDeckCardsMock = vi.fn(async () => ({
      knownCards: [
        {
          name: "Sol Ring",
          qty: 1,
          card: buildCard({
            name: "Sol Ring",
            set: "cmm",
            type_line: "Artifact",
            cmc: 1,
            mana_cost: "{1}",
            prices: {
              usd: "1.50",
              usd_foil: null,
              usd_etched: null,
              tix: null
            }
          })
        }
      ],
      unknownCards: []
    }));

    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: fetchDeckCardsMock,
      getCardById: vi.fn(async () => null),
      getCardByName: vi.fn(async () => null),
      getCardByNameWithSet: vi.fn(async () => null)
    }));

    const { POST } = await import("@/app/api/analyze/route");
    const response = await POST(
      buildRequest({
        decklist: "1 Sol Ring",
        deckPriceMode: "decklist-set",
        setOverrides: {
          "Sol Ring": {
            setCode: "CMM",
            printingId: "2f147b13-eda0-471e-b988-0ec8db13f5f8"
          }
        }
      })
    );

    expect(response.status).toBe(200);
    expect(fetchDeckCardsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Sol Ring",
          setCode: "cmm",
          printingId: "2f147b13-eda0-471e-b988-0ec8db13f5f8"
        })
      ]),
      8,
      { deckPriceMode: "decklist-set" }
    );
  });

  it("uses commander printing override for commander header art", async () => {
    const getCardByIdMock = vi.fn(async () =>
      buildCard({
        name: "Atraxa, Praetors' Voice",
        type_line: "Legendary Creature - Angel Horror",
        cmc: 4,
        mana_cost: "{G}{W}{U}{B}",
        colors: ["G", "W", "U", "B"],
        color_identity: ["G", "W", "U", "B"],
        image_uris: {
          art_crop: "https://img.test/atraxa-secret-lair-art.jpg"
        }
      })
    );

    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: vi.fn(async () => ({
        knownCards: [],
        unknownCards: []
      })),
      getCardById: getCardByIdMock,
      getCardByName: vi.fn(async () => null),
      getCardByNameWithSet: vi.fn(async () => null)
    }));

    const { POST } = await import("@/app/api/analyze/route");
    const response = await POST(
      buildRequest({
        decklist: "1 Sol Ring",
        deckPriceMode: "decklist-set",
        commanderName: "Atraxa, Praetors' Voice",
        setOverrides: {
          "Atraxa, Praetors' Voice": {
            setCode: "SLD",
            printingId: "test-printing-id-atraxa"
          }
        }
      })
    );
    const body = (await response.json()) as {
      commander?: {
        selectedArtUrl?: string | null;
        selectedPrintingId?: string | null;
      };
    };

    expect(response.status).toBe(200);
    expect(getCardByIdMock).toHaveBeenCalledWith("test-printing-id-atraxa");
    expect(body.commander?.selectedArtUrl).toBe("https://img.test/atraxa-secret-lair-art.jpg");
    expect(body.commander?.selectedPrintingId).toBe("test-printing-id-atraxa");
  });

  it("prioritizes commander printing override even when commander exists in known cards", async () => {
    const getCardByIdMock = vi.fn(async () =>
      buildCard({
        name: "Atraxa, Praetors' Voice",
        type_line: "Legendary Creature - Angel Horror",
        cmc: 4,
        mana_cost: "{G}{W}{U}{B}",
        colors: ["G", "W", "U", "B"],
        color_identity: ["G", "W", "U", "B"],
        image_uris: {
          art_crop: "https://img.test/atraxa-override-art.jpg",
          normal: "https://img.test/atraxa-override-card.jpg"
        }
      })
    );

    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: vi.fn(async () => ({
        knownCards: [
          {
            name: "Atraxa, Praetors' Voice",
            qty: 1,
            card: buildCard({
              name: "Atraxa, Praetors' Voice",
              type_line: "Legendary Creature - Angel Horror",
              cmc: 4,
              mana_cost: "{G}{W}{U}{B}",
              colors: ["G", "W", "U", "B"],
              color_identity: ["G", "W", "U", "B"],
              image_uris: {
                art_crop: "https://img.test/atraxa-default-art.jpg",
                normal: "https://img.test/atraxa-default-card.jpg"
              }
            })
          }
        ],
        unknownCards: []
      })),
      getCardById: getCardByIdMock,
      getCardByName: vi.fn(async () => null),
      getCardByNameWithSet: vi.fn(async () => null)
    }));

    const { POST } = await import("@/app/api/analyze/route");
    const response = await POST(
      buildRequest({
        decklist: "Commander\n1 Atraxa, Praetors' Voice\n1 Sol Ring",
        deckPriceMode: "decklist-set",
        setOverrides: {
          "Atraxa, Praetors' Voice": {
            setCode: "SLD",
            printingId: "override-printing-id"
          }
        }
      })
    );
    const body = (await response.json()) as {
      commander?: {
        selectedArtUrl?: string | null;
        selectedCardImageUrl?: string | null;
        selectedPrintingId?: string | null;
      };
    };

    expect(response.status).toBe(200);
    expect(getCardByIdMock).toHaveBeenCalledWith("override-printing-id");
    expect(body.commander?.selectedArtUrl).toBe("https://img.test/atraxa-override-art.jpg");
    expect(body.commander?.selectedCardImageUrl).toBe("https://img.test/atraxa-override-card.jpg");
    expect(body.commander?.selectedPrintingId).toBe("override-printing-id");
  });
});
