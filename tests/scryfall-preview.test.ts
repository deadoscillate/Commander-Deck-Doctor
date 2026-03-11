import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

describe("scryfall preview client loader", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
  });

  it("loads previews from the card-preview route and caches them", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        preview: {
          name: "Counterspell",
          scryfallId: "print-123",
          setCode: "dmr",
          setName: "Dominaria Remastered",
          collectorNumber: "55",
          releasedAt: null,
          imageUrl: "https://img.local/counterspell-normal.jpg",
          manaCost: "{U}{U}",
          typeLine: "Instant",
          prices: {
            usd: "2.10",
            usdFoil: null,
            usdEtched: null,
            tix: null
          }
        }
      })
    });

    const { getCardPreview } = await import("@/lib/scryfallPreview");
    const previewA = await getCardPreview("Counterspell", {
      setCode: "DMR",
      collectorNumber: "55",
      printingId: "print-123"
    });
    const previewB = await getCardPreview("Counterspell", {
      setCode: "DMR",
      collectorNumber: "55",
      printingId: "print-123"
    });

    expect(previewA?.name).toBe("Counterspell");
    expect(previewB?.setCode).toBe("dmr");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/card-preview?");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("name=Counterspell");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("set=DMR");
  });
});
