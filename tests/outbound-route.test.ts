import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/outbound/route";

describe("GET /api/outbound", () => {
  it("redirects to a validated seller URL", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/outbound?seller=tcgplayer&target=https%3A%2F%2Fwww.tcgplayer.com%2Fproduct%2F123"
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.tcgplayer.com/product/123");
  });

  it("rejects invalid outbound targets", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/outbound?seller=cardkingdom&target=http%3A%2F%2Fexample.com"
      )
    );

    expect(response.status).toBe(400);
  });
});
