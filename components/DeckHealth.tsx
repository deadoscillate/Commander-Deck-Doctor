import type { DeckHealthReport } from "@/lib/contracts";

type DeckHealthProps = {
  report: DeckHealthReport;
};

export function DeckHealth({ report }: DeckHealthProps) {
  return (
    <section>
      <h2>Deck Health</h2>
      <p className="muted">{report.disclaimer}</p>

      {report.warnings.length > 0 ? (
        <ul className="health-list health-list-warn">
          {report.warnings.map((item) => (
            <li key={`warn-${item}`}>
              <span className="health-icon">{"\u26A0"}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No major warnings detected.</p>
      )}

      {report.okays.length > 0 ? (
        <ul className="health-list">
          {report.okays.map((item) => (
            <li key={`ok-${item}`}>
              <span className="health-icon">{"\u2713"}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
