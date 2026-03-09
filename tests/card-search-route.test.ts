import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/card-search/route";

describe("GET /api/card-search", () => {
  it("returns commander-only results with legal pair metadata", async () => {
    const response = await GET(
      new Request("http://localhost/api/card-search?q=Tymna&commanderOnly=1&limit=5")
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
  });
});
