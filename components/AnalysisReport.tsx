import { Checks } from "@/components/Checks";
import { CardNameHover } from "@/components/CardNameHover";
import { ColorIdentityIcons } from "@/components/ColorIdentityIcons";
import { CommanderHeroHeader } from "@/components/CommanderHeroHeader";
import { DeckHealth } from "@/components/DeckHealth";
import { ImprovementSuggestions } from "@/components/ImprovementSuggestions";
import { ManaCost } from "@/components/ManaCost";
import { RecommendedCounts } from "@/components/RecommendedCounts";
import { RoleBars } from "@/components/RoleBars";
import type { AnalyzeResponse, RoleBreakdown } from "@/lib/contracts";
import { getStatusMeta } from "@/lib/ui/statusStyles";

const CURVE_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7+"];
const FALLBACK_RULE_ZERO = {
  winStyle: {
    primary: "COMBAT",
    secondary: null,
    evidence: []
  },
  speedBand: {
    value: "MID",
    turnBand: "7-9",
    explanation: "No speed heuristics available."
  },
  consistency: {
    score: 0,
    bucket: "LOW",
    commanderEngine: false,
    explanation: "No consistency heuristics available."
  },
  tableImpact: {
    flags: [],
    extraTurnsCount: 0,
    massLandDenialCount: 0,
    staxPiecesCount: 0,
    freeInteractionCount: 0,
    fastManaCount: 0
  },
  disclaimer: "Rule 0 Snapshot is a heuristic conversation layer."
} as const;

const TABLE_TALK_META: Record<string, { icon: string; label: string }> = {
  fastMana: { icon: "\u26A1", label: "Fast Mana" },
  tutors: { icon: "\uD83C\uDF93", label: "Tutors" },
  extraTurns: { icon: "\uD83C\uDF00", label: "Extra Turns" },
  staxPieces: { icon: "\uD83E\uDDEA", label: "Stax / Tax" },
  massLandDenial: { icon: "\uD83E\uDDE8", label: "Mass Land Denial" },
  freeInteraction: { icon: "\uD83D\uDEE1", label: "Free Interaction" }
};

type TableTalkRow = {
  key: string;
  severity: "WARN" | "INFO";
  label: string;
  icon: string;
  count: number;
  message: string;
  cards: string[];
};

function cardLabel(entry: AnalyzeResponse["parsedDeck"][number]): string {
  return entry.resolvedName ?? entry.name;
}

function labelForWinStyle(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  if (value === "COMMANDER_DAMAGE") {
    return "Commander Damage";
  }

  const lower = value.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function labelForSpeedBand(value: string | null | undefined): string {
  if (!value) return "Unknown";
  if (value === "VERY_FAST") return "Very Fast";
  if (value === "FAST") return "Fast";
  if (value === "MID") return "Mid";
  return "Slow";
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatUsd(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `$${value.toFixed(2)}`;
}

function formatTix(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)} tix`;
}

function toRatio(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function toPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function toNullableFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatTurnEstimate(value: number | null): string {
  return value === null ? "N/A" : `Turn ${value.toFixed(1)}`;
}

function normalizeDeckPrice(result: AnalyzeResponse): {
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
  disclaimer: string;
} | null {
  const rawDeckPrice = (result as { deckPrice?: unknown }).deckPrice;
  if (!rawDeckPrice || typeof rawDeckPrice !== "object") {
    return null;
  }

  const record = rawDeckPrice as Record<string, unknown>;
  const totalsRecord =
    record.totals && typeof record.totals === "object"
      ? (record.totals as Record<string, unknown>)
      : {};
  const pricedCardQtyRecord =
    record.pricedCardQty && typeof record.pricedCardQty === "object"
      ? (record.pricedCardQty as Record<string, unknown>)
      : {};
  const coverageRecord =
    record.coverage && typeof record.coverage === "object"
      ? (record.coverage as Record<string, unknown>)
      : {};

  return {
    totals: {
      usd: typeof totalsRecord.usd === "number" && Number.isFinite(totalsRecord.usd) ? totalsRecord.usd : null,
      usdFoil:
        typeof totalsRecord.usdFoil === "number" && Number.isFinite(totalsRecord.usdFoil)
          ? totalsRecord.usdFoil
          : null,
      usdEtched:
        typeof totalsRecord.usdEtched === "number" && Number.isFinite(totalsRecord.usdEtched)
          ? totalsRecord.usdEtched
          : null,
      tix: typeof totalsRecord.tix === "number" && Number.isFinite(totalsRecord.tix) ? totalsRecord.tix : null
    },
    pricedCardQty: {
      usd: toFiniteNumber(pricedCardQtyRecord.usd, 0),
      usdFoil: toFiniteNumber(pricedCardQtyRecord.usdFoil, 0),
      usdEtched: toFiniteNumber(pricedCardQtyRecord.usdEtched, 0),
      tix: toFiniteNumber(pricedCardQtyRecord.tix, 0)
    },
    totalKnownCardQty: toFiniteNumber(record.totalKnownCardQty, 0),
    coverage: {
      usd: toRatio(coverageRecord.usd),
      usdFoil: toRatio(coverageRecord.usdFoil),
      usdEtched: toRatio(coverageRecord.usdEtched),
      tix: toRatio(coverageRecord.tix)
    },
    disclaimer:
      typeof record.disclaimer === "string" && record.disclaimer
        ? record.disclaimer
        : "Totals are quantity-weighted Scryfall prices for resolved cards only."
  };
}

function normalizeCommanderInfo(result: AnalyzeResponse): {
  name: string | null;
  colorIdentity: string[];
  manaCost: string | null;
  cmc: number | null;
  artUrl: string | null;
} {
  const rawCommander = (result as { commander?: unknown }).commander;
  const commanderRecord =
    rawCommander && typeof rawCommander === "object" ? (rawCommander as Record<string, unknown>) : {};
  const cmc = toFiniteNumber(commanderRecord.selectedCmc, NaN);

  return {
    name:
      typeof commanderRecord.selectedName === "string" && commanderRecord.selectedName
        ? commanderRecord.selectedName
        : null,
    colorIdentity: toStringArray(commanderRecord.selectedColorIdentity),
    manaCost:
      typeof commanderRecord.selectedManaCost === "string" && commanderRecord.selectedManaCost
        ? commanderRecord.selectedManaCost
        : null,
    cmc: Number.isFinite(cmc) ? cmc : null,
    artUrl:
      typeof commanderRecord.selectedArtUrl === "string" && commanderRecord.selectedArtUrl
        ? commanderRecord.selectedArtUrl
        : null
  };
}

function normalizeOpeningHandSimulation(result: AnalyzeResponse): {
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
} | null {
  const rawSimulation = (result as { openingHandSimulation?: unknown }).openingHandSimulation;
  if (!rawSimulation || typeof rawSimulation !== "object") {
    return null;
  }

  const record = rawSimulation as Record<string, unknown>;
  const rawCardCounts =
    record.cardCounts && typeof record.cardCounts === "object"
      ? (record.cardCounts as Record<string, unknown>)
      : {};

  return {
    simulations: Math.max(0, Math.floor(toFiniteNumber(record.simulations, 0))),
    playableHands: Math.max(0, Math.floor(toFiniteNumber(record.playableHands, 0))),
    deadHands: Math.max(0, Math.floor(toFiniteNumber(record.deadHands, 0))),
    rampInOpening: Math.max(0, Math.floor(toFiniteNumber(record.rampInOpening, 0))),
    playablePct: toPercent(record.playablePct),
    deadPct: toPercent(record.deadPct),
    rampInOpeningPct: toPercent(record.rampInOpeningPct),
    averageFirstSpellTurn: toNullableFiniteNumber(record.averageFirstSpellTurn),
    estimatedCommanderCastTurn: toNullableFiniteNumber(record.estimatedCommanderCastTurn),
    cardCounts: {
      lands: Math.max(0, Math.floor(toFiniteNumber(rawCardCounts.lands, 0))),
      rampCards: Math.max(0, Math.floor(toFiniteNumber(rawCardCounts.rampCards, 0))),
      manaRocks: Math.max(0, Math.floor(toFiniteNumber(rawCardCounts.manaRocks, 0)))
    },
    totalDeckSize: Math.max(0, Math.floor(toFiniteNumber(record.totalDeckSize, 0))),
    unknownCardCount: Math.max(0, Math.floor(toFiniteNumber(record.unknownCardCount, 0))),
    disclaimer:
      typeof record.disclaimer === "string" && record.disclaimer.trim()
        ? record.disclaimer
        : "Simulation is an estimate using simplified opening-hand heuristics."
  };
}

function normalizeRuleZero(result: AnalyzeResponse): {
  winStyle: {
    primary: string;
    secondary: string | null;
    evidence: string[];
  };
  speedBand: {
    value: string;
    turnBand: string;
    explanation: string;
  };
  consistency: {
    score: number;
    bucket: string;
    commanderEngine: boolean;
    explanation: string;
  };
  tableImpact: {
    flags: Array<{
      kind: string;
      severity: "WARN" | "INFO";
      count: number;
      message: string;
      cards: string[];
    }>;
    extraTurnsCount: number;
    massLandDenialCount: number;
    staxPiecesCount: number;
    freeInteractionCount: number;
    fastManaCount: number;
  };
  disclaimer: string;
} {
  const rawRuleZero = (result as { ruleZero?: unknown }).ruleZero;
  const ruleZeroRecord =
    rawRuleZero && typeof rawRuleZero === "object" ? (rawRuleZero as Record<string, unknown>) : {};
  const rawWinStyle =
    ruleZeroRecord.winStyle && typeof ruleZeroRecord.winStyle === "object"
      ? (ruleZeroRecord.winStyle as Record<string, unknown>)
      : {};
  const rawSpeedBand =
    ruleZeroRecord.speedBand && typeof ruleZeroRecord.speedBand === "object"
      ? (ruleZeroRecord.speedBand as Record<string, unknown>)
      : {};
  const rawConsistency =
    ruleZeroRecord.consistency && typeof ruleZeroRecord.consistency === "object"
      ? (ruleZeroRecord.consistency as Record<string, unknown>)
      : {};
  const rawTableImpact =
    ruleZeroRecord.tableImpact && typeof ruleZeroRecord.tableImpact === "object"
      ? (ruleZeroRecord.tableImpact as Record<string, unknown>)
      : {};

  const flags: Array<{
    kind: string;
    severity: "WARN" | "INFO";
    count: number;
    message: string;
    cards: string[];
  }> = Array.isArray(rawTableImpact.flags)
    ? rawTableImpact.flags
        .filter((flag): flag is Record<string, unknown> => Boolean(flag) && typeof flag === "object")
        .map((flag, index) => ({
          kind: typeof flag.kind === "string" && flag.kind ? flag.kind : `impact-${index}`,
          severity: flag.severity === "WARN" ? "WARN" : "INFO",
          count: toFiniteNumber(flag.count, 0),
          message:
            typeof flag.message === "string" && flag.message.trim()
              ? flag.message
              : "Potential table-impact signal detected.",
          cards: toStringArray(flag.cards)
        }))
    : [];

  return {
    winStyle: {
      primary:
        typeof rawWinStyle.primary === "string" && rawWinStyle.primary
          ? rawWinStyle.primary
          : FALLBACK_RULE_ZERO.winStyle.primary,
      secondary:
        typeof rawWinStyle.secondary === "string" && rawWinStyle.secondary ? rawWinStyle.secondary : null,
      evidence: toStringArray(rawWinStyle.evidence).slice(0, 8)
    },
    speedBand: {
      value:
        typeof rawSpeedBand.value === "string" && rawSpeedBand.value
          ? rawSpeedBand.value
          : FALLBACK_RULE_ZERO.speedBand.value,
      turnBand:
        typeof rawSpeedBand.turnBand === "string" && rawSpeedBand.turnBand
          ? rawSpeedBand.turnBand
          : FALLBACK_RULE_ZERO.speedBand.turnBand,
      explanation:
        typeof rawSpeedBand.explanation === "string" && rawSpeedBand.explanation
          ? rawSpeedBand.explanation
          : FALLBACK_RULE_ZERO.speedBand.explanation
    },
    consistency: {
      score: toFiniteNumber(rawConsistency.score, FALLBACK_RULE_ZERO.consistency.score),
      bucket:
        typeof rawConsistency.bucket === "string" && rawConsistency.bucket
          ? rawConsistency.bucket
          : FALLBACK_RULE_ZERO.consistency.bucket,
      commanderEngine:
        typeof rawConsistency.commanderEngine === "boolean"
          ? rawConsistency.commanderEngine
          : FALLBACK_RULE_ZERO.consistency.commanderEngine,
      explanation:
        typeof rawConsistency.explanation === "string" && rawConsistency.explanation
          ? rawConsistency.explanation
          : FALLBACK_RULE_ZERO.consistency.explanation
    },
    tableImpact: {
      flags,
      extraTurnsCount: toFiniteNumber(
        rawTableImpact.extraTurnsCount,
        FALLBACK_RULE_ZERO.tableImpact.extraTurnsCount
      ),
      massLandDenialCount: toFiniteNumber(
        rawTableImpact.massLandDenialCount,
        FALLBACK_RULE_ZERO.tableImpact.massLandDenialCount
      ),
      staxPiecesCount: toFiniteNumber(
        rawTableImpact.staxPiecesCount,
        FALLBACK_RULE_ZERO.tableImpact.staxPiecesCount
      ),
      freeInteractionCount: toFiniteNumber(
        rawTableImpact.freeInteractionCount,
        FALLBACK_RULE_ZERO.tableImpact.freeInteractionCount
      ),
      fastManaCount: toFiniteNumber(rawTableImpact.fastManaCount, FALLBACK_RULE_ZERO.tableImpact.fastManaCount)
    },
    disclaimer:
      typeof ruleZeroRecord.disclaimer === "string" && ruleZeroRecord.disclaimer
        ? ruleZeroRecord.disclaimer
        : FALLBACK_RULE_ZERO.disclaimer
  };
}

function normalizeRoleBreakdown(result: AnalyzeResponse): RoleBreakdown {
  const empty: RoleBreakdown = {
    ramp: [],
    draw: [],
    removal: [],
    wipes: [],
    tutors: [],
    protection: [],
    finishers: []
  };

  const rawRoleBreakdown = (result as { roleBreakdown?: unknown }).roleBreakdown;
  if (!rawRoleBreakdown || typeof rawRoleBreakdown !== "object") {
    return empty;
  }

  const roleBreakdownRecord = rawRoleBreakdown as Record<string, unknown>;
  const roleKeys = Object.keys(empty) as Array<keyof RoleBreakdown>;

  for (const roleKey of roleKeys) {
    const rows = roleBreakdownRecord[roleKey];
    if (!Array.isArray(rows)) {
      continue;
    }

    empty[roleKey] = rows
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      .map((row) => ({
        name: typeof row.name === "string" ? row.name.trim() : "",
        qty: Math.max(0, Math.floor(toFiniteNumber(row.qty, 0)))
      }))
      .filter((row) => row.name.length > 0 && row.qty > 0);
  }

  return empty;
}

type AnalysisReportProps = {
  result: AnalyzeResponse;
};

/**
 * Read-only report renderer shared by the main analysis page and /report/[hash].
 */
export function AnalysisReport({ result }: AnalysisReportProps) {
  const maxCurveCount = Math.max(...Object.values(result.summary.manaCurve), 0);
  const archetypeReport = result.archetypeReport ?? {
    primary: null,
    secondary: null,
    confidence: 0,
    counts: [],
    disclaimer: "Archetype detection is keyword-based and heuristic."
  };
  const comboReport = result.comboReport ?? {
    detected: [],
    databaseSize: 0,
    disclaimer: "Combo detection uses a curated static combo database."
  };
  const ruleZero = normalizeRuleZero(result);
  const roleBreakdown = normalizeRoleBreakdown(result);
  const commanderInfo = normalizeCommanderInfo(result);
  const deckPrice = normalizeDeckPrice(result);
  const openingHandSimulation = normalizeOpeningHandSimulation(result);

  const archetypeLabel =
    archetypeReport.primary?.archetype && archetypeReport.secondary?.archetype
      ? `${archetypeReport.primary.archetype} / ${archetypeReport.secondary.archetype}`
      : archetypeReport.primary?.archetype ?? null;

  const speedStatus =
    ruleZero.speedBand.value === "SLOW"
      ? "LOW"
      : ruleZero.speedBand.value === "MID"
        ? "MED"
        : "HIGH";
  const consistencyStatus =
    ruleZero.consistency.bucket === "LOW"
      ? "LOW"
      : ruleZero.consistency.bucket === "MED"
        ? "MED"
        : "HIGH";
  const impactWarnCount = ruleZero.tableImpact.flags.filter((item) => item.severity === "WARN").length;
  const impactInfoCount = ruleZero.tableImpact.flags.filter((item) => item.severity === "INFO").length;
  const impactStatus = impactWarnCount > 0 ? "LOW" : impactInfoCount > 0 ? "MED" : "OK";

  const tableTalkRows: TableTalkRow[] = [];
  for (const flag of ruleZero.tableImpact.flags) {
    const meta = TABLE_TALK_META[flag.kind] ?? {
      icon: "\u2022",
      label: flag.kind
    };

    tableTalkRows.push({
      key: flag.kind,
      severity: flag.severity,
      label: meta.label,
      icon: meta.icon,
      count: flag.count,
      message: flag.message,
      cards: flag.cards
    });
  }

  if (result.roles.tutors > 0) {
    tableTalkRows.push({
      key: "tutors",
      severity: "INFO",
      label: TABLE_TALK_META.tutors.label,
      icon: TABLE_TALK_META.tutors.icon,
      count: result.roles.tutors,
      message: `${result.roles.tutors} tutor signal${result.roles.tutors === 1 ? "" : "s"} detected.`,
      cards: []
    });
  }

  const tableTalkOrder = ["fastMana", "tutors", "extraTurns", "staxPieces", "massLandDenial", "freeInteraction"];
  tableTalkRows.sort((a, b) => {
    const aIndex = tableTalkOrder.indexOf(a.key);
    const bIndex = tableTalkOrder.indexOf(b.key);
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    return a.label.localeCompare(b.label);
  });

  return (
    <div className="results">
      {commanderInfo.name ? (
        <CommanderHeroHeader
          commander={{
            name: commanderInfo.name,
            colorIdentity: commanderInfo.colorIdentity,
            cmc: commanderInfo.cmc,
            artUrl: commanderInfo.artUrl
          }}
          archetypeLabel={archetypeLabel}
          bracketLabel={`Bracket ${result.bracketReport.estimatedBracket} - ${result.bracketReport.estimatedLabel}`}
        />
      ) : null}

      <section className="player-snapshot">
        <h2>Player Snapshot</h2>
        <ul>
          <li>
            Primary win: <strong>{labelForWinStyle(ruleZero.winStyle.primary)}</strong>
            {ruleZero.winStyle.secondary ? (
              <span> (backup: {labelForWinStyle(ruleZero.winStyle.secondary)})</span>
            ) : null}
          </li>
          <li>
            Estimated speed:{" "}
            <strong>
              {labelForSpeedBand(ruleZero.speedBand.value)} ({ruleZero.speedBand.turnBand})
            </strong>
          </li>
          <li>
            Consistency:{" "}
            <strong>
              {ruleZero.consistency.bucket} ({ruleZero.consistency.score})
            </strong>
          </li>
        </ul>
        <div className="snapshot-badges">
          <span className={`status-badge ${getStatusMeta(speedStatus).className}`}>
            {getStatusMeta(speedStatus).icon} Speed {getStatusMeta(speedStatus).label}
          </span>
          <span className={`status-badge ${getStatusMeta(consistencyStatus).className}`}>
            {getStatusMeta(consistencyStatus).icon} Consistency {getStatusMeta(consistencyStatus).label}
          </span>
          <span className={`status-badge ${getStatusMeta(impactStatus).className}`}>
            {getStatusMeta(impactStatus).icon} Table Impact {getStatusMeta(impactStatus).label}
          </span>
        </div>
        <p className="snapshot-note">{ruleZero.speedBand.explanation}</p>
      </section>

      <section>
        <h2>Table Talk Flags</h2>
        <p className="table-talk-intro muted">
          Rule 0 Snapshot is a quick read of how this deck may feel at the table.
        </p>
        <p className="table-talk-intro muted">
          Signals include fast mana, tutors, free interaction, extra turns, and lock pressure.
        </p>

        {tableTalkRows.length === 0 ? (
          <p className="muted">No major table talk flags detected from current heuristics.</p>
        ) : (
          <div className="table-talk-grid">
            {tableTalkRows.map((row) => {
              const status = row.severity === "WARN" ? "LOW" : "MED";
              const statusMeta = getStatusMeta(status);

              return (
                <div className="table-talk-item" key={row.key}>
                  <div className="table-talk-head">
                    <span className="table-talk-icon">{row.icon}</span>
                    <strong>{row.label}</strong>
                    <span className={`status-badge ${statusMeta.className}`}>
                      {statusMeta.icon} {statusMeta.label}
                    </span>
                  </div>
                  <p className="muted">
                    {row.message} {row.count > 0 ? `(x${row.count})` : ""}
                  </p>
                  {row.cards.length > 0 ? (
                    <ul className="table-talk-cards">
                      {row.cards.map((cardName) => (
                        <li key={`${row.key}-${cardName}`}>
                          <CardNameHover name={cardName} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2>Deck Basics</h2>
        <div className="summary-grid">
          <div className="summary-card">
            <span>Deck Size</span>
            <strong>{result.summary.deckSize}</strong>
          </div>
          <div className="summary-card">
            <span>Unique Cards</span>
            <strong>{result.summary.uniqueCards}</strong>
          </div>
          <div className="summary-card">
            <span>Avg Mana Value</span>
            <strong>{result.summary.averageManaValue.toFixed(2)}</strong>
          </div>
          <div className="summary-card">
            <span>Colors</span>
            <strong className="summary-color-icons">
              <ColorIdentityIcons identity={result.summary.colors} size={18} />
            </strong>
          </div>
          <div className="summary-card">
            <span>Deck Price (USD)</span>
            <strong>{deckPrice ? formatUsd(deckPrice.totals.usd) : "N/A"}</strong>
          </div>
        </div>
        {deckPrice ? (
          <p className="muted deck-price-meta">
            Foil {formatUsd(deckPrice.totals.usdFoil)} | Etched {formatUsd(deckPrice.totals.usdEtched)} |
            MTGO {formatTix(deckPrice.totals.tix)} | USD coverage{" "}
            {Math.round(deckPrice.coverage.usd * 100)}% ({deckPrice.pricedCardQty.usd}/{deckPrice.totalKnownCardQty}
            {" "}cards priced)
          </p>
        ) : null}
        {commanderInfo.name ? (
          <p>
            Commander:{" "}
            <strong>
              <CardNameHover name={commanderInfo.name} />
            </strong>{" "}
            <ColorIdentityIcons identity={commanderInfo.colorIdentity} size={17} className="commander-inline-icons" />
            <ManaCost manaCost={commanderInfo.manaCost} size={16} className="commander-inline-mana" />
          </p>
        ) : (
          <p className="muted">
            No commander selected yet. If no Commander section is present in your list, select one in the input
            panel.
          </p>
        )}
      </section>

      <section>
        <h2>Core Composition</h2>
        <RoleBars roles={result.roles} roleBreakdown={roleBreakdown} />

        <div className="technical-group">
          <h3>Mana Curve</h3>
          <div className="curve">
            {CURVE_ORDER.map((bucket) => {
              const value = result.summary.manaCurve[bucket] ?? 0;
              const width = maxCurveCount > 0 ? (value / maxCurveCount) * 100 : 0;
              return (
                <div className="curve-row" key={bucket}>
                  <span className="curve-label">{bucket}</span>
                  <div className="curve-bar-wrap">
                    <div className="curve-bar" style={{ width: `${width}%` }} />
                  </div>
                  <span className="curve-value">{value}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="technical-group">
          <h3>Types</h3>
          <div className="chips">
            {Object.entries(result.summary.types).map(([type, count]) => (
              <span key={type} className="chip">
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
      </section>

      <Checks checks={result.checks} />
      <RecommendedCounts rows={result.deckHealth.rows} />
      <DeckHealth report={result.deckHealth} />
      {openingHandSimulation ? (
        <section>
          <h2>Opening Hand Simulation</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <span>Playable Hands</span>
              <strong>{formatPercent(openingHandSimulation.playablePct)}</strong>
            </div>
            <div className="summary-card">
              <span>Dead Hands</span>
              <strong>{formatPercent(openingHandSimulation.deadPct)}</strong>
            </div>
            <div className="summary-card">
              <span>Ramp In Opening</span>
              <strong>{formatPercent(openingHandSimulation.rampInOpeningPct)}</strong>
            </div>
            <div className="summary-card">
              <span>Avg First Spell Turn</span>
              <strong>{formatTurnEstimate(openingHandSimulation.averageFirstSpellTurn)}</strong>
            </div>
            <div className="summary-card">
              <span>Estimated Commander Cast</span>
              <strong>{formatTurnEstimate(openingHandSimulation.estimatedCommanderCastTurn)}</strong>
            </div>
          </div>
          <p className="muted deck-price-meta">
            {openingHandSimulation.simulations} simulations | modeled cards:{" "}
            {openingHandSimulation.totalDeckSize} (lands {openingHandSimulation.cardCounts.lands}, ramp{" "}
            {openingHandSimulation.cardCounts.rampCards}, rocks {openingHandSimulation.cardCounts.manaRocks}, unknown{" "}
            {openingHandSimulation.unknownCardCount})
          </p>
          <p className="muted">{openingHandSimulation.disclaimer}</p>
        </section>
      ) : null}
      <ImprovementSuggestions suggestions={result.improvementSuggestions} />

      <section>
        <h2>Detected Cards</h2>
        <details>
          <summary>Show parsed cards ({result.parsedDeck.length})</summary>
          <ul className="detected-cards">
            {result.parsedDeck.map((entry) => (
              <li key={entry.name.toLowerCase()}>
                {entry.qty} <CardNameHover name={cardLabel(entry)} />
                {entry.isGameChanger ? <span className="gc-badge">{"\u2B50"} Game Changer</span> : null}
                {!entry.known ? <span className="unknown-badge">Unknown</span> : null}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section>
        <details className="technical-details">
          <summary>Show advanced analysis details</summary>

          <div className="technical-group">
            <h3>Archetype Signals</h3>
            <p>
              Primary: <strong>{archetypeReport.primary?.archetype ?? "Not enough signal detected"}</strong>
            </p>
            <p>
              Secondary: <strong>{archetypeReport.secondary?.archetype ?? "Not enough signal detected"}</strong>
            </p>
            <p className="muted">{archetypeReport.disclaimer}</p>
          </div>

          <div className="technical-group">
            <h3>Combo Detection</h3>
            {comboReport.detected.length === 0 ? (
              <p className="muted">No known combos detected from the current combo database.</p>
            ) : (
              <ul>
                {comboReport.detected.map((combo) => (
                  <li key={combo.comboName}>
                    <strong>{combo.comboName}</strong>:{" "}
                    {combo.cards.map((cardName, index) => (
                      <span key={`${combo.comboName}-${cardName}`}>
                        <CardNameHover name={cardName} />
                        {index < combo.cards.length - 1 ? " + " : ""}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted">
              Combos detected: {comboReport.detected.length} / {comboReport.databaseSize} tracked.
            </p>
          </div>

          <div className="technical-group">
            <h3>Commander Bracket Detail</h3>
            <p>
              Estimated bracket:{" "}
              <strong>
                {result.bracketReport.estimatedBracket} ({result.bracketReport.estimatedLabel})
              </strong>
            </p>
            <p className="muted">{result.bracketReport.explanation}</p>
            {result.bracketReport.gameChangersFound.length > 0 ? (
              <ul>
                {result.bracketReport.gameChangersFound.map((card) => (
                  <li key={card.name}>
                    <CardNameHover name={card.name} />
                    {card.qty > 1 ? ` x${card.qty}` : ""}{" "}
                    <span className="gc-badge">{"\u2B50"} Game Changer</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {result.bracketReport.warnings.length > 0 ? (
              <ul className="warnings">
                {result.bracketReport.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <p className="muted">{result.bracketReport.disclaimer}</p>
          </div>
        </details>
      </section>
    </div>
  );
}

