import { Checks } from "@/components/Checks";
import { DeckHealth } from "@/components/DeckHealth";
import { ImprovementSuggestions } from "@/components/ImprovementSuggestions";
import { RecommendedCounts } from "@/components/RecommendedCounts";
import type { AnalyzeResponse } from "@/lib/contracts";

const CURVE_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7+"];

function labelForColor(color: string): string {
  if (color === "W") return "White";
  if (color === "U") return "Blue";
  if (color === "B") return "Black";
  if (color === "R") return "Red";
  if (color === "G") return "Green";
  return color;
}

function cardLabel(entry: AnalyzeResponse["parsedDeck"][number]): string {
  return entry.resolvedName ?? entry.name;
}

type AnalysisReportProps = {
  result: AnalyzeResponse;
};

/**
 * Read-only report renderer shared by the main analysis page and /report/[hash].
 */
export function AnalysisReport({ result }: AnalysisReportProps) {
  const maxCurveCount = Math.max(...Object.values(result.summary.manaCurve), 0);

  return (
    <div className="results">
      <section>
        <h2>Summary</h2>
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
            <strong>
              {result.summary.colors.length > 0
                ? result.summary.colors.map(labelForColor).join(", ")
                : "Colorless"}
            </strong>
          </div>
        </div>
      </section>

      <section>
        <h2>Commander</h2>
        {result.commander.selectedName ? (
          <p>
            Selected commander: <strong>{result.commander.selectedName}</strong>{" "}
            <span className="muted">
              ({result.commander.selectedColorIdentity.length > 0
                ? result.commander.selectedColorIdentity.join("/")
                : "Colorless"})
            </span>
          </p>
        ) : (
          <p className="muted">
            No commander selected yet. If no Commander section is present in your list, select one in the
            input panel.
          </p>
        )}
      </section>

      <Checks checks={result.checks} />

      <section>
        <h2>Mana Curve</h2>
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
      </section>

      <section>
        <h2>Types</h2>
        <div className="chips">
          {Object.entries(result.summary.types).map(([type, count]) => (
            <span key={type} className="chip">
              {type}: {count}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2>Roles</h2>
        <p className="muted">Roles can overlap; one card may count for multiple role buckets.</p>
        <div className="chips">
          {Object.entries(result.roles).map(([role, count]) => (
            <span key={role} className="chip">
              {role}: {count}
            </span>
          ))}
        </div>
      </section>

      <RecommendedCounts rows={result.deckHealth.rows} />
      <DeckHealth report={result.deckHealth} />
      <ImprovementSuggestions suggestions={result.improvementSuggestions} />

      <section>
        <h2>Commander Brackets Report</h2>
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
                {card.name}
                {card.qty > 1 ? ` x${card.qty}` : ""} <span className="gc-badge">{"\u2B50"} Game Changer</span>
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
                {card.name}
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
                {card.name}
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
      </section>

      <section>
        <h2>Detected Cards</h2>
        <details>
          <summary>Show parsed cards ({result.parsedDeck.length})</summary>
          <ul className="detected-cards">
            {result.parsedDeck.map((entry) => (
              <li key={entry.name.toLowerCase()}>
                {entry.qty} {cardLabel(entry)}
                {entry.isGameChanger ? <span className="gc-badge">{"\u2B50"} Game Changer</span> : null}
                {!entry.known ? <span className="unknown-badge">Unknown</span> : null}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
