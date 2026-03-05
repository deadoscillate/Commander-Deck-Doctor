import { CardLink } from "@/components/CardLink";
import type { ActionDescriptor, GameState } from "@/lib/engineClient";

type BattlefieldPanelProps = {
  state: GameState;
  selectedCardId: string | null;
  onSelectCard: (cardId: string | null) => void;
  activationActions: ActionDescriptor[];
  onActivateAction: (action: ActionDescriptor) => void;
  actionsDisabled: boolean;
};

function countersLabel(counters: Record<string, number>): string | null {
  const rows = Object.entries(counters).filter(([, value]) => value > 0);
  if (rows.length === 0) {
    return null;
  }

  return rows.map(([name, value]) => `${name} ${value}`).join(", ");
}

export function BattlefieldPanel({
  state,
  selectedCardId,
  onSelectCard,
  activationActions,
  onActivateAction,
  actionsDisabled
}: BattlefieldPanelProps) {
  const selectedCard = selectedCardId ? state.cardInstances[selectedCardId] : null;
  const selectedActions = activationActions.filter(
    (row) => row.action.type === "ACTIVATE_ABILITY" && row.action.sourceCardId === selectedCardId
  );

  return (
    <section className="sandbox-panel">
      <h2>Battlefield</h2>

      <div className="sandbox-battlefield-groups">
        {state.players.map((player) => (
          <article key={player.id} className="sandbox-player-card">
            <div className="sandbox-player-head">
              <strong>{player.name}</strong>
              <span className="status-chip">{player.zones.battlefield.cardIds.length} permanents</span>
            </div>

            {player.zones.battlefield.cardIds.length === 0 ? (
              <p className="muted">No permanents.</p>
            ) : (
              <div className="sandbox-permanent-grid">
                {player.zones.battlefield.cardIds.map((cardId) => {
                  const card = state.cardInstances[cardId];
                  const counters = countersLabel(card?.counters ?? {});
                  const selected = cardId === selectedCardId;
                  return (
                    <button
                      key={cardId}
                      type="button"
                      className={`sandbox-permanent-chip${selected ? " sandbox-permanent-chip-selected" : ""}`}
                      onClick={() => onSelectCard(selected ? null : cardId)}
                    >
                      <span className="sandbox-permanent-name">
                        <CardLink name={card?.definition.name ?? cardId} />
                      </span>
                      <span className="sandbox-permanent-meta">
                        {card?.tapped ? "Tapped" : "Untapped"}
                        {counters ? ` | ${counters}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>

      {selectedCard ? (
        <aside className="sandbox-card-inspector">
          <h3>{selectedCard.definition.name}</h3>
          <p className="muted">{selectedCard.definition.typeLine}</p>
          <p className="muted">Controller: {state.players.find((row) => row.id === selectedCard.controllerId)?.name ?? selectedCard.controllerId}</p>

          {selectedActions.length === 0 ? (
            <p className="muted">No legal activated abilities right now.</p>
          ) : (
            <div className="sandbox-inline-actions">
              {selectedActions.map((row) => (
                <button
                  key={`${selectedCard.id}-${row.label}`}
                  type="button"
                  disabled={actionsDisabled}
                  onClick={() => onActivateAction(row)}
                >
                  {row.label}
                </button>
              ))}
            </div>
          )}
        </aside>
      ) : null}
    </section>
  );
}
