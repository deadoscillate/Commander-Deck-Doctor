import { describe, expect, it } from "vitest";
import { computeDeckArchetypes } from "@/lib/archetypes";
import type { DeckCard, ScryfallCard } from "@/lib/types";

function buildCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    name: "Test Card",
    type_line: "Enchantment",
    cmc: 3,
    mana_cost: "{2}{U}",
    colors: ["U"],
    color_identity: ["U"],
    oracle_text: "",
    image_uris: null,
    card_faces: [],
    prices: {
      usd: null,
      usd_foil: null,
      usd_etched: null,
      tix: null
    },
    ...overrides
  };
}

function buildDeckCard(
  name: string,
  qty: number,
  oracleText: string,
  typeLine = "Enchantment"
): DeckCard {
  return {
    name,
    qty,
    card: buildCard({
      name,
      oracle_text: oracleText,
      type_line: typeLine
    })
  };
}

describe("computeDeckArchetypes parlance coverage", () => {
  it("detects modern commander parlance categories", () => {
    const cards: DeckCard[] = [
      buildDeckCard(
        "Ghostly Prison",
        1,
        "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."
      ),
      buildDeckCard(
        "Howling Mine",
        1,
        "At the beginning of each player's draw step, if Howling Mine is untapped, that player draws an additional card.",
        "Artifact"
      ),
      buildDeckCard(
        "Kindred Discovery",
        1,
        "As Kindred Discovery enters the battlefield, choose a creature type. Whenever a creature you control of the chosen type enters or attacks, draw a card.",
        "Kindred Enchantment"
      ),
      buildDeckCard(
        "Sneak Attack",
        1,
        "{R}: You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice it at the beginning of the next end step.",
        "Enchantment"
      ),
      buildDeckCard(
        "Glistener Elf",
        1,
        "Infect",
        "Creature - Elf Warrior"
      )
    ];

    const report = computeDeckArchetypes(cards, 100);
    const counts = new Map(report.counts.map((row) => [row.archetype, row.tagCount]));

    expect((counts.get("Pillow Fort") ?? 0) > 0).toBe(true);
    expect((counts.get("Group Hug") ?? 0) > 0).toBe(true);
    expect((counts.get("Kindred (Tribal)") ?? 0) > 0).toBe(true);
    expect((counts.get("Cheat Into Play") ?? 0) > 0).toBe(true);
    expect((counts.get("Infect/Toxic") ?? 0) > 0).toBe(true);
  });

  it("still tags classic archetypes like wheels and spellslinger", () => {
    const cards: DeckCard[] = [
      buildDeckCard(
        "Wheel of Fortune",
        1,
        "Each player discards their hand, then draws seven cards.",
        "Sorcery"
      ),
      buildDeckCard(
        "Young Pyromancer",
        1,
        "Whenever you cast an instant or sorcery spell, create a 1/1 red Elemental creature token.",
        "Creature - Human Shaman"
      )
    ];

    const report = computeDeckArchetypes(cards, 100);
    const counts = new Map(report.counts.map((row) => [row.archetype, row.tagCount]));

    expect((counts.get("Wheels") ?? 0) > 0).toBe(true);
    expect((counts.get("Spellslinger") ?? 0) > 0).toBe(true);
  });
});
