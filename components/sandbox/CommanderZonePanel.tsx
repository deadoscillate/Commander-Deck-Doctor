import { CardLink } from "@/components/CardLink";
import type { GameState } from "@/lib/engineClient";

type CommanderZonePanelProps = {
  state: GameState;
};

export function CommanderZonePanel({ state }: CommanderZonePanelProps) {
  return (
    <section className="sandbox-panel">
      <h2>Commander Zone</h2>

      <div className="sandbox-player-list">
        {state.players.map((player) => {
          const commanderIds = state.commander.commanderIdsByPlayer[player.id] ?? [];
          return (
            <article key={player.id} className="sandbox-player-card">
              <div className="sandbox-player-head">
                <strong>{player.name}</strong>
                <span className="status-chip">{commanderIds.length} commander(s)</span>
              </div>

              {commanderIds.length === 0 ? (
                <p className="muted">No commander configured.</p>
              ) : (
                <ul className="sandbox-commander-list">
                  {commanderIds.map((commanderId) => {
                    const card = state.cardInstances[commanderId];
                    const castCount = state.commander.castCountByCommanderId[commanderId] ?? 0;
                    const tax = castCount * 2;
                    const damageMap = state.commander.damageByCommanderToPlayer[commanderId] ?? {};
                    const dealtRows = state.players
                      .filter((row) => row.id !== player.id)
                      .map((row) => ({
                        name: row.name,
                        amount: damageMap[row.id] ?? 0
                      }))
                      .filter((row) => row.amount > 0);

                    return (
                      <li key={`${player.id}-${commanderId}`} className="sandbox-commander-item">
                        <div className="sandbox-commander-head">
                          <CardLink name={card?.definition.name ?? commanderId} />
                          <span className="status-chip">Zone: {card?.currentZone ?? "unknown"}</span>
                        </div>
                        <p className="muted">Cast count: {castCount} | Tax: +{tax}</p>
                        {dealtRows.length > 0 ? (
                          <p className="muted">
                            Damage dealt: {dealtRows.map((row) => `${row.name} ${row.amount}`).join(" | ")}
                          </p>
                        ) : (
                          <p className="muted">Damage dealt: none</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
