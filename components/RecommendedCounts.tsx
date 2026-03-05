import type { RecommendedCountRow } from "@/lib/contracts";
import { getStatusMeta } from "@/lib/ui/statusStyles";

type RecommendedCountsProps = {
  rows: RecommendedCountRow[];
};

function statusClass(status: RecommendedCountRow["status"]): string {
  if (status === "LOW") return "status-low";
  if (status === "HIGH") return "status-high";
  return "status-ok";
}

export function RecommendedCounts({ rows }: RecommendedCountsProps) {
  return (
    <section>
      <h2>Recommended Counts</h2>
      <p className="muted">Role counts are engine-tagged and may overlap when one card fills multiple jobs.</p>
      <div className="counts-table-wrap">
        <table className="counts-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Your deck</th>
              <th>Recommended</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = getStatusMeta(row.status);

              return (
                <tr key={row.key} className={statusClass(row.status)}>
                  <td>{row.label}</td>
                  <td>
                    {row.value}{" "}
                    <span className={`status-badge ${meta.className}`}>
                      {meta.icon} {meta.label}
                    </span>
                  </td>
                  <td>{row.recommendedText}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
