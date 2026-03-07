/* @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportButtons } from "@/components/ExportButtons";
import type { AnalyzeResponse } from "@/lib/contracts";

vi.mock("@/lib/reportText", () => ({
  buildPlaintextReport: vi.fn(() => "Mock Report")
}));

const MINIMAL_RESULT = {} as AnalyzeResponse;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("ExportButtons share flow", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts share payload and renders shared report link", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        hash: "abc123abc123abc123ab",
        path: "/report/abc123abc123abc123ab",
        url: "http://localhost/report/abc123abc123abc123ab"
      })
    );

    const user = userEvent.setup();
    render(<ExportButtons result={MINIMAL_RESULT} decklist="1 Sol Ring" />);
    await user.click(screen.getByRole("button", { name: "Share Deck Report" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));
    expect(url).toBe("/api/share-report");
    expect(payload.decklist).toBe("1 Sol Ring");
    expect(payload.analysis).toBeTruthy();

    const shareLink = await screen.findByRole("link", { name: "Open shared report" });
    expect(shareLink.getAttribute("href")).toBe("http://localhost/report/abc123abc123abc123ab");
  });

  it("shows share error feedback when API returns non-200", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Share failed." }, 500));

    const user = userEvent.setup();
    render(<ExportButtons result={MINIMAL_RESULT} decklist="1 Sol Ring" />);
    await user.click(screen.getByRole("button", { name: "Share Deck Report" }));

    expect(await screen.findByText("Share failed.")).toBeTruthy();
  });
});

