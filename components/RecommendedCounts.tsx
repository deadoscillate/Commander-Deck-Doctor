import type { RecommendedCountRow } from "@/lib/contracts";

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
            {rows.map((row) => (
              <tr key={row.key} className={statusClass(row.status)}>
                <td>{row.label}</td>
                <td>
                  {row.value} <span className="status-chip">{row.status}</span>
                </td>
                <td>{row.recommendedText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
