import type { DeckSummary, RoleCounts } from "./types";
import type { CountStatus } from "./status";
import type { CountKey } from "./thresholds";
import type { DeckArchetypeReport } from "./archetypes";
import type { ComboReport } from "./combos";

// Optional UI selector values used for bracket-intent hints.
export type ExpectedWinTurn = ">=10" | "8-9" | "6-7" | "<=5";
export type DeckPriceMode = "oracle-default" | "decklist-set";

// Request payload accepted by POST /api/analyze.
export type AnalyzeRequest = {
  decklist?: string;
  deckPriceMode?: DeckPriceMode | null;
  setOverrides?: Record<
    string,
    string | { setCode?: string | null; printingId?: string | null } | null
  > | null;
  targetBracket?: number | null;
  expectedWinTurn?: ExpectedWinTurn | null;
  commanderName?: string | null;
  userCedhFlag?: boolean;
  userHighPowerNoGCFlag?: boolean;
};

// Shared "name + quantity" structure for card lists in reports.
export type NamedCount = {
  name: string;
  qty: number;
};

export type ParsedDeckCard = {
  name: string;
  qty: number;
  resolvedName: string | null;
  previewImageUrl: string | null;
  known: boolean;
  isGameChanger: boolean;
  gameChangerName: string | null;
};

export type RecommendedCountRow = {
  key: CountKey;
  label: string;
  value: number;
  status: CountStatus;
  recommendedMin: number;
  recommendedMax: number;
  recommendedText: string;
  diagnostic: string;
};

export type DeckHealthReport = {
  rows: RecommendedCountRow[];
  warnings: string[];
  okays: string[];
  disclaimer: string;
};

export type DeckPriceSummary = {
  totals: {
    usd: number | null;
    usdFoil: number | null;
    usdEtched: number | null;
    tix: number | null;
  };
  pricedCardQty: {
    usd: number;
    usdFoil: number;
    usdEtched: number;
    tix: number;
  };
  totalKnownCardQty: number;
  coverage: {
    usd: number;
    usdFoil: number;
    usdEtched: number;
    tix: number;
  };
  pricingMode: DeckPriceMode;
  setTaggedCardQty: number;
  setMatchedCardQty: number;
  disclaimer: string;
};

export type DeckChecks = {
  deckSize: {
    ok: boolean;
    expected: number;
    actual: number;
    message: string;
  };
  unknownCards: {
    ok: boolean;
    count: number;
    cards: string[];
    message: string;
  };
  singleton: {
    ok: boolean;
    duplicateCount: number;
    duplicates: NamedCount[];
    message: string;
  };
  colorIdentity: {
    ok: boolean;
    enabled: boolean;
    commanderName: string | null;
    commanderColorIdentity: string[];
    offColorCount: number;
    offColorCards: Array<{
      name: string;
      qty: number;
      disallowedColors: string[];
    }>;
    message: string;
  };
};

export type RulesEngineDomain = "DECK_CONSTRUCTION" | "CARD_VALIDATION" | "COMMANDER_RULES";
export type RulesEngineSeverity = "ERROR" | "WARN" | "INFO";
export type RulesEngineOutcome = "PASS" | "FAIL" | "SKIP";

export type RulesEngineRuleResult = {
  id: string;
  name: string;
  description: string;
  domain: RulesEngineDomain;
  severity: RulesEngineSeverity;
  outcome: RulesEngineOutcome;
  message: string;
  findings: NamedCount[];
};

export type RulesEngineReport = {
  format: "commander";
  engineVersion: string;
  status: "PASS" | "FAIL";
  passedRules: number;
  failedRules: number;
  skippedRules: number;
  rules: RulesEngineRuleResult[];
  warnings: string[];
  disclaimer: string;
};

export type CommanderChoice = {
  name: string;
  colorIdentity: string[];
};

export type CommanderInfo = {
  detectedFromSection: string | null;
  selectedName: string | null;
  selectedColorIdentity: string[];
  selectedManaCost: string | null;
  selectedCmc: number | null;
  selectedArtUrl: string | null;
  selectedCardImageUrl: string | null;
  source: "section" | "manual" | "none";
  options: CommanderChoice[];
  needsManualSelection: boolean;
};

export type RoleSuggestion = {
  key: Exclude<CountKey, "lands">;
  label: string;
  currentCount: number;
  recommendedRange: string;
  suggestions: string[];
};

export type ImprovementSuggestions = {
  colorIdentity: string[];
  items: RoleSuggestion[];
  disclaimer: string;
};

export type RoleBreakdown = Record<keyof RoleCounts, NamedCount[]>;

export type TutorSummary = {
  trueTutors: number;
  tutorSignals: number;
  trueTutorBreakdown: NamedCount[];
  tutorSignalOnlyBreakdown: NamedCount[];
  disclaimer: string;
};

export type WinStyle = "COMBAT" | "COMBO" | "DRAIN" | "LOCK" | "COMMANDER_DAMAGE";
export type SpeedBand = "SLOW" | "MID" | "FAST" | "VERY_FAST";
export type ConsistencyBucket = "LOW" | "MED" | "HIGH";
export type ImpactSeverity = "INFO" | "WARN";

export type RuleZeroWinStyle = {
  primary: WinStyle;
  secondary: WinStyle | null;
  evidence: string[];
};

export type RuleZeroSpeed = {
  value: SpeedBand;
  turnBand: "10+" | "7-9" | "5-6" | "<=4";
  explanation: string;
};

export type RuleZeroConsistency = {
  score: number;
  bucket: ConsistencyBucket;
  commanderEngine: boolean;
  explanation: string;
};

export type RuleZeroTableImpactFlag = {
  kind: "extraTurns" | "massLandDenial" | "staxPieces" | "freeInteraction" | "fastMana";
  severity: ImpactSeverity;
  count: number;
  message: string;
  cards: string[];
};

export type RuleZeroTableImpact = {
  flags: RuleZeroTableImpactFlag[];
  extraTurnsCount: number;
  massLandDenialCount: number;
  staxPiecesCount: number;
  freeInteractionCount: number;
  fastManaCount: number;
};

export type RuleZeroReport = {
  winStyle: RuleZeroWinStyle;
  speedBand: RuleZeroSpeed;
  consistency: RuleZeroConsistency;
  tableImpact: RuleZeroTableImpact;
  disclaimer: string;
};

export type OpeningHandSimulationReport = {
  simulations: number;
  playableHands: number;
  deadHands: number;
  rampInOpening: number;
  playablePct: number;
  deadPct: number;
  rampInOpeningPct: number;
  averageFirstSpellTurn: number | null;
  estimatedCommanderCastTurn: number | null;
  cardCounts: {
    lands: number;
    rampCards: number;
    manaRocks: number;
  };
  totalDeckSize: number;
  unknownCardCount: number;
  disclaimer: string;
};

// Commander brackets report returned by the API.
export type BracketReport = {
  estimatedBracket: number;
  estimatedLabel: string;
  gameChangersVersion: string;
  gameChangersCount: number;
  bracket3AllowanceText: string | null;
  gameChangersFound: NamedCount[];
  extraTurnsCount: number;
  extraTurnCards: NamedCount[];
  massLandDenialCount: number;
  massLandDenialCards: NamedCount[];
  notes: string[];
  warnings: string[];
  explanation: string;
  disclaimer: string;
};

// End-to-end API response contract consumed by the UI.
export type AnalyzeResponse = {
  schemaVersion: "1.0";
  input: {
    deckPriceMode: DeckPriceMode;
    targetBracket: number | null;
    expectedWinTurn: ExpectedWinTurn | null;
    commanderName: string | null;
    userCedhFlag: boolean;
    userHighPowerNoGCFlag: boolean;
  };
  commander: CommanderInfo;
  parsedDeck: ParsedDeckCard[];
  unknownCards: string[];
  summary: DeckSummary;
  metrics: DeckSummary;
  roles: RoleCounts;
  roleBreakdown?: RoleBreakdown;
  tutorSummary?: TutorSummary;
  checks: DeckChecks;
  rulesEngine?: RulesEngineReport;
  deckHealth: DeckHealthReport;
  deckPrice?: DeckPriceSummary;
  openingHandSimulation?: OpeningHandSimulationReport;
  archetypeReport: DeckArchetypeReport;
  comboReport: ComboReport;
  ruleZero: RuleZeroReport;
  improvementSuggestions: ImprovementSuggestions;
  warnings: string[];
  bracketReport: BracketReport;
};
