import type { OpeningHandSimulationReport } from "./contracts";
import type { DeckCard, ScryfallCard } from "./types";

const DEFAULT_SIMULATION_COUNT = 1000;
const TURN_CAP = 10;
const DEFAULT_MISS_FIRST_SPELL_TURN = 8;
const DEFAULT_MISS_COMMANDER_CAST_TURN = 11;

type SimCardKind = "land" | "manaRock" | "ramp" | "spell" | "unknown";

type SimCard = {
  kind: SimCardKind;
  cmc: number;
};

type SimulationInput = {
  knownCards: DeckCard[];
  totalDeckSize: number;
  commanderCmc: number | null;
  simulations?: number;
};

function isLand(card: ScryfallCard): boolean {
  return card.type_line.toLowerCase().includes("land");
}

function isManaRock(card: ScryfallCard): boolean {
  const typeLine = card.type_line.toLowerCase();
  const text = card.oracle_text.toLowerCase();

  if (typeLine.includes("land") || !typeLine.includes("artifact")) {
    return false;
  }

  return (
    /\{t\}:[\s\S]{0,80}\badd\b[\s\S]{0,40}\bmana\b/.test(text) ||
    /\badd one mana\b/.test(text) ||
    /\badd\b[\s\S]{0,30}\bof any color\b/.test(text)
  );
}

function isRampCard(card: ScryfallCard): boolean {
  const typeLine = card.type_line.toLowerCase();
  const text = card.oracle_text.toLowerCase();

  if (typeLine.includes("land")) {
    return false;
  }

  return (
    /search your library for (a |an )?(basic )?land/.test(text) ||
    /put (?:a|an|up to two|two) [\s\S]{0,25}\bland cards?[\s\S]{0,35}\bonto the battlefield/.test(text) ||
    /\badd\b[\s\S]{0,50}\bmana\b/.test(text) ||
    /create [^.]{0,35}\btreasure token\b/.test(text)
  );
}

function classifyKnownCard(card: ScryfallCard): SimCardKind {
  if (isLand(card)) {
    return "land";
  }

  if (isManaRock(card)) {
    return "manaRock";
  }

  if (isRampCard(card)) {
    return "ramp";
  }

  return "spell";
}

function toPositiveFiniteNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function normalizeCmc(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function buildSimulationDeck(knownCards: DeckCard[], totalDeckSize: number): SimCard[] {
  const deck: SimCard[] = [];
  let knownQty = 0;

  for (const entry of knownCards) {
    const kind = classifyKnownCard(entry.card);
    const cmc = normalizeCmc(entry.card.cmc);
    knownQty += entry.qty;
    for (let index = 0; index < entry.qty; index += 1) {
      deck.push({ kind, cmc });
    }
  }

  const unknownQty = Math.max(0, totalDeckSize - knownQty);
  for (let index = 0; index < unknownQty; index += 1) {
    deck.push({ kind: "unknown", cmc: 3 });
  }

  return deck;
}

function shuffleDeck(cards: SimCard[]): SimCard[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function countKinds(cards: SimCard[]): Record<SimCardKind, number> {
  const counts: Record<SimCardKind, number> = {
    land: 0,
    manaRock: 0,
    ramp: 0,
    spell: 0,
    unknown: 0
  };

  for (const card of cards) {
    counts[card.kind] += 1;
  }

  return counts;
}

function evaluateOpeningHand(openingHand: SimCard[]): {
  landCount: number;
  hasRampInOpening: boolean;
  hasEarlySpell: boolean;
  playable: boolean;
  dead: boolean;
} {
  const landCount = openingHand.filter((card) => card.kind === "land").length;
  const hasRampInOpening = openingHand.some(
    (card) => card.kind === "manaRock" || card.kind === "ramp"
  );
  const hasEarlySpell = openingHand.some((card) => card.kind !== "land" && card.cmc <= 2);

  const dead = landCount <= 1 || landCount >= 6;
  const playable = !dead && (hasEarlySpell || hasRampInOpening || landCount >= 3);

  return {
    landCount,
    hasRampInOpening,
    hasEarlySpell,
    playable,
    dead
  };
}

function takeFirstByKind(hand: SimCard[], kind: SimCardKind): SimCard | null {
  const index = hand.findIndex((card) => card.kind === kind);
  if (index === -1) {
    return null;
  }

  const [selected] = hand.splice(index, 1);
  return selected;
}

function runSingleSimulation(deck: SimCard[], commanderCmc: number | null): {
  playable: boolean;
  dead: boolean;
  hasRampInOpening: boolean;
  firstSpellTurn: number | null;
  commanderCastTurn: number | null;
} {
  const shuffled = shuffleDeck(deck);
  const hand = shuffled.slice(0, 7);
  let libraryIndex = 7;

  const opening = evaluateOpeningHand(hand);

  let landsInPlay = 0;
  let rocksInPlay = 0;
  let rampSourcesInPlay = 0;
  let firstSpellTurn: number | null = null;
  let commanderCastTurn: number | null = null;

  for (let turn = 1; turn <= TURN_CAP; turn += 1) {
    if (libraryIndex < shuffled.length) {
      hand.push(shuffled[libraryIndex]);
      libraryIndex += 1;
    }

    const landPlay = takeFirstByKind(hand, "land");
    if (landPlay) {
      landsInPlay += 1;
    }

    const availableMana = landsInPlay + rocksInPlay + rampSourcesInPlay;

    if (firstSpellTurn === null) {
      const hasCastableSpell = hand.some((card) => card.kind !== "land" && card.cmc <= availableMana);
      if (hasCastableSpell) {
        firstSpellTurn = turn;
      }
    }

    if (
      commanderCastTurn === null &&
      commanderCmc !== null &&
      Number.isFinite(commanderCmc) &&
      commanderCmc > 0 &&
      availableMana >= commanderCmc
    ) {
      commanderCastTurn = turn;
    }

    // Greedily cast acceleration cards by lowest CMC to estimate faster future turns.
    let remainingMana = availableMana;
    let pendingRocks = 0;
    let pendingRampSources = 0;

    while (remainingMana > 0) {
      let candidateIndex = -1;
      let candidateCmc = Number.POSITIVE_INFINITY;

      for (let index = 0; index < hand.length; index += 1) {
        const card = hand[index];
        if (card.kind !== "manaRock" && card.kind !== "ramp") {
          continue;
        }

        if (card.cmc > remainingMana) {
          continue;
        }

        if (
          card.cmc < candidateCmc ||
          (card.cmc === candidateCmc && card.kind === "manaRock" && hand[candidateIndex]?.kind !== "manaRock")
        ) {
          candidateIndex = index;
          candidateCmc = card.cmc;
        }
      }

      if (candidateIndex === -1) {
        break;
      }

      const [castCard] = hand.splice(candidateIndex, 1);
      remainingMana -= castCard.cmc;
      if (castCard.kind === "manaRock") {
        pendingRocks += 1;
      } else {
        pendingRampSources += 1;
      }
    }

    rocksInPlay += pendingRocks;
    rampSourcesInPlay += pendingRampSources;
  }

  return {
    playable: opening.playable,
    dead: opening.dead,
    hasRampInOpening: opening.hasRampInOpening,
    firstSpellTurn,
    commanderCastTurn
  };
}

function ratioToPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
}

/**
 * Monte Carlo opening hand simulation used to estimate consistency signals.
 */
export function simulateOpeningHands({
  knownCards,
  totalDeckSize,
  commanderCmc,
  simulations = DEFAULT_SIMULATION_COUNT
}: SimulationInput): OpeningHandSimulationReport {
  const normalizedSimulationCount = Math.max(1, Math.floor(simulations));
  const deck = buildSimulationDeck(knownCards, Math.max(0, Math.floor(totalDeckSize)));
  const kindCounts = countKinds(deck);

  if (deck.length === 0) {
    return {
      simulations: normalizedSimulationCount,
      playableHands: 0,
      deadHands: 0,
      rampInOpening: 0,
      playablePct: 0,
      deadPct: 0,
      rampInOpeningPct: 0,
      averageFirstSpellTurn: null,
      estimatedCommanderCastTurn: null,
      cardCounts: {
        lands: 0,
        rampCards: 0,
        manaRocks: 0
      },
      totalDeckSize: 0,
      unknownCardCount: 0,
      disclaimer:
        "Opening hand simulation is unavailable because no cards were resolved for the provided decklist."
    };
  }

  let playableHands = 0;
  let deadHands = 0;
  let rampInOpening = 0;
  const firstSpellTurns: number[] = [];
  const commanderTurns: number[] = [];
  const normalizedCommanderCmc =
    commanderCmc !== null ? toPositiveFiniteNumber(commanderCmc, 0) : null;

  for (let index = 0; index < normalizedSimulationCount; index += 1) {
    const outcome = runSingleSimulation(deck, normalizedCommanderCmc);
    if (outcome.playable) {
      playableHands += 1;
    }
    if (outcome.dead) {
      deadHands += 1;
    }
    if (outcome.hasRampInOpening) {
      rampInOpening += 1;
    }

    firstSpellTurns.push(outcome.firstSpellTurn ?? DEFAULT_MISS_FIRST_SPELL_TURN);
    if (normalizedCommanderCmc !== null && normalizedCommanderCmc > 0) {
      commanderTurns.push(outcome.commanderCastTurn ?? DEFAULT_MISS_COMMANDER_CAST_TURN);
    }
  }

  return {
    simulations: normalizedSimulationCount,
    playableHands,
    deadHands,
    rampInOpening,
    playablePct: ratioToPercent(playableHands, normalizedSimulationCount),
    deadPct: ratioToPercent(deadHands, normalizedSimulationCount),
    rampInOpeningPct: ratioToPercent(rampInOpening, normalizedSimulationCount),
    averageFirstSpellTurn: average(firstSpellTurns),
    estimatedCommanderCastTurn: average(commanderTurns),
    cardCounts: {
      lands: kindCounts.land,
      rampCards: kindCounts.ramp,
      manaRocks: kindCounts.manaRock
    },
    totalDeckSize: deck.length,
    unknownCardCount: kindCounts.unknown,
    disclaimer:
      "Monte Carlo estimate using opening 7 and simplified mana heuristics; mulligans, color requirements, and exact sequencing are approximated."
  };
}

