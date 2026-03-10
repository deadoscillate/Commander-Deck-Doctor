/* @vitest-environment jsdom */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StockPreconComparison } from "@/components/StockPreconComparison";
import { createAnalyzeResponseFixture } from "@/tests/fixtures/analyzeResponseFixture";

vi.mock("@/components/CardNameHover", () => ({
  CardNameHover: ({ name }: { name: string }) => <span>{name}</span>
}));

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("StockPreconComparison", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("loads matching stock precons and renders comparison deltas", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          meta: { generatedAt: "2026-03-09T00:00:00.000Z", totalDecks: 1 },
          items: [
            {
              slug: "c17-breed-lethality",
              code: "C17",
              fileName: "BreedLethality_C17",
              name: "Breed Lethality",
              releaseDate: "2017-08-25",
              type: "Commander Deck",
              commanderNames: ["Atraxa, Praetors' Voice"],
              displayCommanderNames: ["Atraxa, Praetors' Voice"],
              colorIdentity: ["W", "U", "B", "G"],
              cardCount: 100,
              sourceUrl: "https://example.test/BreedLethality_C17.json"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          slug: "c17-breed-lethality",
          code: "C17",
          fileName: "BreedLethality_C17",
          name: "Breed Lethality",
          releaseDate: "2017-08-25",
          type: "Commander Deck",
          commanderNames: ["Atraxa, Praetors' Voice"],
          displayCommanderNames: ["Atraxa, Praetors' Voice"],
          colorIdentity: ["W", "U", "B", "G"],
          cardCount: 100,
          sourceUrl: "https://example.test/BreedLethality_C17.json",
          decklist: "Commander:\n1 Atraxa, Praetors' Voice (C17) 28\n99 Plains"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          createAnalyzeResponseFixture({
            bracketReport: {
              estimatedBracket: 2,
              estimatedLabel: "Core",
              gameChangersVersion: "fixture",
              gameChangersCount: 0,
              bracket3AllowanceText: null,
              gameChangersFound: [],
              extraTurnsCount: 0,
              extraTurnCards: [],
              massLandDenialCount: 0,
              massLandDenialCards: [],
              notes: [],
              warnings: [],
              explanation: "Stock fixture.",
              disclaimer: "Stock fixture."
            },
            summary: {
              deckSize: 100,
              uniqueCards: 100,
              colors: ["W", "U", "B", "G"],
              averageManaValue: 3.22,
              types: {
                creature: 28,
                instant: 6,
                sorcery: 11,
                artifact: 10,
                enchantment: 5,
                planeswalker: 0,
                land: 40,
                battle: 0
              },
              manaCurve: {
                "0": 2,
                "1": 5,
                "2": 15,
                "3": 18,
                "4": 20,
                "5": 14,
                "6": 10,
                "7+": 6
              }
            },
            roles: {
              ramp: 7,
              draw: 6,
              removal: 6,
              wipes: 2,
              tutors: 0,
              protection: 2,
              finishers: 3
            },
            deckPrice: {
              totals: {
                usd: 121.25,
                usdFoil: null,
                usdEtched: null,
                tix: null
              },
              pricedCardQty: { usd: 100, usdFoil: 0, usdEtched: 0, tix: 0 },
              totalKnownCardQty: 100,
              coverage: { usd: 1, usdFoil: 0, usdEtched: 0, tix: 0 },
              pricingMode: "decklist-set",
              setTaggedCardQty: 100,
              setMatchedCardQty: 100,
              disclaimer: "Stock price fixture."
            },
            parsedDeck: [
              {
                name: "Sol Ring",
                qty: 1,
                resolvedName: "Sol Ring",
                previewImageUrl: null,
                prices: { usd: 1, usdFoil: null, usdEtched: null, tix: null },
                sellerLinks: { tcgplayer: null, cardKingdom: null },
                known: true,
                isGameChanger: false,
                gameChangerName: null
              },
              {
                name: "Cultivate",
                qty: 1,
                resolvedName: "Cultivate",
                previewImageUrl: null,
                prices: { usd: 0.5, usdFoil: null, usdEtched: null, tix: null },
                sellerLinks: { tcgplayer: null, cardKingdom: null },
                known: true,
                isGameChanger: false,
                gameChangerName: null
              }
            ]
          })
        )
      );

    render(
      <StockPreconComparison
        result={createAnalyzeResponseFixture()}
        commanderName="Atraxa, Praetors' Voice"
      />
    );

    expect(screen.getByText(/Compare To Stock Precon/i)).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    expect(screen.getByText(/USD Price Delta/i)).toBeTruthy();
    expect(screen.getByText(/Interaction Delta/i)).toBeTruthy();
    expect(screen.getByText(/Upgrade Snapshot/i)).toBeTruthy();
    expect(screen.getByText(/\+\$124\.52/)).toBeTruthy();
    expect(screen.getByText(/Added vs Stock/i)).toBeTruthy();
    expect(screen.getByText("Arcane Signet")).toBeTruthy();
    expect(screen.getByText(/Removed From Stock/i)).toBeTruthy();
    expect(screen.getByText("Cultivate")).toBeTruthy();
  });
});
