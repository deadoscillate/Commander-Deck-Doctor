import { afterEach, describe, expect, it, vi } from "vitest";

type MockScryfallCard = {
  object?: string;
  name: string;
  set: string;
  collector_number?: string;
  type_line?: string;
  cmc?: number;
  mana_cost?: string;
  colors?: string[];
  color_identity?: string[];
  oracle_text?: string;
  image_uris?: null;
  card_faces?: [];
  prices?: {
    usd: string | null;
    usd_foil: string | null;
    usd_etched: string | null;
    tix: string | null;
  };
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function toCard(name: string, setCode: string, collectorNumber = "1"): MockScryfallCard {
  return {
    object: "card",
    name,
    set: setCode,
    collector_number: collectorNumber,
    type_line: "Artifact",
    cmc: 2,
    mana_cost: "{2}",
    colors: [],
    color_identity: [],
    oracle_text: "",
    image_uris: null,
    card_faces: [],
    prices: {
      usd: "1.00",
      usd_foil: null,
      usd_etched: null,
      tix: null
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
  vi.unmock("@/lib/scryfallCardCacheStore");
});

describe("scryfall set-batch lookup", () => {
  it("resolves decklist-set cards through collection batch first", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/cards/collection")) {
        const body = JSON.parse(String(init?.body)) as {
          identifiers: Array<
            | { id: string }
            | { set: string; collector_number: string }
            | { name: string; set: string }
            | { name: string }
          >;
        };
        const collectorByName = new Map<string, string>([
          ["Arcane Signet", "237"],
          ["Mind Stone", "325"],
          ["Pearl Medallion", "401"]
        ]);
        const nameBySetCollector = new Map<string, string>([
          ["c20|237", "Arcane Signet"],
          ["clb|325", "Mind Stone"],
          ["cmm|401", "Pearl Medallion"]
        ]);

        return jsonResponse({
          object: "list",
          data: body.identifiers.map((identifier) => {
            if ("name" in identifier) {
              const setCode = "set" in identifier ? identifier.set : "c20";
              return toCard(
                identifier.name,
                setCode,
                collectorByName.get(identifier.name) ?? "1"
              );
            }

            if ("set" in identifier && "collector_number" in identifier) {
              const key = `${identifier.set}|${identifier.collector_number}`;
              return toCard(
                nameBySetCollector.get(key) ?? "Unknown",
                identifier.set,
                identifier.collector_number
              );
            }

            return toCard("Unknown", "set", "1");
          })
        });
      }

      return jsonResponse({ object: "error", code: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [
      { name: "Arcane Signet", qty: 1, setCode: "c20", collectorNumber: "237" },
      { name: "Mind Stone", qty: 1, setCode: "clb", collectorNumber: "325" },
      { name: "Pearl Medallion", qty: 1, setCode: "cmm", collectorNumber: "401" }
    ];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "decklist-set" });

    expect(result.knownCards).toHaveLength(3);
    expect(result.unknownCards).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/collection")).length
    ).toBe(1);
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it("falls back to named set lookup if collection batch fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/cards/collection")) {
        return jsonResponse({ object: "error", code: "rate_limited" }, 429);
      }

      if (url.includes("/cards/named")) {
        const parsed = new URL(url);
        const exactName = parsed.searchParams.get("exact") ?? "Unknown";
        const setCode = parsed.searchParams.get("set") ?? "set";
        return jsonResponse(toCard(exactName, setCode));
      }

      return jsonResponse({ object: "error", code: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [
      { name: "Arcane Signet", qty: 1, setCode: "c20" },
      { name: "Mind Stone", qty: 1, setCode: "clb" }
    ];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "decklist-set" });

    expect(result.knownCards).toHaveLength(2);
    expect(result.unknownCards).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/collection")).length
    ).toBe(2);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/named")).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("uses collection name batch in oracle-default mode before named fallback", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/cards/collection")) {
        const body = JSON.parse(String(init?.body)) as {
          identifiers: Array<{ name: string }>;
        };
        return jsonResponse({
          object: "list",
          data: body.identifiers.map((identifier) => toCard(identifier.name, "clb", "1"))
        });
      }

      if (url.includes("/cards/named")) {
        return jsonResponse({ object: "error", code: "unexpected_named_lookup" }, 500);
      }

      return jsonResponse({ object: "error", code: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [
      { name: "Arcane Signet", qty: 1 },
      { name: "Mind Stone", qty: 1 },
      { name: "Pearl Medallion", qty: 1 }
    ];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "oracle-default" });

    expect(result.knownCards).toHaveLength(3);
    expect(result.unknownCards).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/collection")).length
    ).toBe(1);
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/named")).length).toBe(0);
  });

  it("uses collection name fallback in decklist-set mode when set-specific rows are missing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/cards/collection")) {
        const body = JSON.parse(String(init?.body)) as {
          identifiers: Array<
            | { id: string }
            | { set: string; collector_number: string }
            | { name: string; set: string }
            | { name: string }
          >;
        };

        return jsonResponse({
          object: "list",
          data: body.identifiers
            .map((identifier) => {
              if ("name" in identifier && !("set" in identifier)) {
                return toCard(identifier.name, "clb", "1");
              }

              return { object: "error", code: "not_found" };
            })
            .filter((row) => row.object !== "error")
        });
      }

      if (url.includes("/cards/named")) {
        return jsonResponse({ object: "error", code: "unexpected_named_lookup" }, 500);
      }

      return jsonResponse({ object: "error", code: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [
      { name: "Arcane Signet", qty: 1, setCode: "c20" },
      { name: "Mind Stone", qty: 1, setCode: "clb" }
    ];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "decklist-set" });

    expect(result.knownCards).toHaveLength(2);
    expect(result.unknownCards).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/collection")).length
    ).toBe(2);
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/named")).length).toBe(0);
  });

  it("uses persistent card cache before network lookups", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ object: "error", code: "unexpected_network_lookup" }, 500)
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/lib/scryfallCardCacheStore", () => ({
      getCachedScryfallCards: vi.fn(async () =>
        new Map([
          ["name:arcanesignet", toCard("Arcane Signet", "c20", "237")]
        ])
      ),
      saveCachedScryfallCards: vi.fn(async () => {})
    }));

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [{ name: "Arcane Signet", qty: 1 }];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "oracle-default" });

    expect(result.knownCards).toHaveLength(1);
    expect(result.unknownCards).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
