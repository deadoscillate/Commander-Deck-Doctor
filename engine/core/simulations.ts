import { isLand } from "./Card";
import { createRngState, shuffleDeterministic } from "./RNG";
import type { CardDefinition } from "./types";
import type { CardDatabase } from "../cards/CardDatabase";
import { classifyCardRoles } from "../cards/roleClassifier";

export type SimulationDeckEntry = {
  name: string;
  qty: number;
};

export type SimulationType = "OPENING_HAND" | "GOLDFISH";

export type SimulationInput = {
  type: SimulationType;
  deck: SimulationDeckEntry[];
  commander?: string | null;
  runs: number;
  seed: string | number;
};

export type OpeningHandSimulationResult = {
  type: "OPENING_HAND";
  runs: number;
  seed: string;
  playableHands: number;
  deadHands: number;
  playableHandsPct: number;
  deadHandsPct: number;
  avgLandsInOpening: number;
  rampInOpeningPct: number;
};

export type GoldfishSimulationResult = {
  type: "GOLDFISH";
  runs: number;
  seed: string;
  avgFirstSpellTurn: number | null;
  avgCommanderCastTurn: number | null;
  avgManaByTurn3: number;
};

export type SimulationResult = OpeningHandSimulationResult | GoldfishSimulationResult;

function toPercent(value: number, runs: number): number {
  if (runs <= 0) {
    return 0;
  }

  return Number(((value / runs) * 100).toFixed(2));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function resolveDeck(db: CardDatabase, entries: SimulationDeckEntry[]): CardDefinition[] {
  const cards: CardDefinition[] = [];
  for (const entry of entries) {
    if (!entry.name.trim() || entry.qty <= 0) {
      continue;
    }

    const card = db.getCardByName(entry.name);
    if (!card) {
      continue;
    }

    for (let i = 0; i < entry.qty; i += 1) {
      cards.push(card);
    }
  }

  return cards;
}

const roleFlagsCache = new Map<string, ReturnType<typeof classifyCardRoles>>();

function cardRoleFlags(card: CardDefinition): ReturnType<typeof classifyCardRoles> {
  const cacheKey = card.oracleId || card.name;
  const cached = roleFlagsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const computed = classifyCardRoles({
    typeLine: card.typeLine,
    oracleText: card.oracleText,
    keywords: card.keywords,
    behaviorId: card.behaviorId ?? null,
    oracleId: card.oracleId,
    cardName: card.name
  });

  roleFlagsCache.set(cacheKey, computed);
  return computed;
}

function isManaRock(card: CardDefinition): boolean {
  if (typeof card.behaviorId === "string" && card.behaviorId.startsWith("TAP_ADD_")) {
    return true;
  }

  const lowerType = card.typeLine.toLowerCase();
  if (!lowerType.includes("artifact") || lowerType.includes("land")) {
    return false;
  }

  const text = card.oracleText.toLowerCase();
  return /\{t\}:\s*add\s+\{[wubrgc]/.test(text) || /\badd\b[\s\S]{0,50}\bmana\b/.test(text);
}

function manaRockProduction(card: CardDefinition): number {
  if (!isManaRock(card) || !card.behaviorId) {
    return 0;
  }

  const parts = card.behaviorId.split("_");
  const amount = Number(parts[3] ?? 1);
  return Number.isFinite(amount) ? Math.max(1, amount) : 1;
}

function isRampCard(card: CardDefinition): boolean {
  if (isLand(card)) {
    return false;
  }

  if (isManaRock(card)) {
    return true;
  }

  return cardRoleFlags(card).ramp;
}

function drawFromLibrary(library: CardDefinition[], hand: CardDefinition[], count = 1): void {
  for (let i = 0; i < count; i += 1) {
    const card = library.pop();
    if (!card) {
      break;
    }

    hand.push(card);
  }
}

function simulateOpeningHands(deck: CardDefinition[], runs: number, seed: string): OpeningHandSimulationResult {
  let playableHands = 0;
  let deadHands = 0;
  let totalLands = 0;
  let rampInOpening = 0;

  for (let run = 0; run < runs; run += 1) {
    const runSeed = `${seed}:opening:${run}`;
    const shuffled = shuffleDeterministic(deck, createRngState(runSeed)).items;
    const hand = shuffled.slice(0, Math.min(7, shuffled.length));
    const lands = hand.filter((card) => isLand(card)).length;
    const hasRamp = hand.some((card) => isRampCard(card));

    totalLands += lands;
    if (lands >= 2 && lands <= 5) {
      playableHands += 1;
    }

    if (lands <= 1 || lands >= 6) {
      deadHands += 1;
    }

    if (hasRamp) {
      rampInOpening += 1;
    }
  }

  return {
    type: "OPENING_HAND",
    runs,
    seed,
    playableHands,
    deadHands,
    playableHandsPct: toPercent(playableHands, runs),
    deadHandsPct: toPercent(deadHands, runs),
    avgLandsInOpening: runs > 0 ? round(totalLands / runs) : 0,
    rampInOpeningPct: toPercent(rampInOpening, runs)
  };
}

function cheapestCastableSpellIndex(hand: CardDefinition[], manaAvailable: number): number {
  let chosenIndex = -1;
  let chosenMv = Number.POSITIVE_INFINITY;

  for (let i = 0; i < hand.length; i += 1) {
    const card = hand[i];
    if (isLand(card)) {
      continue;
    }

    const mv = Number.isFinite(card.mv) ? card.mv : 0;
    if (mv > manaAvailable) {
      continue;
    }

    if (mv < chosenMv) {
      chosenMv = mv;
      chosenIndex = i;
    }
  }

  return chosenIndex;
}

function simulateGoldfish(
  deck: CardDefinition[],
  commander: CardDefinition | null,
  runs: number,
  seed: string
): GoldfishSimulationResult {
  let firstSpellTurnTotal = 0;
  let firstSpellTurnCount = 0;
  let commanderCastTurnTotal = 0;
  let commanderCastTurnCount = 0;
  let manaByTurn3Total = 0;

  for (let run = 0; run < runs; run += 1) {
    const runSeed = `${seed}:goldfish:${run}`;
    const shuffled = shuffleDeterministic(deck, createRngState(runSeed)).items;
    const library = [...shuffled].reverse();
    const hand: CardDefinition[] = [];
    drawFromLibrary(library, hand, 7);

    let landsInPlay = 0;
    let rocksMana = 0;
    let firstSpellTurn: number | null = null;
    let commanderCastTurn: number | null = null;

    for (let turn = 1; turn <= 7; turn += 1) {
      drawFromLibrary(library, hand, 1);

      const landIndex = hand.findIndex((card) => isLand(card));
      if (landIndex >= 0) {
        hand.splice(landIndex, 1);
        landsInPlay += 1;
      }

      let manaAvailable = landsInPlay + rocksMana;
      if (turn === 3) {
        manaByTurn3Total += manaAvailable;
      }

      if (commander && commanderCastTurn === null && manaAvailable >= commander.mv) {
        commanderCastTurn = turn;
        manaAvailable -= commander.mv;
      }

      const spellIndex = cheapestCastableSpellIndex(hand, manaAvailable);
      if (spellIndex >= 0) {
        const spell = hand.splice(spellIndex, 1)[0];
        if (firstSpellTurn === null) {
          firstSpellTurn = turn;
        }

        if (isManaRock(spell)) {
          rocksMana += manaRockProduction(spell);
        }
      }
    }

    if (firstSpellTurn !== null) {
      firstSpellTurnTotal += firstSpellTurn;
      firstSpellTurnCount += 1;
    }

    if (commanderCastTurn !== null) {
      commanderCastTurnTotal += commanderCastTurn;
      commanderCastTurnCount += 1;
    }
  }

  return {
    type: "GOLDFISH",
    runs,
    seed,
    avgFirstSpellTurn: firstSpellTurnCount > 0 ? round(firstSpellTurnTotal / firstSpellTurnCount) : null,
    avgCommanderCastTurn:
      commanderCastTurnCount > 0 ? round(commanderCastTurnTotal / commanderCastTurnCount) : null,
    avgManaByTurn3: runs > 0 ? round(manaByTurn3Total / runs) : 0
  };
}

/**
 * Deterministic simulation entrypoint used by the UI.
 */
export function simulateDeck(db: CardDatabase, input: SimulationInput): SimulationResult {
  const runs = Math.max(1, Math.floor(input.runs));
  const seed = String(input.seed);
  const deck = resolveDeck(db, input.deck);
  const commander = input.commander ? db.getCardByName(input.commander) : null;

  if (input.type === "OPENING_HAND") {
    return simulateOpeningHands(deck, runs, seed);
  }

  return simulateGoldfish(deck, commander, runs, seed);
}
