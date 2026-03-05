import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeRoleCounts, computeTutorSummary } from "@/lib/analysis";
import type { DeckCard, RoleCounts, ScryfallCard } from "@/lib/types";

type ArchetypeFixtureCard = {
  name: string;
  qty: number;
  oracle_id?: string;
  type_line: string;
  oracle_text: string;
};

type ArchetypeFixture = {
  name: string;
  cards: ArchetypeFixtureCard[];
  expected_roles: RoleCounts;
  expected_tutor_summary: {
    trueTutors: number;
    tutorSignals: number;
  };
};

const FIXTURE_PATH = path.resolve("tests/fixtures/archetype-role-fixtures.json");

function readFixtures(): ArchetypeFixture[] {
  const payload = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error(`Invalid fixture format in ${FIXTURE_PATH}`);
  }

  return payload as ArchetypeFixture[];
}

function buildCard(overrides: Partial<ScryfallCard>): ScryfallCard {
  return {
    oracle_id: overrides.oracle_id,
    name: overrides.name ?? "Fixture Card",
    type_line: overrides.type_line ?? "Sorcery",
    cmc: overrides.cmc ?? 3,
    mana_cost: overrides.mana_cost ?? "{2}{U}",
    colors: overrides.colors ?? [],
    color_identity: overrides.color_identity ?? [],
    oracle_text: overrides.oracle_text ?? "",
    keywords: overrides.keywords ?? [],
    image_uris: null,
    card_faces: [],
    prices: {
      usd: null,
      usd_foil: null,
      usd_etched: null,
      tix: null
    }
  };
}

function toDeckCards(cards: ArchetypeFixtureCard[]): DeckCard[] {
  return cards.map((card) => ({
    name: card.name,
    qty: card.qty,
    card: buildCard({
      oracle_id: card.oracle_id,
      name: card.name,
      type_line: card.type_line,
      oracle_text: card.oracle_text
    })
  }));
}

describe("analysis archetype fixtures", () => {
  const fixtures = readFixtures();

  for (const fixture of fixtures) {
    it(`matches expected role counts for ${fixture.name}`, () => {
      const cards = toDeckCards(fixture.cards);

      const roles = computeRoleCounts(cards);
      const tutors = computeTutorSummary(cards);

      expect(roles).toEqual(fixture.expected_roles);
      expect(tutors.trueTutors).toBe(fixture.expected_tutor_summary.trueTutors);
      expect(tutors.tutorSignals).toBe(fixture.expected_tutor_summary.tutorSignals);
    });
  }

  it("honors oracle_id role overrides for ambiguous tutor text", () => {
    const cards: DeckCard[] = [
      {
        name: "Mystical Tutor",
        qty: 1,
        card: buildCard({
          oracle_id: "fb81f95c-70f8-4eb7-8d15-15d0ae23ec03",
          name: "Mystical Tutor",
          type_line: "Instant",
          oracle_text: "Put a card from your library on top."
        })
      }
    ];

    const roles = computeRoleCounts(cards);
    const tutors = computeTutorSummary(cards);

    expect(roles.tutors).toBe(1);
    expect(tutors.trueTutors).toBe(1);
  });
});
