import { afterEach, describe, expect, it, vi } from "vitest";

const archidektPayload = {
  name: "Edric Flyers",
  categories: [
    { name: "Commander", includedInDeck: true },
    { name: "Mainboard", includedInDeck: true },
    { name: "Maybeboard", includedInDeck: false }
  ],
  cards: [
    {
      quantity: 1,
      categories: [{ name: "Commander" }],
      card: {
        oracleCard: { name: "Edric, Spymaster of Trest" },
        edition: { editioncode: "otc" },
        collectorNumber: "221"
      }
    },
    {
      quantity: 1,
      categories: [{ name: "Mainboard" }],
      card: {
        oracleCard: { name: "Sol Ring" },
        edition: { editioncode: "cmm" },
        collectorNumber: "217"
      }
    },
    {
      quantity: 1,
      categories: [{ name: "Maybeboard" }],
      card: {
        oracleCard: { name: "Counterspell" },
        edition: { editioncode: "cmm" },
        collectorNumber: "81"
      }
    }
  ]
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("deck URL import", () => {
  it("imports Archidekt decks as print-aware decklists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(archidektPayload), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { importDeckFromUrl } = await import("@/lib/deckUrlImport");
    const result = await importDeckFromUrl("https://archidekt.com/decks/8976321/edric-flyers");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://archidekt.com/api/decks/8976321/",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.provider).toBe("archidekt");
    expect(result.providerDeckId).toBe("8976321");
    expect(result.deckName).toBe("Edric Flyers");
    expect(result.cardCount).toBe(2);
    expect(result.commanderCount).toBe(1);
    expect(result.decklist).toContain("Commander\n1 Edric, Spymaster of Trest (OTC) 221");
    expect(result.decklist).toContain("Deck\n1 Sol Ring (CMM) 217");
    expect(result.decklist).not.toContain("Counterspell");
  });

  it("rejects unsupported providers", async () => {
    const { importDeckFromUrl } = await import("@/lib/deckUrlImport");

    await expect(
      importDeckFromUrl("https://www.moxfield.com/decks/example")
    ).rejects.toThrow("Unsupported deck URL. Supported provider: Archidekt.");
  });
});
