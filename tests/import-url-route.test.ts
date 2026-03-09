import { afterEach, describe, expect, it, vi } from "vitest";

function buildRequest(payload: unknown): Request {
  return new Request("http://localhost/api/import-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("import-url route", () => {
  it("returns Archidekt-only unsupported URL guidance", async () => {
    const { POST } = await import("@/app/api/import-url/route");
    const response = await POST(buildRequest({ url: "https://www.moxfield.com/decks/example" }));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Unsupported URL. Use an Archidekt deck link.");
  });
});
