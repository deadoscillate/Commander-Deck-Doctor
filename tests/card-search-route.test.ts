import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/card-search/route";

describe("GET /api/card-search", () => {
  it("returns available set dropdown options", async () => {
    const response = await GET(new Request("http://localhost/api/card-search?meta=sets"));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { items: string[] };

    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items).toContain("CLB");
  });

  it("returns commander-only results with legal pair metadata", async () => {
    const response = await GET(
      new Request("http://localhost/api/card-search?q=Tymna&commanderOnly=1&includePairs=1&limit=5")
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{
        name: string;
        commanderEligible: boolean;
        pairOptions?: Array<{ name: string; pairType: string }>;
      }>;
    };

    expect(payload.items.length).toBeGreaterThan(0);
    const tymna = payload.items.find((item) => item.name === "Tymna the Weaver");
    expect(tymna?.commanderEligible).toBe(true);
    expect(
      tymna?.pairOptions?.some(
        (option) => option.name === "Thrasios, Triton Hero" && option.pairType === "partner"
      )
    ).toBe(true);
    expect(response.headers.get("x-card-search-kind")).toBe("commander-search");
    expect(response.headers.get("x-card-search-results")).toBeTruthy();
    expect(response.headers.get("x-card-search-total-ms")).toBeTruthy();
  });

  it("respects exact color identity filters for commander search", async () => {
    const response = await GET(
      new Request("http://localhost/api/card-search?commanderOnly=1&colors=G,U&q=Edric&limit=10")
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{ name: string; colorIdentity: string[] }>;
    };

    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items.some((item) => item.name === "Edric, Spymaster of Trest")).toBe(true);
    expect(payload.items.every((item) => item.colorIdentity.join(",") === "G,U")).toBe(true);
  });

  it("filters card results to the allowed commander color identity", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/card-search?q=Counterspell&allowedColors=G,U&limit=10"
      )
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{ name: string; colorIdentity: string[] }>;
    };

    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items.some((item) => item.name === "Counterspell")).toBe(true);
    expect(
      payload.items.every((item) => item.colorIdentity.every((color) => ["G", "U"].includes(color)))
    ).toBe(true);
  });

  it("supports browsing by set and type", async () => {
    const response = await GET(
      new Request("http://localhost/api/card-search?set=CLB&type=creature&q=Jon&limit=10")
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{
        name: string;
        setCode: string | null;
        collectorNumber: string | null;
        printingId: string | null;
        typeLine: string;
      }>;
    };

    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items.some((item) => item.name === "Jon Irenicus, Shattered One")).toBe(true);
    expect(payload.items.every((item) => item.setCode === "CLB")).toBe(true);
    expect(payload.items.every((item) => Boolean(item.collectorNumber))).toBe(true);
    expect(payload.items.every((item) => Boolean(item.printingId))).toBe(true);
    expect(payload.items.every((item) => item.typeLine.toLowerCase().includes("creature"))).toBe(true);
  });

  it("uses the full print library for set-specific reprint browsing", async () => {
    const response = await GET(
      new Request("http://localhost/api/card-search?set=CMM&q=Sol%20Ring&limit=10")
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{ name: string; setCode: string | null; collectorNumber: string | null; printingId: string | null }>;
    };

    expect(payload.items.some((item) => item.name === "Sol Ring")).toBe(true);
    expect(payload.items.every((item) => item.setCode === "CMM")).toBe(true);
    expect(payload.items.every((item) => Boolean(item.collectorNumber))).toBe(true);
    expect(payload.items.every((item) => Boolean(item.printingId))).toBe(true);
  });

  it("supports exact name lookup via POST", async () => {
    const response = await POST(
      new Request("http://localhost/api/card-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          names: ["Sol Ring", "Counterspell"],
          allowedColors: ["U"],
          commanderOnly: false
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      count: number;
      items: Array<{ name: string }>;
    };

    expect(payload.count).toBe(2);
    expect(payload.items.map((item) => item.name)).toEqual(["Sol Ring", "Counterspell"]);
    expect(response.headers.get("x-card-search-kind")).toBe("card-lookup");
  });

  it("resolves Edric-style suggestion cards to full card records", async () => {
    const response = await POST(
      new Request("http://localhost/api/card-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          names: ["Reconnaissance Mission", "Tetsuko Umezawa, Fugitive"],
          allowedColors: ["G", "U"],
          commanderOnly: false
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      count: number;
      items: Array<{
        name: string;
        setCode: string | null;
        collectorNumber: string | null;
        printingId: string | null;
        previewImageUrl: string | null;
        typeLine: string;
      }>;
    };

    expect(payload.count).toBe(2);
    expect(payload.items.every((item) => Boolean(item.setCode))).toBe(true);
    expect(payload.items.every((item) => Boolean(item.collectorNumber))).toBe(true);
    expect(payload.items.every((item) => Boolean(item.printingId))).toBe(true);
    expect(payload.items.every((item) => Boolean(item.previewImageUrl))).toBe(true);
    expect(payload.items.some((item) => item.name === "Reconnaissance Mission")).toBe(true);
    expect(payload.items.some((item) => item.name === "Tetsuko Umezawa, Fugitive")).toBe(true);
  });
});
