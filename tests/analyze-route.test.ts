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
    };

    expect(response.status).toBe(200);
    expect(body.deckPrice?.totals?.usd).toBe(3.75);
    expect(body.deckPrice?.totals?.usdFoil).toBe(13.2);
    expect(body.deckPrice?.totals?.tix).toBe(0.08);
    expect(body.deckPrice?.pricedCardQty?.usd).toBe(3);
    expect(body.deckPrice?.totalKnownCardQty).toBe(3);
  });
});

