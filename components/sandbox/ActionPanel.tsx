import type { ActionDescriptor } from "@/lib/engineClient";

type ActionPanelProps = {
  actions: ActionDescriptor[];
  replayMode: boolean;
  onAction: (action: ActionDescriptor) => void;
  onNextStep: () => void;
  onNextTurn: () => void;
  onAutoResolveStack: () => void;
  onReturnToLive: () => void;
};

const GROUP_LABELS: Record<ActionDescriptor["group"], string> = {
  priority: "Priority",
  land: "Play Land",
  cast: "Cast Spells",
  ability: "Activate Abilities",
  combat: "Combat"
};

export function ActionPanel({
  actions,
  replayMode,
  onAction,
  onNextStep,
  onNextTurn,
  onAutoResolveStack,
  onReturnToLive
}: ActionPanelProps) {
  const grouped: Record<ActionDescriptor["group"], ActionDescriptor[]> = {
    priority: [],
    land: [],
    cast: [],
    ability: [],
    combat: []
  };

  for (const action of actions) {
    grouped[action.group].push(action);
  }

  return (
    <section className="sandbox-panel sandbox-actions-panel">
      <h2>Actions</h2>

      {replayMode ? (
        <div className="sandbox-replay-warning">
          <p>Replay mode: return to Live to play.</p>
          <button type="button" onClick={onReturnToLive}>
            Return to Live
          </button>
        </div>
      ) : null}

      <div className="sandbox-step-controls">
        <button type="button" onClick={onNextStep} disabled={replayMode}>
          Next Step
        </button>
        <button type="button" onClick={onNextTurn} disabled={replayMode}>
          Next Turn
        </button>
        <button type="button" onClick={onAutoResolveStack} disabled={replayMode}>
          Auto-Resolve Stack
        </button>
      </div>

      <div className="sandbox-action-groups">
        {(Object.keys(grouped) as Array<keyof typeof grouped>).map((group) => {
          const rows = grouped[group];
          if (rows.length === 0) {
            return null;
          }

          return (
            <div key={group} className="sandbox-action-group">
              <h3>{GROUP_LABELS[group]}</h3>
              <div className="sandbox-inline-actions">
                {rows.map((row, index) => (
                  <button
                    key={`${group}-${row.label}-${index}`}
                    type="button"
                    disabled={replayMode}
                    onClick={() => onAction(row)}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {!replayMode && actions.length === 0 ? <p className="muted">No legal actions for the priority holder.</p> : null}
    </section>
  );
}
