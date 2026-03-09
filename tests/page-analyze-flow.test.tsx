/* @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function MockAnalysisReport(props: {
  result: { commander?: { selectedName?: string | null } };
  onOpenPrintingPicker?: (cardName: string) => void;
}) {
  return (
    <div>
      <div data-testid="analysis-report">{props.result?.commander?.selectedName ?? "none"}</div>
      <button type="button" onClick={() => props.onOpenPrintingPicker?.("Sol Ring")}>
        Open Printing Picker
      </button>
    </div>
  );
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
  const commanderSectionDecklist = "Commander:\n1 Atraxa, Praetors' Voice\n99 Island";
  const manualCommanderDecklist = "1 Atraxa, Praetors' Voice\n99 Island";

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

  it("submits commander detected from a Commander section", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createAnalyzeResponse()));
    const user = userEvent.setup();
    const { default: Page } = await import("@/app/page");

    render(<Page />);

    await user.type(screen.getByLabelText(/Decklist \(paste here\)/i), commanderSectionDecklist);
    await user.click(screen.getByRole("button", { name: /Analyze Deck/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));

    expect(url).toBe("/api/analyze");
    expect(payload.decklist).toContain("Atraxa, Praetors' Voice");
    expect(payload.commanderName).toBe("Atraxa, Praetors' Voice");
    expect(screen.getByTestId("analysis-report").textContent).toBe("none");
  });

  it("requires commander selection before analyze when no commander section exists", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        commanderFromSection: null,
        options: [],
        suggestedCommanderName: null
      })
    );
    const user = userEvent.setup();
    const { default: Page } = await import("@/app/page");
    render(<Page />);

    const analyzeButton = screen.getByRole("button", { name: /Analyze Deck/i });

    await user.type(screen.getByLabelText(/Decklist \(paste here\)/i), "1 Sol Ring");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect((analyzeButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/No commander candidates found\./i)).toBeTruthy();
  });

  it("submits selected commander from the input panel before analyze", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        commanderFromSection: null,
        options: [
          {
            name: "Atraxa, Praetors' Voice",
            colorIdentity: ["W", "U", "B", "G"]
          }
        ],
        suggestedCommanderName: "Atraxa, Praetors' Voice"
      })
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

    await user.type(screen.getByLabelText(/Decklist \(paste here\)/i), manualCommanderDecklist);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    await user.selectOptions(screen.getByLabelText(/^Commander$/i), "Atraxa, Praetors' Voice");

    await user.click(screen.getByRole("button", { name: /Analyze Deck/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));
    expect(payload.commanderName).toBe("Atraxa, Praetors' Voice");
  });

  it("keeps pre-analyze commander flow working at mobile viewport width", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 390
    });
    window.dispatchEvent(new Event("resize"));

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        commanderFromSection: null,
        options: [
          {
            name: "Atraxa, Praetors' Voice",
            colorIdentity: ["W", "U", "B", "G"]
          }
        ],
        suggestedCommanderName: "Atraxa, Praetors' Voice"
      })
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

    await user.type(screen.getByLabelText(/Decklist \(paste here\)/i), manualCommanderDecklist);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    await user.selectOptions(screen.getByLabelText(/^Commander$/i), "Atraxa, Praetors' Voice");

    await user.click(screen.getByRole("button", { name: /Analyze Deck/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));
    expect(payload.commanderName).toBe("Atraxa, Praetors' Voice");
  });

  it("opens and closes printing modal via report interaction", async () => {
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
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        name: "Sol Ring",
        count: 1,
        printings: [
          {
            id: "sol-ring-cmm",
            name: "Sol Ring",
            setCode: "cmm",
            setName: "Commander Masters",
            collectorNumber: "217",
            releasedAt: "2023-08-04",
            imageUrl: "https://img.test/sol-ring-cmm.jpg",
            label: "Commander Masters #217"
          }
        ]
      })
    );

    const user = userEvent.setup();
    const { default: Page } = await import("@/app/page");
    render(<Page />);

    await user.type(screen.getByLabelText(/Decklist \(paste here\)/i), commanderSectionDecklist);
    await user.click(screen.getByRole("button", { name: /Analyze Deck/i }));

    const openButton = await screen.findByRole("button", { name: "Open Printing Picker" });
    await user.click(openButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [secondUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(secondUrl).toContain("/api/card-printings?name=Sol%20Ring");
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Select Printing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("loads a precon into set-aware analysis automatically", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        meta: { generatedAt: "2026-03-09T00:00:00.000Z", totalDecks: 1 },
        items: [
          {
            slug: "fic-limit-break-final-fantasy-vii",
            code: "FIC",
            fileName: "LimitBreakFinalFantasyVii_FIC",
            name: "Limit Break (FINAL FANTASY VII)",
            releaseDate: "2025-06-13",
            type: "Commander Deck",
            commanderNames: ["Cloud Strife"],
            displayCommanderNames: ["Cloud Strife"],
            colorIdentity: ["R", "W"],
            cardCount: 100,
            sourceUrl: "https://mtgjson.com/api/v5/decks/LimitBreakFinalFantasyVii_FIC.json"
          }
        ]
      })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        slug: "fic-limit-break-final-fantasy-vii",
        code: "FIC",
        fileName: "LimitBreakFinalFantasyVii_FIC",
        name: "Limit Break (FINAL FANTASY VII)",
        releaseDate: "2025-06-13",
        type: "Commander Deck",
        commanderNames: ["Cloud Strife"],
        displayCommanderNames: ["Cloud Strife"],
        colorIdentity: ["R", "W"],
        cardCount: 100,
        sourceUrl: "https://mtgjson.com/api/v5/decks/LimitBreakFinalFantasyVii_FIC.json",
        decklist: "Commander\n1 Cloud Strife (FIC) 1\n\n1 Sol Ring (FIC) 60\n98 Mountain (FIC) 300"
      })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        createAnalyzeResponse({
          commander: {
            selectedName: "Cloud Strife",
            source: "section",
            needsManualSelection: false
          }
        })
      )
    );

    const user = userEvent.setup();
    const { default: Page } = await import("@/app/page");
    render(<Page />);

    await user.click(screen.getByRole("button", { name: /Open Library/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [listUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(listUrl).toContain("/api/precons?limit=200");

    await user.click(await screen.findByRole("button", { name: /^Load$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const [analyzeUrl, analyzeRequest] = fetchMock.mock.calls[2] as [string, RequestInit];
    const payload = JSON.parse(String(analyzeRequest.body));

    expect(analyzeUrl).toBe("/api/analyze");
    expect(payload.deckPriceMode).toBe("decklist-set");
    expect(payload.decklist).toContain("(FIC) 60");
    expect(payload.commanderName).toBe("Cloud Strife");
  });
});
