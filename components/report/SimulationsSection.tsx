"use client";

import { useMemo, useState } from "react";
import { engineClient } from "@/lib/engineClient";
import type { GoldfishSimulationResult, OpeningHandSimulationResult } from "@/engine";
import type { OpeningHandSimulationReport } from "@/lib/contracts";

type DeckRow = {
  name: string;
  qty: number;
  resolvedName: string | null;
};

type SimulationsSectionProps = {
  deck: DeckRow[];
  commanderName: string | null;
  initialSummary?: OpeningHandSimulationReport | null;
};

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function barWidth(value: number): string {
  const safe = Math.max(0, Math.min(100, value));
  return `${safe}%`;
}

function asTurn(value: number | null): string {
  return value === null ? "N/A" : `Turn ${value.toFixed(1)}`;
}

function createSeed(): string {
  return `sandbox-${Date.now()}`;
}

export function SimulationsSection({ deck, commanderName, initialSummary = null }: SimulationsSectionProps) {
  const [runs, setRuns] = useState(100);
  const [advancedSeed, setAdvancedSeed] = useState(false);
  const [seedInput, setSeedInput] = useState("report-sim");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openingResult, setOpeningResult] = useState<OpeningHandSimulationResult | null>(null);
  const [goldfishResult, setGoldfishResult] = useState<GoldfishSimulationResult | null>(null);

  const deckPayload = useMemo(
    () =>
      deck
        .filter((entry) => entry.qty > 0)
        .map((entry) => ({
          name: entry.resolvedName ?? entry.name,
          qty: entry.qty
        })),
    [deck]
  );

  async function runSimulations() {
    setLoading(true);
    setError("");

    try {
      if (deckPayload.length === 0) {
        setError("No deck entries available for simulation.");
        setOpeningResult(null);
        setGoldfishResult(null);
        return;
      }

      const seed = advancedSeed ? seedInput.trim() || "report-sim" : createSeed();
      const opening = engineClient.simulate({
        type: "OPENING_HAND",
        deck: deckPayload,
        runs,
        seed,
        commander: commanderName
      });

      const goldfish = engineClient.simulate({
        type: "GOLDFISH",
        deck: deckPayload,
        runs,
        seed,
        commander: commanderName
      });

      if (opening.type !== "OPENING_HAND" || goldfish.type !== "GOLDFISH") {
        setError("Unexpected simulation response.");
        setOpeningResult(null);
        setGoldfishResult(null);
        return;
      }

      setOpeningResult(opening);
      setGoldfishResult(goldfish);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="simulations-details">
      <p className="muted">Run deterministic engine sims for opening hand quality and simplified goldfish pacing.</p>

      {!openingResult && initialSummary ? (
        <>
          <div className="summary-grid sim-grid">
            <div className="summary-card">
              <span>Playable Hands</span>
              <strong>{percent(initialSummary.playablePct)}</strong>
              <div className="sim-bar-track">
                <div className="sim-bar-fill" style={{ width: barWidth(initialSummary.playablePct) }} />
              </div>
            </div>
            <div className="summary-card">
              <span>Dead Hands</span>
              <strong>{percent(initialSummary.deadPct)}</strong>
              <div className="sim-bar-track">
                <div className="sim-bar-fill sim-bar-fill-warn" style={{ width: barWidth(initialSummary.deadPct) }} />
              </div>
            </div>
            <div className="summary-card">
              <span>Ramp In Opening</span>
              <strong>{percent(initialSummary.rampInOpeningPct)}</strong>
            </div>
            <div className="summary-card">
              <span>Avg First Spell Turn</span>
              <strong>{asTurn(initialSummary.averageFirstSpellTurn)}</strong>
            </div>
            <div className="summary-card">
              <span>Estimated Commander Cast</span>
              <strong>{asTurn(initialSummary.estimatedCommanderCastTurn)}</strong>
            </div>
          </div>
          <p className="muted deck-price-meta">
            {initialSummary.simulations} simulations | modeled cards: {initialSummary.totalDeckSize} (lands{" "}
            {initialSummary.cardCounts.lands}, ramp {initialSummary.cardCounts.rampCards}, rocks{" "}
            {initialSummary.cardCounts.manaRocks}, unknown {initialSummary.unknownCardCount})
          </p>
          <p className="muted">{initialSummary.disclaimer}</p>
        </>
      ) : null}

      <div className="sim-controls">
        <label htmlFor="sim-runs">Runs</label>
        <select id="sim-runs" value={runs} onChange={(event) => setRuns(Number(event.target.value))}>
          <option value={100}>100</option>
          <option value={1000}>1000</option>
          <option value={5000}>5000</option>
        </select>
        <label className="checkbox" htmlFor="sim-seed-toggle">
          <input
            id="sim-seed-toggle"
            type="checkbox"
            checked={advancedSeed}
            onChange={(event) => setAdvancedSeed(event.target.checked)}
          />
          Advanced seed
        </label>
        {advancedSeed ? (
          <input
            type="text"
            value={seedInput}
            onChange={(event) => setSeedInput(event.target.value)}
            placeholder="report-sim"
          />
        ) : null}
        <button type="button" onClick={() => void runSimulations()} disabled={loading}>
          {loading ? "Running..." : "Run Simulations"}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {openingResult ? (
        <div className="summary-grid sim-grid">
          <div className="summary-card">
            <span>Playable Hands</span>
            <strong>{percent(openingResult.playableHandsPct)}</strong>
            <div className="sim-bar-track">
              <div className="sim-bar-fill" style={{ width: barWidth(openingResult.playableHandsPct) }} />
            </div>
          </div>
          <div className="summary-card">
            <span>Dead Hands</span>
            <strong>{percent(openingResult.deadHandsPct)}</strong>
            <div className="sim-bar-track">
              <div className="sim-bar-fill sim-bar-fill-warn" style={{ width: barWidth(openingResult.deadHandsPct) }} />
            </div>
          </div>
          <div className="summary-card">
            <span>Ramp in Opening</span>
            <strong>{percent(openingResult.rampInOpeningPct)}</strong>
          </div>
          <div className="summary-card">
            <span>Avg Lands in Opening</span>
            <strong>{openingResult.avgLandsInOpening.toFixed(2)}</strong>
          </div>
          {goldfishResult ? (
            <>
              <div className="summary-card">
                <span>Avg First Spell</span>
                <strong>{asTurn(goldfishResult.avgFirstSpellTurn)}</strong>
              </div>
              <div className="summary-card">
                <span>Avg Commander Cast</span>
                <strong>{asTurn(goldfishResult.avgCommanderCastTurn)}</strong>
              </div>
              <div className="summary-card">
                <span>Avg Mana by Turn 3</span>
                <strong>{goldfishResult.avgManaByTurn3.toFixed(2)}</strong>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="muted">
        Simulation coverage currently uses the engine card set/templates. Cards not in the engine registry are ignored.
      </p>
    </section>
  );
}
