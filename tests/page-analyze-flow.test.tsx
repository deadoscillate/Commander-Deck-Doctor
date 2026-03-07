/* @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function MockAnalysisReport(props: { result: { commander?: { selectedName?: string | null } } }) {
  return <div data-testid="analysis-report">{props.result?.commander?.selectedName ?? "none"}</div>;
}

function MockExportButtons() {
  return <div data-testid="export-buttons" />;
}

vi.mock("@/components/AnalysisReport", () => ({
  AnalysisReport: MockAnalysisReport
}));

vi.mock("@/components/ExportButtons", () => ({
  ExportButtons: MockExportButtons
}));

function createAnalyzeResponse(overrides: Record<string, unknown> = {}) {
  const base = {
    schemaVersion: "1.0",
    commander: {
      detectedFromSection: null,
      selectedName: null,
      selectedColorIdentity: [],
      selectedManaCost: null,
      selectedCmc: null,
      selectedArtUrl: null,
      selectedCardImageUrl: null,
      selectedSetCode: null,
      selectedCollectorNumber: null,
      selectedPrintingId: null,
      source: "none",
      needsManualSelection: true,
      options: [
        {
          name: "Atraxa, Praetors' Voice",
          colorIdentity: ["W", "U", "B", "G"]
        }
      ]
    }
  };

  const commanderOverride =
    overrides.commander && typeof overrides.commander === "object"
      ? (overrides.commander as Record<string, unknown>)
      : {};

  return {
    ...base,
    ...overrides,
    commander: {
      ...base.commander,
      ...commanderOverride
    }
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("app page analyze flow", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("submits analyze request with deck payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createAnalyzeResponse()));
    const user = userEvent.setup();
    const { default: Page } = await import("@/app/page");

    render(<Page />);

    await user.type(screen.getByLabelText(/Decklist \(paste here\)/i), "1 Sol Ring");
    await user.click(screen.getByRole("button", { name: /Analyze Deck/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));

    expect(url).toBe("/api/analyze");
    expect(payload.decklist).toContain("Sol Ring");
    expect(payload.commanderName).toBeNull();
    expect(screen.getByTestId("analysis-report").textContent).toBe("none");
  });

  it("re-runs analysis when commander is selected from dropdown", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        createAnalyzeResponse({
          commander: {
            selectedName: null,
            source: "none",
            needsManualSelection: true
          }
        })
      )
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        createAnalyzeResponse({
          commander: {
            selectedName: "Atraxa, Praetors' Voice",
            source: "manual",
            needsManualSelection: false
          }
        })
      )
    );

    const user = userEvent.setup();
    const { default: Page } = await import("@/app/page");
    render(<Page />);

    await user.type(screen.getByLabelText(/Decklist \(paste here\)/i), "1 Sol Ring");
    await user.click(screen.getByRole("button", { name: /Analyze Deck/i }));

    const commanderSelect = await screen.findByLabelText(/Commander \(manual selection\)/i);
    await user.selectOptions(commanderSelect, "Atraxa, Praetors' Voice");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [, secondRequest] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondPayload = JSON.parse(String(secondRequest.body));
    expect(secondPayload.commanderName).toBe("Atraxa, Praetors' Voice");
    expect(await screen.findByText("Atraxa, Praetors' Voice")).toBeTruthy();
  });
});
