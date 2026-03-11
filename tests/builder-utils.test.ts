import { describe, expect, it } from "vitest";
import {
  buildCommanderAbilitySuggestionGroups,
  buildColorStapleSuggestionNames,
  buildBuilderDecklist,
  buildGameChangerSuggestionNames,
  buildManaBaseSuggestionNames,
  computePreconSimilarity,
  extractNeeds,
  totalDeckCardCount
} from "@/lib/builder";
import { getCommanderProfile, getCommanderProfileCount } from "@/lib/commanderProfiles";

describe("builder utilities", () => {
  it("builds a commander-first decklist with paired commanders", () => {
    const decklist = buildBuilderDecklist(
      {
        primary: "Tymna the Weaver",
        secondary: "Thrasios, Triton Hero"
      },
      [
        { name: "Sol Ring", qty: 1 },
        { name: "Arcane Signet", qty: 1 }
      ]
    );

    expect(decklist).toContain("Commander");
    expect(decklist).toContain("1 Tymna the Weaver");
    expect(decklist).toContain("1 Thrasios, Triton Hero");
    expect(decklist).toContain("\n\nDeck\n1 Sol Ring\n1 Arcane Signet");
  });

  it("extracts low-count needs sorted by the largest deficit", () => {
    const needs = extractNeeds([
      {
        key: "lands",
        label: "Lands",
        value: 33,
        status: "LOW",
        recommendedMin: 36,
        recommendedMax: 38,
        recommendedText: "36-38",
        diagnostic: "short"
      },
      {
        key: "ramp",
        label: "Ramp",
        value: 4,
        status: "LOW",
        recommendedMin: 10,
        recommendedMax: 12,
        recommendedText: "10-12",
        diagnostic: "short"
      },
      {
        key: "draw",
        label: "Draw",
        value: 10,
        status: "OK",
        recommendedMin: 8,
        recommendedMax: 12,
        recommendedText: "8-12",
        diagnostic: "fine"
      }
    ]);

    expect(needs).toEqual([
      {
        key: "ramp",
        label: "Ramp",
        deficit: 6,
        current: 4,
        recommendedMin: 10
      },
      {
        key: "lands",
        label: "Lands",
        deficit: 3,
        current: 33,
        recommendedMin: 36
      }
    ]);
  });

  it("computes stock precon overlap against the current deck", () => {
    const summary = computePreconSimilarity(
      [
        { name: "Sol Ring", qty: 1 },
        { name: "Arcane Signet", qty: 1 },
        { name: "Counterspell", qty: 1 }
      ],
      {
        slug: "test-precon",
        name: "Test Precon",
        releaseDate: "2026-01-01",
        decklist: "Commander\n1 Edric, Spymaster of Trest\n\nDeck\n1 Sol Ring\n1 Island\n1 Arcane Signet"
      }
    );

    expect(summary).toEqual({
      slug: "test-precon",
      name: "Test Precon",
      releaseDate: "2026-01-01",
      overlapCount: 2,
      overlapPct: 50
    });
  });

  it("counts total main-deck cards", () => {
    expect(
      totalDeckCardCount([
        { name: "Island", qty: 10 },
        { name: "Forest", qty: 12 },
        { name: "Sol Ring", qty: 1 }
      ])
    ).toBe(23);
  });

  it("returns colorless staple suggestions for empty commander color identity", () => {
    expect(buildColorStapleSuggestionNames([])).toEqual([
      "Forsaken Monument",
      "All Is Dust",
      "Ugin, the Ineffable",
      "Introduction to Annihilation"
    ]);
  });

  it("returns colorless mana base suggestions for empty commander color identity", () => {
    expect(buildManaBaseSuggestionNames([])).toEqual([
      "Command Tower",
      "Exotic Orchard",
      "Path of Ancestry",
      "Reflecting Pool",
      "Fabled Passage",
      "Terramorphic Expanse",
      "Evolving Wilds",
      "Wastes",
      "War Room",
      "Myriad Landscape",
      "Reliquary Tower",
      "Rogue's Passage"
    ]);
  });

  it("returns only color-safe game changers for a Simic commander", () => {
    const names = buildGameChangerSuggestionNames(["G", "U"]);

    expect(names).toContain("Force of Will");
    expect(names).toContain("Worldly Tutor");
    expect(names).toContain("The One Ring");
    expect(names).not.toContain("Drannith Magistrate");
    expect(names).not.toContain("Demonic Tutor");
    expect(names).not.toContain("Grand Arbiter Augustin IV");
  });

  it("returns only colorless game changers for a colorless commander", () => {
    const names = buildGameChangerSuggestionNames([]);

    expect(names).toContain("The One Ring");
    expect(names).toContain("Ancient Tomb");
    expect(names).not.toContain("Force of Will");
    expect(names).not.toContain("Crop Rotation");
  });

  it("returns exact commander packages for known commanders", () => {
    const groups = buildCommanderAbilitySuggestionGroups({
      name: "Edric, Spymaster of Trest",
      typeLine: "Legendary Creature — Elf Rogue",
      oracleText:
        "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card."
    });

    expect(groups[0]?.label).toBe("Evasive Attackers");
    expect(groups[0]?.names).toContain("Tetsuko Umezawa, Fugitive");
    expect(groups[0]?.names).toContain("Reconnaissance Mission");
  });

  it("returns generic signal packages from commander text", () => {
    const groups = buildCommanderAbilitySuggestionGroups({
      name: "Test Tokens Commander",
      typeLine: "Legendary Creature",
      oracleText:
        "Whenever you attack, create a 1/1 white Soldier creature token."
    });

    expect(groups.some((group) => group.names.includes("Parallel Lives"))).toBe(true);
    expect(groups.some((group) => group.names.includes("Skullclamp"))).toBe(true);
  });

  it("loads a seeded commander-profile dataset", () => {
    expect(getCommanderProfileCount()).toBeGreaterThanOrEqual(390);
    expect(getCommanderProfile("Prosper, Tome-Bound")?.groups[0]?.cards).toContain("Jeska's Will");
    expect(getCommanderProfile("Miirym, Sentinel Wyrm")?.groups[0]?.cards).toContain("Dragon Tempest");
    expect(getCommanderProfile("Pantlaza, Sun-Favored")?.groups[0]?.cards).toContain("Trumpeting Carnosaur");
    expect(getCommanderProfile("Zhulodok, Void Gorger")?.groups[0]?.cards).toContain("Forsaken Monument");
    expect(getCommanderProfile("Alela, Artful Provocateur")?.groups[0]?.cards).toContain("Bitterblossom");
    expect(getCommanderProfile("The Locust God")?.groups[0]?.cards).toContain("Windfall");
    expect(getCommanderProfile("The Gitrog Monster")?.groups[0]?.cards).toContain("Dakmor Salvage");
    expect(getCommanderProfile("Raffine, Scheming Seer")?.groups[0]?.cards).toContain("Animate Dead");
    expect(getCommanderProfile("Aminatou, the Fateshifter")?.groups[0]?.cards).toContain("Scroll Rack");
    expect(getCommanderProfile("Xyris, the Writhing Storm")?.groups[0]?.cards).toContain("Wheel of Fortune");
    expect(getCommanderProfile("Karador, Ghost Chieftain")?.groups[0]?.cards).toContain("Buried Alive");
    expect(getCommanderProfile("Zedruu the Greathearted")?.groups[0]?.cards).toContain("Illusions of Grandeur");
    expect(getCommanderProfile("Satoru Umezawa")?.groups[0]?.cards).toContain("Blightsteel Colossus");
    expect(getCommanderProfile("Zur the Enchanter")?.groups[0]?.cards).toContain("Necropotence");
    expect(getCommanderProfile("Tymna the Weaver")?.groups[0]?.cards).toContain("Reconnaissance");
    expect(getCommanderProfile("Narci, Fable Singer")?.groups[0]?.cards).toContain("The Cruelty of Gix");
    expect(getCommanderProfile("Kess, Dissident Mage")?.groups[0]?.cards).toContain("Past in Flames");
    expect(getCommanderProfile("Kykar, Wind's Fury")?.groups[0]?.cards).toContain("Whirlwind of Thought");
    expect(getCommanderProfile("Tergrid, God of Fright // Tergrid's Lantern")?.groups[0]?.cards).toContain("Oppression");
    expect(getCommanderProfile("Sam, Loyal Attendant")?.groups[0]?.cards).toContain("Academy Manufactor");
    expect(getCommanderProfile("Yawgmoth, Thran Physician")?.groups[0]?.cards).toContain("Mikaeus, the Unhallowed");
    expect(getCommanderProfile("Tuvasa the Sunlit")?.groups[0]?.cards).toContain("Sterling Grove");
    expect(getCommanderProfile("Hapatra, Vizier of Poisons")?.groups[0]?.cards).toContain("Nest of Scarabs");
    expect(getCommanderProfile("Light-Paws, Emperor's Voice")?.groups[0]?.cards).toContain("Ethereal Armor");
    expect(getCommanderProfile("Karlov of the Ghost Council")?.groups[0]?.cards).toContain("Soul Warden");
    expect(getCommanderProfile("Burakos, Party Leader")?.groups[0]?.cards).toContain("Folk Hero");
    expect(getCommanderProfile("Mayael the Anima")?.groups[0]?.cards).toContain("Scroll Rack");
    expect(getCommanderProfile("Omo, Queen of Vesuva")?.groups[0]?.cards).toContain("Cloudpost");
    expect(getCommanderProfile("The Tenth Doctor")?.groups[0]?.cards).toContain("Rose Tyler");
    expect(getCommanderProfile("Admiral Beckett Brass")?.groups[0]?.cards).toContain("Malcolm, Keen-Eyed Navigator");
    expect(getCommanderProfile("Admiral Brass, Unsinkable")?.groups[0]?.cards).toContain("Patriarch's Bidding");
    expect(getCommanderProfile("The Fourth Doctor")?.groups[0]?.cards).toContain("Sensei's Divining Top");
    expect(getCommanderProfile("Agatha of the Vile Cauldron")?.groups[0]?.cards).toContain("Walking Ballista");
    expect(getCommanderProfile("Amalia Benavides Aguirre")?.groups[0]?.cards).toContain("Soul Warden");
    expect(getCommanderProfile("Ashaya, Soul of the Wild")?.groups[0]?.cards).toContain("Quirion Ranger");
    expect(getCommanderProfile("Breeches, Eager Pillager")?.groups[0]?.cards).toContain("Malcolm, Keen-Eyed Navigator");
    expect(getCommanderProfile("Azusa, Lost but Seeking")?.groups[0]?.cards).toContain("Exploration");
    expect(getCommanderProfile("Birgi, God of Storytelling // Harnfel, Horn of Bounty")?.groups[0]?.cards).toContain("Underworld Breach");
    expect(getCommanderProfile("Child of Alara")?.groups[0]?.cards).toContain("Life from the Loam");
    expect(getCommanderProfile("Captain America, First Avenger")?.groups[0]?.cards).toContain("Colossus Hammer");
  });
});
