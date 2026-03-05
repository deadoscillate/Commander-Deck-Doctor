import { CardLink } from "@/components/CardLink";
import type { GameState } from "@/lib/engineClient";

function stackLabel(state: GameState, item: GameState["stack"][number]): string {
  if (item.kind === "SPELL") {
    return state.cardInstances[item.cardId]?.definition.name ?? item.cardId;
  }

  const sourceName = state.cardInstances[item.sourceCardId]?.definition.name ?? item.sourceCardId;
  return `${sourceName} (${item.abilityId})`;
}

function targetSummary(state: GameState, targetIds: string[]): string {
  if (targetIds.length === 0) {
    return "No targets";
  }

  return targetIds
    .map((id) => state.players.find((row) => row.id === id)?.name ?? state.cardInstances[id]?.definition.name ?? id)
    .join(", ");
}

export function StackPanel({ state }: { state: GameState }) {
  const rows = [...state.stack].reverse();

  return (
    <section className="sandbox-panel">
      <h2>Stack</h2>
      {rows.length === 0 ? (
        <p className="muted">Stack is empty.</p>
      ) : (
        <ol className="sandbox-stack-list">
          {rows.map((item, index) => (
            <li
              key={item.id}
              className={`sandbox-stack-item${index === 0 ? " sandbox-stack-item-top" : ""}`}
            >
              <div className="sandbox-stack-head">
                <strong>
                  <CardLink name={stackLabel(state, item)} />
                </strong>
                <span className="status-chip">{item.kind === "SPELL" ? "Spell" : "Ability"}</span>
              </div>
              <p className="muted">Targets: {targetSummary(state, item.targetIds)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
