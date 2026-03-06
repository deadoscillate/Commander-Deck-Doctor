import { computeExtraTurns, computeMassLandDenial } from "./brackets";
import type { NamedCount, RuleZeroReport, RuleZeroTableImpactFlag, WinStyle } from "./contracts";
import type { DeckCard, ScryfallCard } from "./types";

type ComputePlayerHeuristicsInput = {
  deckCards: DeckCard[];
  averageManaValue: number;
  landCount: number;
  rampCount: number;
  drawCount: number;
  tutorCount: number;
  comboDetectedCount: number;
  commanderCard: ScryfallCard | null;
  openingHand?: {
    playableHandsPct: number;
    deadHandsPct: number;
    rampInOpeningPct: number;
  } | null;
  goldfish?: {
    avgFirstSpellTurn: number | null;
    avgCommanderCastTurn: number | null;
    avgManaByTurn3: number;
  } | null;
};

type NamedDetection = {
  count: number;
  cards: NamedCount[];
};

const STYLE_PRIORITY: WinStyle[] = ["COMBO", "DRAIN", "LOCK", "COMMANDER_DAMAGE", "COMBAT"];

const FAST_MANA_NAMES = new Set<string>([
  "sol ring",
  "mana crypt",
  "mana vault",
  "jeweled lotus",
  "lotus petal",
  "chrome mox",
  "mox diamond",
  "mox opal",
  "mox amber",
  "grim monolith",
  "ancient tomb",
  "city of traitors",
  "dark ritual",
  "cabal ritual",
  "dockside extortionist"
].map(normalizeLookupName));

const FREE_INTERACTION_NAMES = new Set<string>([
  "force of will",
  "force of negation",
  "fierce guardianship",
  "deflecting swat",
  "deadly rollick",
  "flawless maneuver",
  "pact of negation",
  "daze",
  "snuff out",
  "misdirection",
  "commandeer",
  "mental misstep"
].map(normalizeLookupName));

const COMBO_NAME_SIGNALS = new Set<string>([
  "thassa's oracle",
  "demonic consultation",
  "tainted pact",
  "underworld breach",
  "brain freeze",
  "ad nauseam",
  "isochron scepter",
  "dramatic reversal",
  "heliod, sun-crowned",
  "walking ballista",
  "food chain",
  "squee, the immortal",
  "dockside extortionist",
  "temur sabertooth",
  "ashnod's altar",
  "phyrexian altar",
  "kiki-jiki, mirror breaker",
  "zealous conscripts"
].map(normalizeLookupName));

const STAX_PATTERNS = [
  /opponents can(?:'|\u2019)?t/i,
  /players can(?:'|\u2019)?t/i,
  /can(?:'|\u2019)?t cast more than/i,
  /don(?:'|\u2019)?t untap/i,
  /skip (?:their|your) untap/i
];

const COMBO_TEXT_PATTERNS = [
  /you win the game/i,
  /wins the game/i,
  /search your library for a card/i,
  /untap all nonland permanents you control/i
];

const DRAIN_TEXT_PATTERNS = [
  /each opponent loses/i,
  /opponent loses \d+ life/i,
  /whenever [^.]{0,70} loses life/i,
  /you gain that much life/i
];

const COMMANDER_DAMAGE_PATTERNS = [
  /commander damage/i,
  /equipped creature gets/i,
  /\bequip\b/i,
  /\binfect\b/i,
  /double strike/i
];

const COMBAT_TEXT_PATTERNS = [
  /combat damage/i,
  /extra combat phase/i,
  /whenever [^.]{0,50} attacks/i,
  /attacking creatures?/i,
  /creatures you control get \+/i,
  /create [^.]{0,60}\btoken\b/i
];

function normalizeLookupName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function foldCounts(rows: NamedCount[]): NamedCount[] {
  const merged = new Map<string, NamedCount>();

  for (const row of rows) {
    const key = normalizeLookupName(row.name);
    const existing = merged.get(key);
    if (existing) {
      existing.qty += row.qty;
      continue;
    }

    merged.set(key, { ...row });
  }

  return [...merged.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

function toCardNameList(rows: NamedCount[], limit = 8): string[] {
  return rows.slice(0, limit).map((row) => row.name);
}

function detectByNameSet(deckCards: DeckCard[], names: Set<string>): NamedDetection {
  const found: NamedCount[] = [];

  for (const entry of deckCards) {
    if (names.has(normalizeLookupName(entry.card.name)) || names.has(normalizeLookupName(entry.name))) {
      found.push({ name: entry.card.name, qty: entry.qty });
    }
  }

  const cards = foldCounts(found);
  return {
    count: cards.reduce((sum, card) => sum + card.qty, 0),
    cards
  };
}

function detectStaxPieces(deckCards: DeckCard[]): NamedDetection {
  const found: NamedCount[] = [];

  for (const entry of deckCards) {
    if (matchesAny(entry.card.oracle_text, STAX_PATTERNS)) {
      found.push({ name: entry.card.name, qty: entry.qty });
    }
  }

  const cards = foldCounts(found);
  return {
    count: cards.reduce((sum, card) => sum + card.qty, 0),
    cards
  };
}

function hasCommanderEngine(commanderCard: ScryfallCard | null): boolean {
  if (!commanderCard) {
    return false;
  }

  const text = commanderCard.oracle_text.toLowerCase();
  return (
    /\bwhenever you\b/.test(text) ||
    /\bat the beginning of\b/.test(text) ||
    /\bdraw a card\b/.test(text) ||
    /\bcreate\b[\s\S]{0,40}\btoken\b/.test(text) ||
    /\byou may cast\b/.test(text) ||
    /\badd\b[\s\S]{0,40}\bmana\b/.test(text)
  );
}

function computeWinStyle(
  deckCards: DeckCard[],
  comboDetectedCount: number,
  lockSignals: number
): RuleZeroReport["winStyle"] {
  const scores = new Map<WinStyle, number>(STYLE_PRIORITY.map((style) => [style, 0]));
  const evidence = new Map<WinStyle, Map<string, number>>(
    STYLE_PRIORITY.map((style) => [style, new Map<string, number>()])
  );

  function addSignal(style: WinStyle, cardName: string, qty: number, weight: number) {
    scores.set(style, (scores.get(style) ?? 0) + qty * weight);
    const styleEvidence = evidence.get(style);
    if (!styleEvidence) {
      return;
    }

    styleEvidence.set(cardName, (styleEvidence.get(cardName) ?? 0) + qty * weight);
  }

  if (comboDetectedCount > 0) {
    scores.set("COMBO", (scores.get("COMBO") ?? 0) + Math.min(12, 4 + comboDetectedCount * 3));
  }

  if (lockSignals > 0) {
    scores.set("LOCK", (scores.get("LOCK") ?? 0) + Math.min(8, lockSignals * 1.8));
  }

  for (const entry of deckCards) {
    const text = entry.card.oracle_text;
    const name = entry.card.name;
    const normalizedName = normalizeLookupName(name);

    if (COMBO_NAME_SIGNALS.has(normalizedName) || matchesAny(text, COMBO_TEXT_PATTERNS)) {
      addSignal("COMBO", name, entry.qty, 2.2);
    }

    if (matchesAny(text, DRAIN_TEXT_PATTERNS)) {
      addSignal("DRAIN", name, entry.qty, 2);
    }

    if (matchesAny(text, STAX_PATTERNS)) {
      addSignal("LOCK", name, entry.qty, 2.1);
    }

    if (matchesAny(text, COMMANDER_DAMAGE_PATTERNS)) {
      addSignal("COMMANDER_DAMAGE", name, entry.qty, 1.9);
    }

    if (matchesAny(text, COMBAT_TEXT_PATTERNS)) {
      addSignal("COMBAT", name, entry.qty, 1.5);
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }

    return STYLE_PRIORITY.indexOf(a[0]) - STYLE_PRIORITY.indexOf(b[0]);
  });

  const hasSignal = ranked.some(([, score]) => score > 0);
  const primary = hasSignal ? ranked[0][0] : "COMBAT";
  const secondary =
    hasSignal && ranked[1] && ranked[1][1] > 0 && ranked[1][0] !== primary ? ranked[1][0] : null;

  const primaryEvidence = [...(evidence.get(primary)?.entries() ?? [])]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
  const secondaryEvidence = secondary
    ? [...(evidence.get(secondary)?.entries() ?? [])]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name]) => name)
    : [];
  const allTriggeredEvidence = STYLE_PRIORITY.flatMap((style) =>
    [...(evidence.get(style)?.entries() ?? [])]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
  );
  const fallbackEvidence = deckCards
    .map((entry) => ({ name: entry.card.name, qty: entry.qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
    .map((entry) => entry.name);

  const combinedEvidence = [
    ...new Set([
      ...primaryEvidence,
      ...secondaryEvidence,
      ...allTriggeredEvidence,
      ...(allTriggeredEvidence.length > 0 ? [] : fallbackEvidence)
    ])
  ].slice(0, 8);

  return {
    primary,
    secondary,
    evidence: combinedEvidence
  };
}

function computeSpeedBand(input: {
  fastManaCount: number;
  rampCount: number;
  landCount: number;
  tutorCount: number;
  extraTurnsCount: number;
  averageManaValue: number;
  comboDetectedCount: number;
  openingPlayableHandsPct?: number | null;
  goldfishFirstSpellTurn?: number | null;
  goldfishCommanderCastTurn?: number | null;
}): RuleZeroReport["speedBand"] {
  const {
    fastManaCount,
    rampCount,
    landCount,
    tutorCount,
    extraTurnsCount,
    averageManaValue,
    comboDetectedCount,
    openingPlayableHandsPct,
    goldfishFirstSpellTurn,
    goldfishCommanderCastTurn
  } = input;

  let score = 0;
  score += Math.min(fastManaCount, 8) * 1.35;
  score += Math.min(rampCount, 18) * 0.55;
  score += Math.min(tutorCount, 10) * 1.05;
  score += Math.min(comboDetectedCount, 4) * 2.35;
  score += Math.min(extraTurnsCount, 4) * 0.45;

  if (averageManaValue <= 2.2) score += 5.2;
  else if (averageManaValue <= 2.7) score += 3.6;
  else if (averageManaValue <= 3.1) score += 2.2;
  else if (averageManaValue <= 3.6) score += 0.9;
  else if (averageManaValue > 4.2) score -= 2.8;

  if (landCount < 33) {
    score -= 2.4;
  } else if (landCount > 40) {
    score -= 1.2;
  }

  if (typeof openingPlayableHandsPct === "number" && Number.isFinite(openingPlayableHandsPct)) {
    score += clamp((openingPlayableHandsPct - 55) / 14, -2.4, 2.8);
  }

  if (typeof goldfishFirstSpellTurn === "number" && Number.isFinite(goldfishFirstSpellTurn)) {
    score += clamp((4.2 - goldfishFirstSpellTurn) * 1.25, -2, 3);
  }

  if (typeof goldfishCommanderCastTurn === "number" && Number.isFinite(goldfishCommanderCastTurn)) {
    score += clamp((5.3 - goldfishCommanderCastTurn) * 0.85, -1.6, 1.8);
  }

  const estimatedTurn = clamp(10.9 - score * 0.5, 3.2, 11.5);

  if (estimatedTurn <= 4.4) {
    return {
      value: "VERY_FAST",
      turnBand: "<=4",
      explanation:
        `Fast signals are dense: fast mana ${fastManaCount}, ramp ${rampCount}, tutors ${tutorCount}, ` +
        `combos ${comboDetectedCount}, avg MV ${averageManaValue.toFixed(2)}.` +
        (typeof goldfishFirstSpellTurn === "number"
          ? ` Goldfish first spell averages turn ${goldfishFirstSpellTurn.toFixed(2)}.`
          : "")
    };
  }

  if (estimatedTurn <= 6.4) {
    return {
      value: "FAST",
      turnBand: "5-6",
      explanation:
        `Acceleration is above baseline: fast mana ${fastManaCount}, ramp ${rampCount}, tutors ${tutorCount}, ` +
        `extra turns ${extraTurnsCount}, avg MV ${averageManaValue.toFixed(2)}.`
    };
  }

  if (estimatedTurn <= 9.4) {
    return {
      value: "MID",
      turnBand: "7-9",
      explanation:
        `Moderate acceleration profile (fast mana ${fastManaCount}, ramp ${rampCount}, tutors ${tutorCount}) ` +
        `with avg MV ${averageManaValue.toFixed(2)} projects a mid-speed goldfish.`
    };
  }

  return {
    value: "SLOW",
    turnBand: "10+",
    explanation:
      `Acceleration is light (fast mana ${fastManaCount}, ramp ${rampCount}, tutors ${tutorCount}) ` +
      `with avg MV ${averageManaValue.toFixed(2)} and land count ${landCount}, indicating slower pacing.`
  };
}

function computeConsistency(input: {
  drawCount: number;
  tutorCount: number;
  fastManaCount: number;
  rampCount: number;
  landCount: number;
  averageManaValue: number;
  commanderEngine: boolean;
  openingPlayableHandsPct?: number | null;
  openingDeadHandsPct?: number | null;
  openingRampInOpeningPct?: number | null;
  goldfishFirstSpellTurn?: number | null;
}): RuleZeroReport["consistency"] {
  const {
    drawCount,
    tutorCount,
    fastManaCount,
    rampCount,
    landCount,
    averageManaValue,
    commanderEngine,
    openingPlayableHandsPct,
    openingDeadHandsPct,
    openingRampInOpeningPct,
    goldfishFirstSpellTurn
  } = input;

  const drawComponent = Math.min(drawCount, 18) * 1.2;
  const tutorComponent = Math.min(tutorCount, 10) * 1.8;
  const fastManaComponent = Math.min(fastManaCount, 8) * 1.2;
  const rampComponent = Math.min(rampCount, 18) * 0.9;
  const curveComponent =
    averageManaValue <= 2.5
      ? 8
      : averageManaValue <= 3
        ? 6
        : averageManaValue <= 3.4
          ? 4
          : averageManaValue <= 3.8
            ? 2
            : averageManaValue <= 4.2
              ? 0
              : -8;
  const landComponent =
    landCount >= 33 && landCount <= 40
      ? 6
      : landCount >= 31 && landCount <= 42
        ? 3
        : -5;
  const commanderComponent = commanderEngine ? 6 : 0;
  const playableComponent =
    typeof openingPlayableHandsPct === "number" && Number.isFinite(openingPlayableHandsPct)
      ? clamp((openingPlayableHandsPct - 55) * 0.22, -5, 10)
      : 0;
  const deadHandComponent =
    typeof openingDeadHandsPct === "number" && Number.isFinite(openingDeadHandsPct)
      ? clamp(-openingDeadHandsPct * 0.28, -14, 0)
      : 0;
  const openingRampComponent =
    typeof openingRampInOpeningPct === "number" && Number.isFinite(openingRampInOpeningPct)
      ? clamp(openingRampInOpeningPct * 0.12, 0, 10)
      : 0;
  const firstSpellComponent =
    typeof goldfishFirstSpellTurn === "number" && Number.isFinite(goldfishFirstSpellTurn)
      ? clamp((3.8 - goldfishFirstSpellTurn) * 1.1, -6, 4)
      : 0;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        10 +
          drawComponent +
          tutorComponent +
          fastManaComponent +
          rampComponent +
          curveComponent +
          landComponent +
          commanderComponent +
          playableComponent +
          deadHandComponent +
          openingRampComponent +
          firstSpellComponent
      )
    )
  );

  const bucket = score >= 72 ? "HIGH" : score >= 48 ? "MED" : "LOW";

  return {
    score,
    bucket,
    commanderEngine,
    explanation:
      `Draw ${drawCount}, ramp ${rampCount}, tutors ${tutorCount}, fast mana ${fastManaCount}, ` +
      `lands ${landCount}, avg MV ${averageManaValue.toFixed(2)}, commander engine ${commanderEngine ? "on" : "off"}` +
      (typeof openingPlayableHandsPct === "number"
        ? `, playable hands ${openingPlayableHandsPct.toFixed(1)}%`
        : "") +
      (typeof openingDeadHandsPct === "number" ? `, dead hands ${openingDeadHandsPct.toFixed(1)}%` : "") +
      ` -> consistency ${bucket} (${score}).`
  };
}

function buildTableImpactFlags(input: {
  extraTurns: NamedDetection;
  massLandDenial: NamedDetection;
  staxPieces: NamedDetection;
  freeInteraction: NamedDetection;
  fastMana: NamedDetection;
  tutorCount: number;
  comboDetectedCount: number;
}): RuleZeroReport["tableImpact"] {
  const {
    extraTurns,
    massLandDenial,
    staxPieces,
    freeInteraction,
    fastMana,
    tutorCount,
    comboDetectedCount
  } = input;

  const flags: RuleZeroTableImpactFlag[] = [];
  const lockPressure = massLandDenial.count > 0 || staxPieces.count >= 3;
  const turboPressure =
    fastMana.count >= 4 ||
    (fastMana.count >= 3 && tutorCount >= 6) ||
    (fastMana.count >= 2 && comboDetectedCount >= 2);
  const protectedComboShell =
    freeInteraction.count >= 4 || (freeInteraction.count >= 3 && comboDetectedCount >= 2);

  if (extraTurns.count > 0) {
    flags.push({
      kind: "extraTurns",
      severity: extraTurns.count >= 2 ? "WARN" : "INFO",
      count: extraTurns.count,
      message:
        extraTurns.count >= 2
          ? `${pluralize(extraTurns.count, "extra-turn spell")} detected; repeated turn loops can dominate table pacing.`
          : `${pluralize(extraTurns.count, "extra-turn spell")} detected.`,
      cards: toCardNameList(extraTurns.cards)
    });
  }

  if (massLandDenial.count > 0) {
    flags.push({
      kind: "massLandDenial",
      severity: "WARN",
      count: massLandDenial.count,
      message: `Mass land denial detected (${massLandDenial.count}); this usually requires explicit Rule 0 alignment.`,
      cards: toCardNameList(massLandDenial.cards)
    });
  }

  if (staxPieces.count > 0) {
    flags.push({
      kind: "staxPieces",
      severity: staxPieces.count >= 3 || lockPressure ? "WARN" : "INFO",
      count: staxPieces.count,
      message:
        staxPieces.count >= 3 || lockPressure
          ? `${pluralize(staxPieces.count, "stax piece")} with lock pressure detected.`
          : `${pluralize(staxPieces.count, "stax piece")} detected.`,
      cards: toCardNameList(staxPieces.cards)
    });
  }

  if (freeInteraction.count > 0) {
    flags.push({
      kind: "freeInteraction",
      severity: protectedComboShell ? "WARN" : "INFO",
      count: freeInteraction.count,
      message:
        protectedComboShell
          ? `Free interaction package (${freeInteraction.count}) plus combo velocity may compress interaction windows.`
          : `Free interaction package detected (${freeInteraction.count}).`,
      cards: toCardNameList(freeInteraction.cards)
    });
  }

  if (fastMana.count > 0) {
    flags.push({
      kind: "fastMana",
      severity: turboPressure ? "WARN" : "INFO",
      count: fastMana.count,
      message:
        turboPressure
          ? `Fast mana package (${fastMana.count}) with tutor/combo pressure suggests explosive starts.`
          : `Fast mana detected (${fastMana.count}).`,
      cards: toCardNameList(fastMana.cards)
    });
  }

  flags.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "WARN" ? -1 : 1;
    }

    return b.count - a.count || a.kind.localeCompare(b.kind);
  });

  return {
    flags,
    extraTurnsCount: extraTurns.count,
    massLandDenialCount: massLandDenial.count,
    staxPiecesCount: staxPieces.count,
    freeInteractionCount: freeInteraction.count,
    fastManaCount: fastMana.count
  };
}

/**
 * Rule-0 style player snapshot layer. This intentionally summarizes signals and
 * does not enforce gameplay legality or bracket policy.
 */
export function computePlayerHeuristics({
  deckCards,
  averageManaValue,
  landCount,
  rampCount,
  drawCount,
  tutorCount,
  comboDetectedCount,
  commanderCard,
  openingHand,
  goldfish
}: ComputePlayerHeuristicsInput): RuleZeroReport {
  const extraTurns = (() => {
    const { count, cards } = computeExtraTurns(deckCards);
    return { count, cards };
  })();
  const massLandDenial = (() => {
    const { count, cards } = computeMassLandDenial(deckCards);
    return { count, cards };
  })();
  const staxPieces = detectStaxPieces(deckCards);
  const freeInteraction = detectByNameSet(deckCards, FREE_INTERACTION_NAMES);
  const fastMana = detectByNameSet(deckCards, FAST_MANA_NAMES);

  const commanderEngine = hasCommanderEngine(commanderCard);
  const winStyle = computeWinStyle(
    deckCards,
    comboDetectedCount,
    staxPieces.count + massLandDenial.count
  );
  const speedBand = computeSpeedBand({
    fastManaCount: fastMana.count,
    rampCount,
    landCount,
    tutorCount,
    extraTurnsCount: extraTurns.count,
    averageManaValue,
    comboDetectedCount,
    openingPlayableHandsPct: openingHand?.playableHandsPct ?? null,
    goldfishFirstSpellTurn: goldfish?.avgFirstSpellTurn ?? null,
    goldfishCommanderCastTurn: goldfish?.avgCommanderCastTurn ?? null
  });
  const consistency = computeConsistency({
    drawCount,
    tutorCount,
    fastManaCount: fastMana.count,
    rampCount,
    landCount,
    averageManaValue,
    commanderEngine,
    openingPlayableHandsPct: openingHand?.playableHandsPct ?? null,
    openingDeadHandsPct: openingHand?.deadHandsPct ?? null,
    openingRampInOpeningPct: openingHand?.rampInOpeningPct ?? null,
    goldfishFirstSpellTurn: goldfish?.avgFirstSpellTurn ?? null
  });
  const tableImpact = buildTableImpactFlags({
    extraTurns,
    massLandDenial,
    staxPieces,
    freeInteraction,
    fastMana,
    tutorCount,
    comboDetectedCount
  });

  return {
    winStyle,
    speedBand,
    consistency,
    tableImpact,
    disclaimer:
      "Rule 0 Snapshot is a conversation layer built from card signals, not a hard power-level or legality verdict."
  };
}
