import { buildColorIdentityCheck } from "./checks";
import type { CommanderChoice } from "./contracts";
import type { DeckCard, ParsedDeckEntry, ScryfallCard } from "./types";

function normalizeLookupName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isLegendaryCreature(typeLine: string): boolean {
  const lower = typeLine.toLowerCase();
  return lower.includes("legendary") && lower.includes("creature");
}

export function canBeCommanderCard(card: ScryfallCard): boolean {
  if (isLegendaryCreature(card.type_line)) {
    return true;
  }

  const oracleTexts = [card.oracle_text, ...card.card_faces.map((face) => face.oracle_text ?? "")]
    .join("\n")
    .toLowerCase();

  return oracleTexts.includes("can be your commander");
}

function uniqueLargestCommanderCandidate(candidates: ScryfallCard[]): ScryfallCard | null {
  if (candidates.length === 0) {
    return null;
  }

  const sizes = candidates
    .map((candidate) => candidate.color_identity.length)
    .sort((left, right) => right - left);
  const topSize = sizes[0] ?? 0;
  const secondSize = sizes[1] ?? -1;
  if (topSize <= secondSize) {
    return null;
  }

  return candidates.find((candidate) => candidate.color_identity.length === topSize) ?? null;
}

export function deriveCommanderOptions(
  knownCards: DeckCard[],
  effectiveParsedDeck: ParsedDeckEntry[],
  inputDeckSize: number
): {
  options: CommanderChoice[];
  suggestedCommanderCard: ScryfallCard | null;
} {
  const options = [
    ...new Map(
      knownCards
        .filter((entry) => canBeCommanderCard(entry.card))
        .map((entry) => [
          normalizeLookupName(entry.card.name),
          {
            name: entry.card.name,
            colorIdentity: entry.card.color_identity
          }
        ])
    ).values()
  ].sort((left, right) => left.name.localeCompare(right.name));

  const commanderCandidates = [
    ...new Map(
      knownCards
        .filter((entry) => canBeCommanderCard(entry.card))
        .map((entry) => [normalizeLookupName(entry.card.name), entry.card])
    ).values()
  ];

  const suggestedCommanderCard =
    commanderCandidates.length === 1
      ? commanderCandidates[0]
      : (() => {
          const legalCandidates = commanderCandidates.filter((candidate) =>
            buildColorIdentityCheck(knownCards, candidate.name, candidate.color_identity).ok
          );
          if (legalCandidates.length === 1) {
            return legalCandidates[0];
          }

          const largestIdentityCandidate = uniqueLargestCommanderCandidate(legalCandidates);
          if (largestIdentityCandidate) {
            return largestIdentityCandidate;
          }

          const firstDeckEntry = effectiveParsedDeck[0];
          if (!firstDeckEntry || firstDeckEntry.qty !== 1 || inputDeckSize < 95) {
            return null;
          }

          const topIdentitySize = Math.max(
            0,
            ...legalCandidates.map((candidate) => candidate.color_identity.length)
          );
          if (topIdentitySize <= 0) {
            return null;
          }

          const sameSizeCandidates = legalCandidates.filter(
            (candidate) => candidate.color_identity.length === topIdentitySize
          );

          return (
            sameSizeCandidates.find(
              (candidate) =>
                normalizeLookupName(candidate.name) === normalizeLookupName(firstDeckEntry.name)
            ) ?? null
          );
        })();

  return {
    options,
    suggestedCommanderCard
  };
}
