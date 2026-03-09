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
    expect(fetchDeckCardsMock).toHaveBeenCalledWith(
      [{ name: "Atraxa, Praetors' Voice", qty: 1 }, { name: "Island", qty: 99 }],
      8,
      { deckPriceMode: "oracle-default", localOnly: true }
    );
    expect(response.headers.get("x-commander-options-cache")).toBe("miss");
    expect(response.headers.get("x-commander-options-total-ms")).toBeTruthy();
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

  it("returns legal pair options only for commanders that support them", async () => {
    const knownCards: DeckCard[] = [
      {
        name: "Tymna the Weaver",
        qty: 1,
        card: {
          name: "Tymna the Weaver",
          type_line: "Legendary Creature - Human Cleric",
          cmc: 3,
          mana_cost: "{1}{W}{B}",
          colors: ["W", "B"],
          color_identity: ["W", "B"],
          oracle_text: "Partner",
          image_uris: null,
          card_faces: [],
          prices: null,
          purchase_uris: null
        }
      },
      {
        name: "Thrasios, Triton Hero",
        qty: 1,
        card: {
          name: "Thrasios, Triton Hero",
          type_line: "Legendary Creature - Merfolk Wizard",
          cmc: 2,
          mana_cost: "{G}{U}",
          colors: ["G", "U"],
          color_identity: ["G", "U"],
          oracle_text: "Partner",
          image_uris: null,
          card_faces: [],
          prices: null,
          purchase_uris: null
        }
      },
      {
        name: "Edric, Spymaster of Trest",
        qty: 1,
        card: {
          name: "Edric, Spymaster of Trest",
          type_line: "Legendary Creature - Elf Rogue",
          cmc: 3,
          mana_cost: "{1}{G}{U}",
          colors: ["G", "U"],
          color_identity: ["G", "U"],
          oracle_text:
            "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card.",
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
          decklist: "1 Tymna the Weaver\n1 Thrasios, Triton Hero\n1 Edric, Spymaster of Trest\n97 Island"
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      commanderFromSection: string | null;
      options: Array<{
        name: string;
        colorIdentity: string[];
        pairOptions?: Array<{
          name: string;
          colorIdentity: string[];
          combinedColorIdentity: string[];
          pairType: string;
        }>;
      }>;
      suggestedCommanderName: string | null;
    };
    const tymnaOption = payload.options.find((option) => option.name === "Tymna the Weaver");
    const thrasiosOption = payload.options.find((option) => option.name === "Thrasios, Triton Hero");
    const edricOption = payload.options.find((option) => option.name === "Edric, Spymaster of Trest");

    expect(tymnaOption?.pairOptions).toEqual([
      {
        name: "Thrasios, Triton Hero",
        colorIdentity: ["G", "U"],
        combinedColorIdentity: ["W", "U", "B", "G"],
        pairType: "partner"
      }
    ]);
    expect(thrasiosOption?.pairOptions).toEqual([
      {
        name: "Tymna the Weaver",
        colorIdentity: ["W", "B"],
        combinedColorIdentity: ["W", "U", "B", "G"],
        pairType: "partner"
      }
    ]);
    expect(edricOption?.pairOptions ?? []).toEqual([]);
  });
});
