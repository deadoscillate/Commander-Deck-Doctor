/* @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/AnalysisReport", () => ({
  AnalysisReport: ({ result }: { result: { commander?: { selectedName?: string | null } } }) => (
    <div data-testid="builder-analysis-report">{result.commander?.selectedName ?? "none"}</div>
  )
}));

vi.mock("@/components/CardLink", () => ({
  CardLink: ({ name }: { name: string }) => <span>{name}</span>
}));

vi.mock("@/components/ColorIdentityIcons", () => ({
  ColorIdentityIcons: ({ identity }: { identity: string[] }) => <span>{identity.join("") || "C"}</span>
}));

vi.mock("@/components/CommanderHeroHeader", () => ({
  CommanderHeroHeader: ({ commander }: { commander: { name: string } }) => (
    <div data-testid="builder-commander-hero">{commander.name}</div>
  )
}));

vi.mock("@/components/ManaCost", () => ({
  ManaCost: ({ manaCost }: { manaCost?: string }) => <span>{manaCost ?? ""}</span>
}));

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function createAnalyzeResponse(overrides: Record<string, unknown> = {}) {
  const payload = {
    schemaVersion: "1.0",
    input: {
      deckPriceMode: "oracle-default",
      targetBracket: null,
      expectedWinTurn: null,
      commanderName: "Edric, Spymaster of Trest",
      userCedhFlag: false,
      userHighPowerNoGCFlag: false
    },
    commander: {
      detectedFromSection: null,
      selectedName: "Edric, Spymaster of Trest",
      selectedColorIdentity: ["G", "U"],
      selectedManaCost: "{1}{G}{U}",
      selectedCmc: 3,
      selectedArtUrl: null,
      selectedCardImageUrl: null,
      selectedSetCode: null,
      selectedCollectorNumber: null,
      selectedPrintingId: null,
      source: "manual",
      options: [],
      needsManualSelection: false
    },
    parsedDeck: [],
    unknownCards: [],
    summary: {
      totalCards: 100,
      landCount: 35,
      averageManaValue: 2.1,
      colorIdentity: ["G", "U"],
      manaCurve: { "0": 0, "1": 12, "2": 18, "3": 15, "4": 8, "5+": 3 },
      cardTypes: {}
    },
    metrics: {
      totalCards: 100,
      landCount: 35,
      averageManaValue: 2.1,
      colorIdentity: ["G", "U"],
      manaCurve: { "0": 0, "1": 12, "2": 18, "3": 15, "4": 8, "5+": 3 },
      cardTypes: {}
    },
    roles: {
      lands: 35,
      ramp: 9,
      draw: 10,
      spotRemoval: 8,
      boardWipes: 2,
      protection: 3,
      tutors: 2,
      recursion: 2
    },
    checks: {
      deckSize: { ok: true, expected: 100, actual: 100, message: "Deck size is legal." },
      unknownCards: { ok: true, count: 0, cards: [], message: "All cards resolved." },
      singleton: { ok: true, duplicateCount: 0, duplicates: [], message: "Singleton legal." },
      colorIdentity: {
        ok: true,
        enabled: true,
        commanderName: "Edric, Spymaster of Trest",
        commanderColorIdentity: ["G", "U"],
        offColorCount: 0,
        offColorCards: [],
        message: "All cards are on color."
      }
    },
    rulesEngine: {
      format: "commander",
      engineVersion: "test",
      status: "PASS",
      passedRules: 1,
      failedRules: 0,
      skippedRules: 0,
      rules: [],
      warnings: [],
      disclaimer: "test"
    },
    deckHealth: {
      rows: [
        {
          key: "ramp",
          label: "Ramp",
          value: 6,
          status: "LOW",
          recommendedMin: 10,
          recommendedMax: 12,
          recommendedText: "10-12",
          diagnostic: "Needs more ramp."
        }
      ],
      warnings: [],
      okays: [],
      disclaimer: "test"
    },
    deckPrice: {
      totals: { usd: 120, usdFoil: null, usdEtched: null, tix: null },
      pricedCardQty: { usd: 100, usdFoil: 0, usdEtched: 0, tix: 0 },
      totalKnownCardQty: 100,
      coverage: { usd: 1, usdFoil: 0, usdEtched: 0, tix: 0 },
      pricingMode: "oracle-default",
      setTaggedCardQty: 0,
      setMatchedCardQty: 0,
      disclaimer: "test"
    },
    archetypeReport: {
      primary: "Tempo",
      secondary: "Combat",
      confidence: 0.62,
      tags: [],
      archetypes: []
    },
    comboReport: {
      detected: [],
      potential: [
        {
          comboName: "Test Combo",
          cards: ["Card A", "Card B"],
          missingCards: ["Beastmaster Ascension"]
        }
      ],
      disclaimer: "test"
    },
    ruleZero: {
      winStyle: { primary: "COMBAT", secondary: null, evidence: ["Edric, Spymaster of Trest"] },
      speedBand: { value: "MID", turnBand: "7-9", explanation: "test" },
      consistency: { score: 60, bucket: "MED", commanderEngine: true, explanation: "test" },
      tableImpact: {
        flags: [],
        extraTurnsCount: 0,
        massLandDenialCount: 0,
        staxPiecesCount: 0,
        freeInteractionCount: 0,
        fastManaCount: 0
      },
      disclaimer: "test"
    },
    improvementSuggestions: {
      colorIdentity: ["G", "U"],
      items: [
        {
          key: "ramp",
          label: "Ramp",
          currentCount: 6,
          recommendedRange: "10-12",
          direction: "ADD",
          suggestions: ["Nature's Lore", "Farseek"]
        }
      ],
      disclaimer: "test"
    },
    warnings: [],
    bracketReport: {
      estimatedBracket: 2,
      estimatedLabel: "Bracket 2",
      gameChangersVersion: "test",
      gameChangersCount: 0,
      bracket3AllowanceText: null,
      gameChangersFound: [],
      extraTurnsCount: 0,
      extraTurnCards: [],
      massLandDenialCount: 0,
      massLandDenialCards: [],
      notes: [],
      warnings: [],
      explanation: "test",
      disclaimer: "test"
    },
    ...overrides
  };

  return payload;
}

describe("builder page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/card-search?") && url.includes("commanderOnly=1")) {
        return jsonResponse({
          query: "",
          count: 1,
          items: [
            {
              name: "Edric, Spymaster of Trest",
              manaCost: "{1}{G}{U}",
              cmc: 3,
              typeLine: "Legendary Creature - Elf Rogue",
              oracleText: "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card.",
              colorIdentity: ["G", "U"],
              commanderEligible: true,
              isBasicLand: false,
              duplicateLimit: null,
              previewImageUrl: null,
              artUrl: null,
              pairOptions: []
            }
          ]
        });
      }

      if (url.startsWith("/api/card-search?") && url.includes("Counterspell")) {
        return jsonResponse({
          query: "Counterspell",
          count: 1,
          items: [
            {
              name: "Counterspell",
              manaCost: "{U}{U}",
              cmc: 2,
              typeLine: "Instant",
              oracleText: "Counter target spell.",
              colorIdentity: ["U"],
              commanderEligible: false,
              isBasicLand: false,
              duplicateLimit: null,
              previewImageUrl: null,
              artUrl: null
            }
          ]
        });
      }

      if (url === "/api/card-search" && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as { names?: string[] };
        const items = (body.names ?? []).map((name) => ({
          name,
          manaCost: name === "Counterspell" ? "{U}{U}" : "",
          cmc: name === "Counterspell" ? 2 : 0,
          typeLine: name === "Counterspell" ? "Instant" : "",
          oracleText: "",
          colorIdentity: name === "Counterspell" ? ["U"] : [],
          commanderEligible: name === "Edric, Spymaster of Trest",
          isBasicLand: false,
          duplicateLimit: null,
          previewImageUrl: null,
          artUrl: null
        }));

        return jsonResponse({
          query: "",
          count: items.length,
          items
        });
      }

      if (url.startsWith("/api/precons?commander=")) {
        return jsonResponse({ meta: { totalDecks: 0 }, items: [] });
      }

      if (url === "/api/analyze") {
        return jsonResponse(createAnalyzeResponse());
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("starts from commander selection and keeps live analysis wired as cards are added", async () => {
    const user = userEvent.setup();
    const { default: BuilderPage } = await import("@/app/builder/page");

    render(<BuilderPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/card-search?commanderOnly=1"),
        expect.objectContaining({ cache: "no-store" })
      );
    });

    await user.click(screen.getByRole("button", { name: /Start Build/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/analyze", expect.any(Object));
    });

    const searchInput = screen.getByPlaceholderText(/Search cards to add/i);
    await user.type(searchInput, "Counterspell");

    const counterspellCard = (await screen.findAllByText("Counterspell")).find((node) =>
      node.closest("article")
    );
    expect(counterspellCard).toBeTruthy();
    const addButton = within(counterspellCard!.closest("article") as HTMLElement).getByRole("button", {
      name: /^Add$/i
    });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getAllByText("Counterspell").length).toBeGreaterThanOrEqual(2);
    });

    await waitFor(() => {
      const analyzeCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/analyze");
      expect(analyzeCalls.length).toBeGreaterThanOrEqual(2);
    });

    const analyzeCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/analyze");
    const latestAnalyzeBody = JSON.parse(String(analyzeCalls.at(-1)?.[1]?.body));
    expect(latestAnalyzeBody.commanderName).toBe("Edric, Spymaster of Trest");
    expect(latestAnalyzeBody.decklist).toContain("Commander");
    expect(latestAnalyzeBody.decklist).toContain("1 Edric, Spymaster of Trest");
    expect(latestAnalyzeBody.decklist).toContain("1 Counterspell");
  });
});
