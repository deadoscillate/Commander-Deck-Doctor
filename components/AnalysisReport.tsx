import { Checks } from "@/components/Checks";
import { CardNameHover } from "@/components/CardNameHover";
import { ColorIdentityIcons } from "@/components/ColorIdentityIcons";
import { CommanderHeroHeader } from "@/components/CommanderHeroHeader";
import { DeckHealth } from "@/components/DeckHealth";
import { ImprovementSuggestions } from "@/components/ImprovementSuggestions";
import { ManaCost } from "@/components/ManaCost";
import { RecommendedCounts } from "@/components/RecommendedCounts";
import type { AnalyzeResponse } from "@/lib/contracts";

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

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
  const commanderInfo = normalizeCommanderInfo(result);

  const confidencePercent = `${Math.round(archetypeReport.confidence * 100)}%`;
  const warnImpactCount = ruleZero.tableImpact.flags.filter((flag) => flag.severity === "WARN").length;
  const infoImpactCount = ruleZero.tableImpact.flags.filter((flag) => flag.severity === "INFO").length;
  const impactHeadline =
    warnImpactCount > 0
      ? `${pluralize(warnImpactCount, "warn flag")} to mention before the game.`
      : infoImpactCount > 0
        ? `${pluralize(infoImpactCount, "info flag")} for table context.`
        : "No major impact flags detected.";

  return (
    <div className="results">
      {commanderInfo.name ? (
        <CommanderHeroHeader
          commander={{
            name: commanderInfo.name,
            colorIdentity: commanderInfo.colorIdentity,
            cmc: commanderInfo.cmc,
            manaCost: commanderInfo.manaCost,
            artUrl: commanderInfo.artUrl
          }}
          bracketLabel={`Bracket ${result.bracketReport.estimatedBracket} - ${result.bracketReport.estimatedLabel}`}
        />
      ) : null}

      <section className="player-snapshot">
        <h2>Player Snapshot</h2>
        <p className="muted">Quick Rule 0 read: game plan, speed, consistency, and pressure points.</p>
        <div className="snapshot-grid">
          <div className="snapshot-card">
            <span>How this deck wins</span>
            <strong>{labelForWinStyle(ruleZero.winStyle.primary)}</strong>
            {ruleZero.winStyle.secondary ? (
              <p className="muted">Backup: {labelForWinStyle(ruleZero.winStyle.secondary)}</p>
            ) : (
              <p className="muted">No strong secondary signal.</p>
            )}
          </div>
          <div className="snapshot-card">
            <span>Estimated speed</span>
            <strong>
              {labelForSpeedBand(ruleZero.speedBand.value)} ({ruleZero.speedBand.turnBand})
            </strong>
            <p className="muted">{ruleZero.speedBand.value === "SLOW" ? "Long game pace" : "Can apply pressure early"}</p>
          </div>
          <div className="snapshot-card">
            <span>Consistency</span>
            <strong>
              {ruleZero.consistency.bucket} ({ruleZero.consistency.score})
            </strong>
            <p className="muted">{ruleZero.consistency.commanderEngine ? "Commander helps engine" : "Commander not a major engine"}</p>
          </div>
          <div className="snapshot-card">
            <span>Table impact</span>
            <strong>{impactHeadline}</strong>
            <p className="muted">
              {pluralize(ruleZero.tableImpact.fastManaCount, "fast mana")},{" "}
              {pluralize(ruleZero.tableImpact.freeInteractionCount, "free interaction")}
            </p>
          </div>
        </div>
        <p className="snapshot-note">{ruleZero.speedBand.explanation}</p>
        <p className="snapshot-note">{ruleZero.consistency.explanation}</p>
        {ruleZero.winStyle.evidence.length > 0 ? (
          <details className="checks-details">
            <summary>Show win-plan evidence cards</summary>
            <ul>
              {ruleZero.winStyle.evidence.map((name) => (
                <li key={name}>
                  <CardNameHover name={name} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section>
        <h2>Table Talk Flags</h2>
        {ruleZero.tableImpact.flags.length === 0 ? (
          <p className="muted">No major table-impact flags detected from current heuristics.</p>
        ) : (
          <ul className="impact-list">
            {ruleZero.tableImpact.flags.map((flag) => (
              <li key={flag.kind} className="impact-item">
                <span
                  className={`impact-badge ${
                    flag.severity === "WARN" ? "impact-badge-warn" : "impact-badge-info"
                  }`}
                >
                  {flag.severity}
                </span>
                <span>{flag.message}</span>
                {flag.cards.length > 0 ? (
                  <details className="checks-details">
                    <summary>Show cards</summary>
                    <ul>
                      {flag.cards.map((name) => (
                        <li key={`${flag.kind}-${name}`}>
                          <CardNameHover name={name} />
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="muted">{ruleZero.disclaimer}</p>
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
        </div>
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
            No commander selected yet. If no Commander section is present in your list, select one in the
            input panel.
          </p>
        )}
      </section>

      <Checks checks={result.checks} />

      <RecommendedCounts rows={result.deckHealth.rows} />
      <DeckHealth report={result.deckHealth} />
      <ImprovementSuggestions suggestions={result.improvementSuggestions} />

      <section>
        <details className="technical-details">
          <summary>Show detailed analysis (curve, archetype, combos, brackets)</summary>

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

          <div className="technical-group">
            <h3>Roles</h3>
            <p className="muted">Roles can overlap; one card may count for multiple role buckets.</p>
            <div className="chips">
              {Object.entries(result.roles).map(([role, count]) => (
                <span key={role} className="chip">
                  {role}: {count}
                </span>
              ))}
            </div>
          </div>

          <div className="technical-group">
            <h3>Deck Archetype</h3>
            <p>
              Primary: <strong>{archetypeReport.primary?.archetype ?? "Not enough signal detected"}</strong>
            </p>
            <p>
              Secondary: <strong>{archetypeReport.secondary?.archetype ?? "Not enough signal detected"}</strong>
            </p>
            <p>
              Confidence: <strong>{confidencePercent}</strong>
            </p>
            {archetypeReport.counts.length > 0 ? (
              <div className="chips">
                {archetypeReport.counts.slice(0, 4).map((item) => (
                  <span key={item.archetype} className="chip">
                    {item.archetype}: {item.tagCount}
                  </span>
                ))}
              </div>
            ) : null}
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
            <p className="muted">{comboReport.disclaimer}</p>
          </div>

          <div className="technical-group">
            <h3>Commander Brackets Report</h3>
            <p>
              Estimated bracket:{" "}
              <strong>
                {result.bracketReport.estimatedBracket} ({result.bracketReport.estimatedLabel})
              </strong>
            </p>
            <p>
              Game Changers found: {result.bracketReport.gameChangersCount}
              {result.bracketReport.bracket3AllowanceText ? (
                <span className="gc-progress"> ({result.bracketReport.bracket3AllowanceText})</span>
              ) : null}
            </p>
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
            ) : (
              <p className="muted">No Game Changers detected.</p>
            )}
            <p>Extra turns: {result.bracketReport.extraTurnsCount}</p>
            {result.bracketReport.extraTurnCards.length > 0 ? (
              <ul>
                {result.bracketReport.extraTurnCards.map((card) => (
                  <li key={card.name}>
                    <CardNameHover name={card.name} />
                    {card.qty > 1 ? ` x${card.qty}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            <p>Mass land denial flags: {result.bracketReport.massLandDenialCount}</p>
            {result.bracketReport.massLandDenialCards.length > 0 ? (
              <ul>
                {result.bracketReport.massLandDenialCards.map((card) => (
                  <li key={card.name}>
                    <CardNameHover name={card.name} />
                    {card.qty > 1 ? ` x${card.qty}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="explanation">{result.bracketReport.explanation}</p>
            {result.bracketReport.notes.length > 0 ? (
              <>
                <h3>Notes</h3>
                <ul>
                  {result.bracketReport.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {result.bracketReport.warnings.length > 0 ? (
              <>
                <h3>Warnings</h3>
                <ul className="warnings">
                  {result.bracketReport.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="muted">Game Changers version: {result.bracketReport.gameChangersVersion}</p>
            <p className="muted">{result.bracketReport.disclaimer}</p>
          </div>

          <div className="technical-group">
            <h3>Detected Cards</h3>
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
          </div>
        </details>
      </section>
    </div>
  );
}
