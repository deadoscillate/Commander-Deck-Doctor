import type { DeckHealthReport } from "@/lib/contracts";
import { getStatusMeta } from "@/lib/ui/statusStyles";

type DeckHealthProps = {
  report: DeckHealthReport;
};

export function DeckHealth({ report }: DeckHealthProps) {
  const okMeta = getStatusMeta("OK");
  const warningStatusByMessage = new Map(
    report.rows.filter((row) => row.status !== "OK").map((row) => [row.diagnostic, row.status] as const)
  );

  return (
    <section>
      <h2>Deck Health</h2>
      <p className="muted">{report.disclaimer}</p>

      {report.warnings.length > 0 ? (
        <ul className="health-list health-list-warn">
          {report.warnings.map((item) => {
            const status = warningStatusByMessage.get(item) ?? "LOW";
            const statusMeta = getStatusMeta(status === "HIGH" ? "HIGH" : "LOW");

            return (
              <li key={`warn-${item}`}>
                <span className={`status-badge ${statusMeta.className}`}>
                  {statusMeta.icon} {statusMeta.label}
                </span>
                <span>{item}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">No major warnings detected.</p>
      )}

      {report.okays.length > 0 ? (
        <ul className="health-list">
          {report.okays.map((item) => (
            <li key={`ok-${item}`}>
              <span className={`status-badge ${okMeta.className}`}>
                {okMeta.icon} {okMeta.label}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
