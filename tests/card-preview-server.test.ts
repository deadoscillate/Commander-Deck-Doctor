import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

describe("card preview server resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
  });

  it("prefers a local print record for exact printing previews", async () => {
    vi.doMock("@/lib/scryfallLocalPrintIndexStore", () => ({
      getLocalPrintCardById: vi.fn(async () => ({
        id: "print-123",
        oracle_id: "oracle-123",
        name: "Counterspell",
        set: "dmr",
        collector_number: "55",
        type_line: "Instant",
        mana_cost: "{U}{U}",
        cmc: 2,
        colors: ["U"],
        color_identity: ["U"],
        oracle_text: "Counter target spell.",
        keywords: [],
        image_uris: {
          normal: "https://img.local/counterspell-normal.jpg"
        },
        card_faces: [],
        prices: {
          usd: "2.10",
          usd_foil: null,
          usd_etched: null,
          tix: null
        },
        purchase_uris: null
      })),
      getLocalPrintCardBySetCollector: vi.fn(async () => null),
      getLocalPrintCardByNameSet: vi.fn(async () => null),
      getLocalPrintCardByName: vi.fn(async () => null)
    }));
    vi.doMock("@/lib/scryfallLocalDefaultStore", () => ({
      getLocalDefaultCardByName: vi.fn(() => null)
    }));

    const { resolveCardPreview } = await import("@/lib/cardPreview.server");
    const preview = await resolveCardPreview("Counterspell", { printingId: "print-123" });

    expect(preview?.name).toBe("Counterspell");
    expect(preview?.setCode).toBe("dmr");
    expect(preview?.collectorNumber).toBe("55");
    expect(preview?.imageUrl).toBe("https://img.local/counterspell-normal.jpg");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers a local default paper card for name-only previews", async () => {
    vi.doMock("@/lib/scryfallLocalPrintIndexStore", () => ({
      getLocalPrintCardById: vi.fn(async () => null),
      getLocalPrintCardBySetCollector: vi.fn(async () => null),
      getLocalPrintCardByNameSet: vi.fn(async () => null),
      getLocalPrintCardByName: vi.fn(async () => null)
    }));
    vi.doMock("@/lib/scryfallLocalDefaultStore", () => ({
      getLocalDefaultCardByName: vi.fn(() => ({
        id: "paper-1",
        name: "Rhystic Study",
        set: "pc2",
        collector_number: "20",
        type_line: "Enchantment",
        cmc: 3,
        mana_cost: "{2}{U}",
        colors: ["U"],
        color_identity: ["U"],
        oracle_text: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
        image_uris: {
          normal: "https://img.local/rhystic-study.jpg"
        },
        card_faces: [],
        prices: {
          usd: "35.00",
          usd_foil: null,
          usd_etched: null,
          tix: null
        },
        purchase_uris: null
      }))
    }));

    const { resolveCardPreview } = await import("@/lib/cardPreview.server");
    const preview = await resolveCardPreview("Rhystic Study");

    expect(preview?.name).toBe("Rhystic Study");
    expect(preview?.setCode).toBe("pc2");
    expect(preview?.collectorNumber).toBe("20");
    expect(preview?.imageUrl).toBe("https://img.local/rhystic-study.jpg");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects digital fetch results when no exact digital printing was requested", async () => {
    vi.doMock("@/lib/scryfallLocalPrintIndexStore", () => ({
      getLocalPrintCardById: vi.fn(async () => null),
      getLocalPrintCardBySetCollector: vi.fn(async () => null),
      getLocalPrintCardByNameSet: vi.fn(async () => null),
      getLocalPrintCardByName: vi.fn(async () => null)
    }));
    vi.doMock("@/lib/scryfallLocalDefaultStore", () => ({
      getLocalDefaultCardByName: vi.fn(() => null)
    }));

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        object: "card",
        id: "alchemy-1",
        name: "Rahilda, Wanted Cutthroat",
        set: "YNEO",
        digital: true,
        collector_number: "42",
        image_uris: {
          normal: "https://img.local/alchemy.jpg"
        },
        prices: null
      })
    });

    const { resolveCardPreview } = await import("@/lib/cardPreview.server");
    const preview = await resolveCardPreview("Rahilda, Wanted Cutthroat");

    expect(preview).toBeNull();
  });
});
