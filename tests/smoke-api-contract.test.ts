import { afterEach, describe, expect, it, vi } from "vitest";

function buildRequest(pathname: string, payload: unknown): Request {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("smoke API contracts", () => {
  it("analyze returns 400 decklist-required message", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const response = await POST(buildRequest("/api/analyze", {}));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Decklist is required.");
  });

  it("import-url returns 400 url-required message", async () => {
    const { POST } = await import("@/app/api/import-url/route");
    const response = await POST(buildRequest("/api/import-url", {}));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Deck URL is required.");
  });

  it("share-report returns 400 decklist-required message", async () => {
    const { POST } = await import("@/app/api/share-report/route");
    const response = await POST(buildRequest("/api/share-report", { decklist: "" }));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Decklist is required for sharing.");
  });
});
