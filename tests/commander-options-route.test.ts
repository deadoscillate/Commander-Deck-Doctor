import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/commander-options/route";
import type { DeckCard } from "@/lib/types";

const { fetchDeckCardsMock } = vi.hoisted(() => ({
  fetchDeckCardsMock: vi.fn()
}));

vi.mock("@/lib/scryfall", () => ({
  fetchDeckCards: fetchDeckCardsMock
}));

describe("POST /api/commander-options", () => {
  beforeEach(() => {
    fetchDeckCardsMock.mockReset();
  });

  it("returns commander-eligible options and a suggested commander", async () => {
    const knownCards: DeckCard[] = [
      {
        name: "Atraxa, Praetors' Voice",
        qty: 1,
        card: {
          name: "Atraxa, Praetors' Voice",
          type_line: "Legendary Creature — Angel Horror",
          cmc: 4,
          mana_cost: "{G}{W}{U}{B}",
          colors: ["G", "W", "U", "B"],
          color_identity: ["G", "W", "U", "B"],
          oracle_text: "Flying, vigilance, deathtouch, lifelink",
          image_uris: null,
          card_faces: [],
          prices: null,
          purchase_uris: null
        }
      },
      {
        name: "Island",
        qty: 99,
        card: {
          name: "Island",
          type_line: "Basic Land — Island",
          cmc: 0,
          mana_cost: "",
          colors: [],
          color_identity: [],
          oracle_text: "({T}: Add {U}.)",
          image_uris: null,
          card_faces: [],
          prices: null,
          purchase_uris: null
        }
      }
    ];

    fetchDeckCardsMock.mockResolvedValueOnce({
      knownCards,
      unknownCards: []
    });

    const response = await POST(
      new Request("http://localhost/api/commander-options", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          decklist: "1 Atraxa, Praetors' Voice\n99 Island",
          deckPriceMode: "oracle-default"
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      commanderFromSection: string | null;
      options: Array<{ name: string; colorIdentity: string[] }>;
      suggestedCommanderName: string | null;
    };

    expect(payload.commanderFromSection).toBeNull();
    expect(payload.options).toEqual([
      {
        name: "Atraxa, Praetors' Voice",
        colorIdentity: ["G", "W", "U", "B"]
      }
    ]);
    expect(payload.suggestedCommanderName).toBe("Atraxa, Praetors' Voice");
  });

  it("short-circuits when the decklist already has a Commander section", async () => {
    const response = await POST(
      new Request("http://localhost/api/commander-options", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          decklist: "Commander:\n1 Edric, Spymaster of Trest\n99 Island"
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      commanderFromSection: string | null;
      options: Array<{ name: string; colorIdentity: string[] }>;
      suggestedCommanderName: string | null;
    };

    expect(payload.commanderFromSection).toBe("Edric, Spymaster of Trest");
    expect(payload.options).toEqual([]);
    expect(payload.suggestedCommanderName).toBe("Edric, Spymaster of Trest");
    expect(fetchDeckCardsMock).not.toHaveBeenCalled();
  });
});
