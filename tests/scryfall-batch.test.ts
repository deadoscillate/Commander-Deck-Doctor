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
  vi.unmock("@/lib/scryfallLocalDefaultStore");
  vi.unmock("@/lib/scryfallLocalPrintIndexStore");
  vi.unmock("@/engine/cards/CardDatabase");
});

function mockEmptyLocalDefaultStore(): void {
  vi.doMock("@/lib/scryfallLocalDefaultStore", () => ({
    getLocalDefaultCardByName: vi.fn(() => null),
    getLocalDefaultCardsByNames: vi.fn(() => new Map())
  }));
}

function mockEmptyLocalPrintIndexStore(): void {
  vi.doMock("@/lib/scryfallLocalPrintIndexStore", () => ({
    getLocalPrintCardById: vi.fn(() => null),
    getLocalPrintCardByName: vi.fn(async () => null),
    getLocalPrintCardsByNames: vi.fn(async () => new Map()),
    getLocalPrintCardsByIds: vi.fn(async () => new Map()),
    getLocalPrintCardBySetCollector: vi.fn(() => null),
    getLocalPrintCardsBySetCollectors: vi.fn(async () => new Map()),
    getLocalPrintCardByNameSet: vi.fn(() => null),
    getLocalPrintCardsByNameSets: vi.fn(async () => new Map())
  }));
}

describe("scryfall set-batch lookup", () => {
  it("resolves decklist-set cards through collection batch first", async () => {
    mockEmptyLocalDefaultStore();
    mockEmptyLocalPrintIndexStore();
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
    mockEmptyLocalDefaultStore();
    mockEmptyLocalPrintIndexStore();
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
    mockEmptyLocalDefaultStore();
    mockEmptyLocalPrintIndexStore();
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
    mockEmptyLocalDefaultStore();
    mockEmptyLocalPrintIndexStore();
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
    mockEmptyLocalDefaultStore();
    mockEmptyLocalPrintIndexStore();
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

  it("uses local print index before live network lookups in decklist-set mode", async () => {
    mockEmptyLocalDefaultStore();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ object: "error", code: "unexpected_network_lookup" }, 500)
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/lib/scryfallLocalPrintIndexStore", () => ({
      getLocalPrintCardById: vi.fn(() => null),
      getLocalPrintCardByName: vi.fn(async () => null),
      getLocalPrintCardsByNames: vi.fn(async () => new Map()),
      getLocalPrintCardsByIds: vi.fn(async () => new Map()),
      getLocalPrintCardBySetCollector: vi.fn((setCode: string, collectorNumber: string) =>
        setCode === "c20" && collectorNumber === "237"
          ? {
              id: "print-arcane-signet-c20-237",
              oracle_id: "oracle-arcane-signet",
              name: "Arcane Signet",
              set: "c20",
              collector_number: "237",
              image_uris: null,
              card_faces: [],
              prices: {
                usd: "1.99",
                usd_foil: null,
                usd_etched: null,
                tix: null
              },
              purchase_uris: null
            }
          : null
      ),
      getLocalPrintCardsBySetCollectors: vi.fn(async (lookups: Array<{ setCode: string; collectorNumber: string }>) =>
        new Map(
          lookups
            .filter((lookup) => lookup.setCode === "c20" && lookup.collectorNumber === "237")
            .map((lookup) => [
              `set:${lookup.setCode}|collector:${lookup.collectorNumber}`,
              {
                id: "print-arcane-signet-c20-237",
                oracle_id: "oracle-arcane-signet",
                name: "Arcane Signet",
                set: "c20",
                collector_number: "237",
                image_uris: null,
                card_faces: [],
                prices: {
                  usd: "1.99",
                  usd_foil: null,
                  usd_etched: null,
                  tix: null
                },
                purchase_uris: null
              }
            ])
        )
      ),
      getLocalPrintCardByNameSet: vi.fn(() => null),
      getLocalPrintCardsByNameSets: vi.fn(async () => new Map())
    }));
    vi.doMock("@/engine/cards/CardDatabase", () => ({
      CardDatabase: {
        loadFromCompiledFile: vi.fn(() => ({
          getCardByOracleId: vi.fn((oracleId: string) =>
            oracleId === "oracle-arcane-signet"
              ? {
                  oracleId: "oracle-arcane-signet",
                  name: "Arcane Signet",
                  faces: [],
                  manaCost: "{2}",
                  mv: 2,
                  typeLine: "Artifact",
                  parsedTypeLine: { supertypes: [], types: ["Artifact"], subtypes: [] },
                  colors: [],
                  colorIdentity: [],
                  oracleText: "{T}: Add one mana of any color in your commander's color identity.",
                  keywords: [],
                  power: null,
                  toughness: null,
                  loyalty: null,
                  legalities: { commander: "legal" }
                }
              : null
          ),
          getCardByName: vi.fn(() => null)
        })),
        createWithEngineSet: vi.fn(() => ({
          getCardByOracleId: vi.fn(() => null),
          getCardByName: vi.fn(() => null)
        }))
      }
    }));

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [{ name: "Arcane Signet", qty: 1, setCode: "c20", collectorNumber: "237" }];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "decklist-set" });

    expect(result.knownCards).toHaveLength(1);
    expect(result.knownCards[0]?.card.set).toBe("c20");
    expect(result.knownCards[0]?.card.collector_number).toBe("237");
    expect(result.knownCards[0]?.card.prices?.usd).toBe("1.99");
    expect(result.unknownCards).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("uses local default card data before live network lookups in oracle-default mode", async () => {
    mockEmptyLocalPrintIndexStore();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ object: "error", code: "unexpected_network_lookup" }, 500)
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/lib/scryfallLocalDefaultStore", () => ({
      getLocalDefaultCardByName: vi.fn((name: string) =>
        name === "Arcane Signet" ? toCard("Arcane Signet", "c20", "237") : null
      ),
      getLocalDefaultCardsByNames: vi.fn((names: string[]) => {
        const rows = new Map();
        for (const name of names) {
          if (name === "Arcane Signet") {
            rows.set("name:arcanesignet", toCard("Arcane Signet", "c20", "237"));
          }
        }
        return rows;
      })
    }));

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [{ name: "Arcane Signet", qty: 1 }];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "oracle-default" });

    expect(result.knownCards).toHaveLength(1);
    expect(result.knownCards[0]?.card.name).toBe("Arcane Signet");
    expect(result.knownCards[0]?.card.prices?.usd).toBe("1.00");
    expect(result.unknownCards).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("prefers exact local print pricing over default-name pricing in oracle-default mode when print tags are present", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ object: "error", code: "unexpected_network_lookup" }, 500)
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/lib/scryfallLocalDefaultStore", () => ({
      getLocalDefaultCardByName: vi.fn((name: string) =>
        name === "Sol Ring" ? toCard("Sol Ring", "c20", "241") : null
      ),
      getLocalDefaultCardsByNames: vi.fn((names: string[]) => {
        const rows = new Map();
        for (const name of names) {
          if (name === "Sol Ring") {
            rows.set("name:solring", toCard("Sol Ring", "c20", "241"));
          }
        }
        return rows;
      })
    }));
    vi.doMock("@/lib/scryfallLocalPrintIndexStore", () => ({
      getLocalPrintCardById: vi.fn(async () => null),
      getLocalPrintCardByName: vi.fn(async () => null),
      getLocalPrintCardsByNames: vi.fn(async () => new Map()),
      getLocalPrintCardsByIds: vi.fn(async () => new Map()),
      getLocalPrintCardBySetCollector: vi.fn(async (setCode: string, collectorNumber: string) =>
        setCode === "cmm" && collectorNumber === "217"
          ? {
              id: "print-sol-ring-cmm-217",
              oracle_id: "oracle-sol-ring",
              name: "Sol Ring",
              set: "cmm",
              collector_number: "217",
              image_uris: null,
              card_faces: [],
              prices: {
                usd: "1.99",
                usd_foil: "8.00",
                usd_etched: null,
                tix: null
              },
              purchase_uris: {
                tcgplayer: "https://shop.test/tcgplayer/sol-ring-cmm-217",
                cardkingdom: "https://shop.test/cardkingdom/sol-ring-cmm-217"
              }
            }
          : null
      ),
      getLocalPrintCardsBySetCollectors: vi.fn(async (lookups: Array<{ setCode: string; collectorNumber: string }>) =>
        new Map(
          lookups
            .filter((lookup) => lookup.setCode === "cmm" && lookup.collectorNumber === "217")
            .map((lookup) => [
              `set:${lookup.setCode}|collector:${lookup.collectorNumber}`,
              {
                id: "print-sol-ring-cmm-217",
                oracle_id: "oracle-sol-ring",
                name: "Sol Ring",
                set: "cmm",
                collector_number: "217",
                image_uris: null,
                card_faces: [],
                prices: {
                  usd: "1.99",
                  usd_foil: "8.00",
                  usd_etched: null,
                  tix: null
                },
                purchase_uris: {
                  tcgplayer: "https://shop.test/tcgplayer/sol-ring-cmm-217",
                  cardkingdom: "https://shop.test/cardkingdom/sol-ring-cmm-217"
                }
              }
            ])
        )
      ),
      getLocalPrintCardByNameSet: vi.fn(async () => null),
      getLocalPrintCardsByNameSets: vi.fn(async () => new Map())
    }));
    vi.doMock("@/engine/cards/CardDatabase", () => ({
      CardDatabase: {
        loadFromCompiledFile: vi.fn(() => ({
          getCardByOracleId: vi.fn((oracleId: string) =>
            oracleId === "oracle-sol-ring"
              ? {
                  oracleId: "oracle-sol-ring",
                  name: "Sol Ring",
                  faces: [],
                  manaCost: "{1}",
                  mv: 1,
                  typeLine: "Artifact",
                  parsedTypeLine: { supertypes: [], types: ["Artifact"], subtypes: [] },
                  colors: [],
                  colorIdentity: [],
                  oracleText: "{T}: Add {C}{C}.",
                  keywords: [],
                  power: null,
                  toughness: null,
                  loyalty: null,
                  legalities: { commander: "legal" }
                }
              : null
          ),
          getCardByName: vi.fn(() => null)
        })),
        createWithEngineSet: vi.fn(() => ({
          getCardByOracleId: vi.fn(() => null),
          getCardByName: vi.fn(() => null)
        }))
      }
    }));

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [{ name: "Sol Ring", qty: 1, setCode: "cmm", collectorNumber: "217" }];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "oracle-default" });

    expect(result.knownCards).toHaveLength(1);
    expect(result.knownCards[0]?.card.set).toBe("cmm");
    expect(result.knownCards[0]?.card.collector_number).toBe("217");
    expect(result.knownCards[0]?.card.prices?.usd).toBe("1.99");
    expect(result.knownCards[0]?.card.purchase_uris?.cardkingdom).toBe(
      "https://shop.test/cardkingdom/sol-ring-cmm-217"
    );
    expect(result.knownCards[0]?.priceMatch).toBe("exact-print");
    expect(result.unknownCards).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("keeps set-only oracle-default lookups on the default-name path when local coverage exists", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ object: "error", code: "unexpected_network_lookup" }, 500)
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/lib/scryfallLocalDefaultStore", () => ({
      getLocalDefaultCardByName: vi.fn((name: string) =>
        name === "Sol Ring" ? toCard("Sol Ring", "c20", "241") : null
      ),
      getLocalDefaultCardsByNames: vi.fn((names: string[]) => {
        const rows = new Map();
        for (const name of names) {
          if (name === "Sol Ring") {
            rows.set("name:solring", toCard("Sol Ring", "c20", "241"));
          }
        }
        return rows;
      })
    }));
    mockEmptyLocalPrintIndexStore();

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [{ name: "Sol Ring", qty: 1, setCode: "cmm" }];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "oracle-default" });

    expect(result.knownCards).toHaveLength(1);
    expect(result.unknownCards).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("uses collection batch only for oracle-default cards missing from the local default store", async () => {
    mockEmptyLocalPrintIndexStore();
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

      return jsonResponse({ object: "error", code: "unexpected_lookup" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/lib/scryfallLocalDefaultStore", () => ({
      getLocalDefaultCardByName: vi.fn((name: string) =>
        name === "Arcane Signet" ? toCard("Arcane Signet", "c20", "237") : null
      ),
      getLocalDefaultCardsByNames: vi.fn((names: string[]) => {
        const rows = new Map();
        for (const name of names) {
          if (name === "Arcane Signet") {
            rows.set("name:arcanesignet", toCard("Arcane Signet", "c20", "237"));
          }
        }
        return rows;
      })
    }));

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [
      { name: "Arcane Signet", qty: 1 },
      { name: "Mind Stone", qty: 1 }
    ];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "oracle-default" });

    expect(result.knownCards).toHaveLength(2);
    expect(result.unknownCards).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/collection")).length
    ).toBe(1);
    const collectionBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      identifiers: Array<{ name: string }>;
    };
    expect(collectionBody.identifiers).toEqual([{ name: "Mind Stone" }]);
  });

  it("uses local oracle fallback before named lookup when collection misses in oracle-default mode", async () => {
    mockEmptyLocalDefaultStore();
    mockEmptyLocalPrintIndexStore();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/cards/collection")) {
        return jsonResponse({ object: "error", code: "rate_limited" }, 429);
      }

      if (url.includes("/cards/named")) {
        return jsonResponse({ object: "error", code: "unexpected_named_lookup" }, 500);
      }

      return jsonResponse({ object: "error", code: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/engine/cards/CardDatabase", () => ({
      CardDatabase: {
        loadFromCompiledFile: vi.fn(() => ({
          getCardByName: (name: string) =>
            name === "Arcane Signet"
              ? {
                  oracleId: "oracle-arcane-signet",
                  name: "Arcane Signet",
                  faces: [],
                  manaCost: "{2}",
                  mv: 2,
                  typeLine: "Artifact",
                  parsedTypeLine: { supertypes: [], types: ["Artifact"], subtypes: [] },
                  colors: [],
                  colorIdentity: [],
                  oracleText: "{T}: Add one mana of any color in your commander's color identity.",
                  keywords: [],
                  power: null,
                  toughness: null,
                  loyalty: null,
                  legalities: { commander: "legal" }
                }
              : null
        })),
        createWithEngineSet: vi.fn(() => ({
          getCardByName: () => null
        }))
      }
    }));

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [{ name: "Arcane Signet", qty: 1 }];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "oracle-default" });

    expect(result.knownCards).toHaveLength(1);
    expect(result.knownCards[0]?.card.name).toBe("Arcane Signet");
    expect(result.unknownCards).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/named")).length
    ).toBe(0);
  });

  it("uses local print fallback before loading oracle fallback when default data misses in oracle-default mode", async () => {
    mockEmptyLocalDefaultStore();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/cards/collection")) {
        return jsonResponse({ object: "error", code: "rate_limited" }, 429);
      }

      if (url.includes("/cards/named")) {
        return jsonResponse({ object: "error", code: "unexpected_named_lookup" }, 500);
      }

      return jsonResponse({ object: "error", code: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/lib/scryfallLocalPrintIndexStore", () => ({
      getLocalPrintCardById: vi.fn(async () => null),
      getLocalPrintCardByName: vi.fn(async (name: string) =>
        name === "Elessar, the Elfstone"
          ? {
              id: "print-elessar-the-elfstone",
              oracle_id: "oracle-elessar-the-elfstone",
              name: "Elessar, the Elfstone",
              set: "ltc",
              collector_number: "349",
              type_line: "Legendary Artifact",
              cmc: 2,
              mana_cost: "{1}{W}",
              colors: ["W"],
              color_identity: ["W"],
              oracle_text: "Whenever a legendary creature enters the battlefield under your control, draw a card.",
              keywords: [],
              image_uris: null,
              card_faces: [],
              prices: {
                usd: "0.65",
                usd_foil: null,
                usd_etched: null,
                tix: null
              },
              purchase_uris: null
            }
          : null
      ),
      getLocalPrintCardsByNames: vi.fn(async (names: string[]) =>
        new Map(
          names
            .filter((name) => name === "Elessar, the Elfstone")
            .map((name) => [
              "name:elessartheelfstone",
              {
                id: "print-elessar-the-elfstone",
                oracle_id: "oracle-elessar-the-elfstone",
                name,
                set: "ltc",
                collector_number: "349",
                type_line: "Legendary Artifact",
                cmc: 2,
                mana_cost: "{1}{W}",
                colors: ["W"],
                color_identity: ["W"],
                oracle_text: "Whenever a legendary creature enters the battlefield under your control, draw a card.",
                keywords: [],
                image_uris: null,
                card_faces: [],
                prices: {
                  usd: "0.65",
                  usd_foil: null,
                  usd_etched: null,
                  tix: null
                },
                purchase_uris: null
              }
            ])
        )
      ),
      getLocalPrintCardsByIds: vi.fn(async () => new Map()),
      getLocalPrintCardBySetCollector: vi.fn(async () => null),
      getLocalPrintCardsBySetCollectors: vi.fn(async () => new Map()),
      getLocalPrintCardByNameSet: vi.fn(async () => null),
      getLocalPrintCardsByNameSets: vi.fn(async () => new Map())
    }));
    vi.doMock("@/engine/cards/CardDatabase", () => ({
      CardDatabase: {
        loadFromCompiledFile: vi.fn(() => {
          throw new Error("unexpected_oracle_load");
        }),
        createWithEngineSet: vi.fn(() => {
          throw new Error("unexpected_oracle_load");
        })
      }
    }));

    const { fetchDeckCards } = await import("@/lib/scryfall");
    const parsedDeck = [{ name: "Elessar, the Elfstone", qty: 1 }];

    const result = await fetchDeckCards(parsedDeck, 8, { deckPriceMode: "oracle-default" });

    expect(result.knownCards).toHaveLength(1);
    expect(result.knownCards[0]?.card.name).toBe("Elessar, the Elfstone");
    expect(result.unknownCards).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("/cards/named")).length
    ).toBe(0);
  });
});
