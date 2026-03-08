/* @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisReport } from "@/components/AnalysisReport";
import type { AnalyzeResponse } from "@/lib/contracts";
import { createAnalyzeResponseFixture } from "@/tests/fixtures/analyzeResponseFixture";

describe("analysis report tab smoke", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("switches across report tabs and keeps core interactions available", async () => {
    const onOpenPrintingPicker = vi.fn();
    const user = userEvent.setup();
    const result = createAnalyzeResponseFixture();

    render(<AnalysisReport result={result} onOpenPrintingPicker={onOpenPrintingPicker} />);

    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Player Snapshot" })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Composition" }));
    expect(screen.getByRole("heading", { name: "Core Composition" })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Simulations" }));
    expect(screen.getByRole("button", { name: "Run Simulations" })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Cards" }));
    expect(screen.getByRole("heading", { name: "Detected Cards" })).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Select Printing" })[0]);
    await waitFor(() => {
      expect(onOpenPrintingPicker).toHaveBeenCalledWith("Sol Ring");
    });

    await user.click(screen.getByRole("tab", { name: "Combos" }));
    expect(screen.getByRole("heading", { name: "Combo Detection" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Live Combos/i })).toBeTruthy();
  });

  it("applies and cleans up the commander page art styling hooks", () => {
    const result = createAnalyzeResponseFixture();
    const { unmount } = render(<AnalysisReport result={result} />);

    expect(document.documentElement.classList.contains("has-commander-page-art")).toBe(true);
    expect(document.body.classList.contains("has-commander-page-art")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--commander-page-art")).toContain(
      "https://img.test/atraxa-art.jpg"
    );

    unmount();

    expect(document.documentElement.classList.contains("has-commander-page-art")).toBe(false);
    expect(document.body.classList.contains("has-commander-page-art")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--commander-page-art")).toBe("");
  });

  it("renders nullable summary and simulation metrics without crashing", async () => {
    const result = createAnalyzeResponseFixture();
    const unsafeResult = result as unknown as {
      summary: { averageManaValue: number | null };
      openingHandSimulation: {
        playablePct: number | null;
        deadPct: number | null;
        rampInOpeningPct: number | null;
        averageFirstSpellTurn: number | null;
        estimatedCommanderCastTurn: number | null;
      };
    };

    unsafeResult.summary.averageManaValue = null;
    unsafeResult.openingHandSimulation.playablePct = null;
    unsafeResult.openingHandSimulation.deadPct = null;
    unsafeResult.openingHandSimulation.rampInOpeningPct = null;
    unsafeResult.openingHandSimulation.averageFirstSpellTurn = null;
    unsafeResult.openingHandSimulation.estimatedCommanderCastTurn = null;

    render(<AnalysisReport result={result as AnalyzeResponse} />);

    expect(screen.getByRole("heading", { name: "Player Snapshot" })).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Simulations" }));
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });

});
