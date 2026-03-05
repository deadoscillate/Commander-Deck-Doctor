import type { GameState } from "@/lib/engineClient";

type PlayersPanelProps = {
  state: GameState;
};

function commanderDamageTaken(state: GameState, playerId: string): Array<{ commanderName: string; amount: number }> {
  const rows: Array<{ commanderName: string; amount: number }> = [];

  for (const [commanderId, byPlayer] of Object.entries(state.commander.damageByCommanderToPlayer)) {
    const amount = byPlayer[playerId] ?? 0;
    if (amount <= 0) {
      continue;
    }

    rows.push({
      commanderName: state.cardInstances[commanderId]?.definition.name ?? commanderId,
      amount
    });
  }

  rows.sort((a, b) => b.amount - a.amount || a.commanderName.localeCompare(b.commanderName));
  return rows;
}

export function PlayersPanel({ state }: PlayersPanelProps) {
  return (
    <section className="sandbox-panel">
      <h2>Players</h2>
      <div className="sandbox-player-list">
        {state.players.map((player) => {
          const damageRows = commanderDamageTaken(state, player.id);
          return (
            <article key={player.id} className="sandbox-player-card">
              <div className="sandbox-player-head">
                <strong>{player.name}</strong>
                <span className={`status-chip${player.lost ? " sandbox-chip-danger" : ""}`}>
                  {player.lost ? "Lost" : `Life ${player.life}`}
                </span>
              </div>

              <p className="muted">
                Hand {player.zones.hand.cardIds.length} | Library {player.zones.library.cardIds.length} | Graveyard{" "}
                {player.zones.graveyard.cardIds.length} | Exile {player.zones.exile.cardIds.length}
              </p>

              <div className="sandbox-damage-block">
                <span className="muted">Commander damage taken</span>
                {damageRows.length === 0 ? (
                  <p className="muted">None</p>
                ) : (
                  <ul>
                    {damageRows.map((row) => (
                      <li key={`${player.id}-${row.commanderName}`}>
                        {row.commanderName}: {row.amount}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
