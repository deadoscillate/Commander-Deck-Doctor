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
  it("detects modern commander parlance categories with thresholded support", () => {
    const cards: DeckCard[] = [
      buildDeckCard(
        "Ghostly Prison",
        1,
        "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."
      ),
      buildDeckCard(
        "Sphere of Safety",
        1,
        "Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those creatures."
      ),
      buildDeckCard(
        "Howling Mine",
        1,
        "At the beginning of each player's draw step, if Howling Mine is untapped, that player draws an additional card.",
        "Artifact"
      ),
      buildDeckCard(
        "Rites of Flourishing",
        1,
        "At the beginning of each player's draw step, that player draws an additional card. Each player may play an additional land on each of their turns."
      ),
      buildDeckCard(
        "Kindred Discovery",
        1,
        "As Kindred Discovery enters the battlefield, choose a creature type. Whenever a creature you control of the chosen type enters or attacks, draw a card.",
        "Kindred Enchantment"
      ),
      buildDeckCard(
        "Vanquisher's Banner",
        1,
        "As Vanquisher's Banner enters, choose a creature type. Creatures you control of the chosen type get +1/+1.",
        "Artifact"
      ),
      buildDeckCard(
        "Sneak Attack",
        1,
        "{R}: You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice it at the beginning of the next end step.",
        "Enchantment"
      ),
      buildDeckCard(
        "Through the Breach",
        1,
        "You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice it at the beginning of the next end step.",
        "Instant"
      ),
      buildDeckCard(
        "Glistener Elf",
        1,
        "Infect",
        "Creature - Elf Warrior"
      ),
      buildDeckCard(
        "Venerated Rotpriest",
        1,
        "Toxic 1",
        "Creature - Phyrexian Druid"
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

  it("detects expanded phase 2 taxonomy categories", () => {
    const cards: DeckCard[] = [
      buildDeckCard(
        "Maelstrom Wanderer",
        1,
        "Cascade, cascade",
        "Legendary Creature - Elemental"
      ),
      buildDeckCard(
        "Shardless Agent",
        1,
        "Cascade",
        "Artifact Creature - Human Rogue"
      ),
      buildDeckCard(
        "Courser of Kruphix",
        1,
        "Play with the top card of your library revealed. You may play lands from the top of your library.",
        "Enchantment Creature - Centaur"
      ),
      buildDeckCard(
        "Mystic Forge",
        1,
        "You may look at the top card of your library any time. You may cast artifact spells and colorless spells from the top of your library.",
        "Artifact"
      ),
      buildDeckCard(
        "Tireless Tracker",
        1,
        "Whenever a land enters the battlefield under your control, investigate.",
        "Creature - Human Scout"
      ),
      buildDeckCard(
        "Academy Manufactor",
        1,
        "If you would create a Clue, Food, or Treasure token, instead create one of each.",
        "Artifact Creature - Assembly-Worker"
      ),
      buildDeckCard(
        "Prosper, Tome-Bound",
        1,
        "At the beginning of your end step, exile the top card of your library. Until the end of your next turn, you may play that card.",
        "Legendary Creature - Tiefling Warlock"
      ),
      buildDeckCard(
        "Passionate Archaeologist",
        1,
        "Commander creatures you own have 'Whenever you cast a spell from exile, this creature deals damage equal to that spell's mana value to target opponent.'",
        "Legendary Enchantment - Background"
      )
    ];

    const report = computeDeckArchetypes(cards, 100);
    const counts = new Map(report.counts.map((row) => [row.archetype, row.tagCount]));

    expect((counts.get("Cascade") ?? 0) > 0).toBe(true);
    expect((counts.get("Topdeck Matters") ?? 0) > 0).toBe(true);
    expect((counts.get("Clues/Food/Blood") ?? 0) > 0).toBe(true);
    expect((counts.get("Spells From Exile") ?? 0) > 0).toBe(true);
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
        "Windfall",
        1,
        "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.",
        "Sorcery"
      ),
      buildDeckCard(
        "Young Pyromancer",
        1,
        "Whenever you cast an instant or sorcery spell, create a 1/1 red Elemental creature token.",
        "Creature - Human Shaman"
      ),
      buildDeckCard(
        "Third Path Iconoclast",
        1,
        "Whenever you cast a noncreature spell, create a 1/1 Soldier artifact creature token.",
        "Creature - Human Monk"
      )
    ];

    const report = computeDeckArchetypes(cards, 100);
    const counts = new Map(report.counts.map((row) => [row.archetype, row.tagCount]));

    expect((counts.get("Wheels") ?? 0) > 0).toBe(true);
    expect((counts.get("Spellslinger") ?? 0) > 0).toBe(true);
  });

  it("reduces false positives from one-off broad signal cards", () => {
    const cards: DeckCard[] = [
      buildDeckCard(
        "Swords to Plowshares",
        1,
        "Exile target creature. Its controller gains life equal to its power.",
        "Instant"
      ),
      buildDeckCard(
        "Wheel of Fortune",
        1,
        "Each player discards their hand, then draws seven cards.",
        "Sorcery"
      ),
      buildDeckCard(
        "Ajani, Caller of the Pride",
        1,
        "+1: Put a +1/+1 counter on up to one target creature.",
        "Legendary Planeswalker - Ajani"
      ),
      buildDeckCard(
        "Shadowspear",
        1,
        "Equipped creature gets +1/+1 and has trample and lifelink. Equip {2}.",
        "Legendary Artifact - Equipment"
      )
    ];

    const report = computeDeckArchetypes(cards, 100);
    const counts = new Map(report.counts.map((row) => [row.archetype, row.tagCount]));

    expect(counts.has("Control")).toBe(false);
    expect(counts.has("Wheels")).toBe(false);
    expect(counts.has("Superfriends")).toBe(false);
    expect(counts.has("Voltron")).toBe(false);
  });
});
