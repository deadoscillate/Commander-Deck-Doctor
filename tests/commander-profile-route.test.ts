import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/commander-profile/route";

describe("GET /api/commander-profile", () => {
  it("returns curated commander profiles first", async () => {
    const response = await GET(
      new Request("http://localhost/api/commander-profile?name=Edric%2C%20Spymaster%20of%20Trest")
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      source: string;
      profile: { groups: Array<{ key: string }> } | null;
    };

    expect(payload.source).toBe("curated");
    expect(payload.profile?.groups.some((group) => group.key === "edric-evasion")).toBe(true);
  });

  it("returns generated profiles when there is no curated override", async () => {
    const response = await GET(
      new Request("http://localhost/api/commander-profile?name=Aang%2C%20Air%20Nomad")
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      source: string;
      profile: { groups: Array<{ key: string }> } | null;
    };

    expect(payload.source).toBe("generated");
    expect(Array.isArray(payload.profile?.groups)).toBe(true);
  });

  it("rejects empty commander names", async () => {
    const response = await GET(new Request("http://localhost/api/commander-profile?name="));

    expect(response.status).toBe(400);
  });
});

