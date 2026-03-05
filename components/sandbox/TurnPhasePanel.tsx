import type { GameState } from "@/lib/engineClient";

export function TurnPhasePanel({ state }: { state: GameState }) {
  const activePlayer = state.players[state.activePlayerIndex];
  const priorityPlayer = state.players.find((row) => row.id === state.priorityHolderPlayerId);

  return (
    <section className="sandbox-panel">
      <h2>Turn / Phase</h2>
      <div className="sandbox-turn-grid">
        <div className="summary-card">
          <span>Turn</span>
          <strong>{state.turnNumber}</strong>
        </div>
        <div className="summary-card">
          <span>Step</span>
          <strong>{state.step}</strong>
        </div>
        <div className="summary-card">
          <span>Active Player</span>
          <strong>{activePlayer?.name ?? "Unknown"}</strong>
        </div>
        <div className="summary-card">
          <span>Priority Holder</span>
          <strong>{priorityPlayer?.name ?? "None"}</strong>
        </div>
      </div>
    </section>
  );
}
