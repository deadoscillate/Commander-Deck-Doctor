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
  });

  it("returns controlled 500 when analysis dependency throws", async () => {
    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: vi.fn(async () => {
        throw new Error("synthetic failure");
      }),
      getCardByName: vi.fn(async () => null)
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
    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: vi.fn(async () => ({
        knownCards: [
          {
            name: "Sol Ring",
            qty: 2,
            card: buildCard({
              name: "Sol Ring",
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
      })),
      getCardByName: vi.fn(async () => null)
    }));

    const { POST } = await import("@/app/api/analyze/route");
    const response = await POST(
      buildRequest({
        decklist: "2 Sol Ring\n1 Arcane Signet"
      })
    );
    const body = (await response.json()) as {
      deckPrice?: {
        totals?: { usd?: number | null; usdFoil?: number | null; tix?: number | null };
        pricedCardQty?: { usd?: number };
        totalKnownCardQty?: number;
      };
      roleBreakdown?: {
        ramp?: Array<{ name?: string; qty?: number }>;
      };
      rulesEngine?: {
        status?: string;
        rules?: Array<{ id?: string; outcome?: string }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.deckPrice?.totals?.usd).toBe(3.75);
    expect(body.deckPrice?.totals?.usdFoil).toBe(13.2);
    expect(body.deckPrice?.totals?.tix).toBe(0.08);
    expect(body.deckPrice?.pricedCardQty?.usd).toBe(3);
    expect(body.deckPrice?.totalKnownCardQty).toBe(3);
    expect(body.roleBreakdown?.ramp?.some((entry) => entry.name === "Sol Ring" && entry.qty === 2)).toBe(true);
    expect(body.roleBreakdown?.ramp?.some((entry) => entry.name === "Arcane Signet" && entry.qty === 1)).toBe(true);
    expect(body.rulesEngine?.status).toBeDefined();
    expect(Array.isArray(body.rulesEngine?.rules)).toBe(true);
    expect(body.rulesEngine?.rules?.some((rule) => rule.id === "commander.deck-size-exactly-100")).toBe(true);
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
      getCardByName: vi.fn(async () =>
        buildCard({
          name: "Aesi, Tyrant of Gyre Strait",
          type_line: "Legendary Creature - Serpent",
          cmc: 6,
          mana_cost: "{4}{G}{U}",
          colors: ["G", "U"],
          color_identity: ["G", "U"]
        })
      )
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
    expect(body.openingHandSimulation?.simulations).toBe(1000);
    expect(body.openingHandSimulation?.playablePct).toBeGreaterThanOrEqual(0);
    expect(body.openingHandSimulation?.playablePct).toBeLessThanOrEqual(100);
    expect(body.openingHandSimulation?.deadPct).toBeGreaterThanOrEqual(0);
    expect(body.openingHandSimulation?.deadPct).toBeLessThanOrEqual(100);
    expect(body.openingHandSimulation?.rampInOpeningPct).toBeGreaterThanOrEqual(0);
    expect(body.openingHandSimulation?.rampInOpeningPct).toBeLessThanOrEqual(100);
    expect(body.openingHandSimulation?.averageFirstSpellTurn).not.toBeNull();
    expect(body.openingHandSimulation?.estimatedCommanderCastTurn).not.toBeNull();
  });
});
