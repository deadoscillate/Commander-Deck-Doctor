import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/precons/route";

describe("GET /api/precons", () => {
  it("returns a summary list", async () => {
    const response = await GET(new Request("http://localhost/api/precons?limit=5"));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      meta: { totalDecks: number };
      items: Array<{ slug: string; name: string; commanderNames: string[] }>;
    };

    expect(payload.meta.totalDecks).toBeGreaterThan(0);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items[0]?.slug).toBeTruthy();
    expect(payload.items[0]?.name).toBeTruthy();
    expect(Array.isArray(payload.items[0]?.commanderNames)).toBe(true);
  });

  it("returns a full deck by slug", async () => {
    const listResponse = await GET(new Request("http://localhost/api/precons?limit=1"));
    const listPayload = (await listResponse.json()) as {
      items: Array<{ slug: string }>;
    };

    const slug = listPayload.items[0]?.slug;
    expect(slug).toBeTruthy();

    const detailResponse = await GET(
      new Request(`http://localhost/api/precons?slug=${encodeURIComponent(String(slug))}`)
    );

    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as {
      slug: string;
      name: string;
      decklist: string;
      commanderNames: string[];
    };

    expect(detail.slug).toBe(slug);
    expect(detail.name).toBeTruthy();
    expect(detail.decklist).toContain("Commander");
    expect(detail.decklist).toMatch(/\([A-Z0-9]{2,6}\)\s+[A-Z0-9/.-]+/);
    expect(detail.commanderNames.length).toBeGreaterThan(0);
  });

  it("filters precons by exact commander name", async () => {
    const response = await GET(
      new Request("http://localhost/api/precons?commander=Atraxa%2C%20Praetors'%20Voice&limit=50")
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{ commanderNames: string[]; displayCommanderNames: string[] }>;
    };

    expect(payload.items.length).toBeGreaterThan(0);
    expect(
      payload.items.every((item) =>
        [...item.commanderNames, ...item.displayCommanderNames].includes("Atraxa, Praetors' Voice")
      )
    ).toBe(true);
  });
});
