"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnalysisReport } from "@/components/AnalysisReport";
import { ExportButtons } from "@/components/ExportButtons";
import type { AnalyzeResponse } from "@/lib/contracts";

const SAMPLE_DECKLIST = `1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Rhystic Study
1 Smothering Tithe
1 Cyclonic Rift
1 Swords to Plowshares
1 Wrath of God
1 Cultivate
1 Kodama's Reach`;

type ImportUrlResponse = {
  provider: "moxfield" | "archidekt";
  providerDeckId: string;
  deckName: string | null;
  decklist: string;
  cardCount: number;
  commanderCount: number;
};

export default function Page() {
  const [deckUrl, setDeckUrl] = useState("");
  const [decklist, setDecklist] = useState(SAMPLE_DECKLIST);
  const [targetBracket, setTargetBracket] = useState("");
  const [expectedWinTurn, setExpectedWinTurn] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [userCedhFlag, setUserCedhFlag] = useState(false);
  const [userHighPowerNoGCFlag, setUserHighPowerNoGCFlag] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importInfo, setImportInfo] = useState("");

  async function onImportUrl() {
    const trimmed = deckUrl.trim();
    if (!trimmed) {
      setImportError("Enter a deck URL first.");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportInfo("");

    try {
      const response = await fetch("/api/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed })
      });

      const data = (await response.json()) as ImportUrlResponse | { error: string };
      if (!response.ok) {
        setImportError("error" in data ? data.error : "Import failed.");
        return;
      }

      const imported = data as ImportUrlResponse;
      setDecklist(imported.decklist);
      setCommanderName("");
      setResult(null);
      const label = imported.provider === "moxfield" ? "Moxfield" : "Archidekt";
      setImportInfo(
        `Imported from ${label}${imported.deckName ? `: ${imported.deckName}` : ""} (${imported.cardCount} cards).`
      );
    } catch {
      setImportError("URL import request failed.");
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    if (!result) {
      return;
    }

    if (result.commander.source === "section" && result.commander.selectedName) {
      setCommanderName(result.commander.selectedName);
    }
  }, [result]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decklist,
          targetBracket: targetBracket ? Number(targetBracket) : null,
          expectedWinTurn: expectedWinTurn || null,
          commanderName: commanderName || null,
          userCedhFlag,
          userHighPowerNoGCFlag
        })
      });

      const data = (await response.json()) as AnalyzeResponse | { error: string };
      if (!response.ok) {
        setResult(null);
        setError("error" in data ? data.error : "Analysis failed.");
        return;
      }

      setResult(data as AnalyzeResponse);
    } catch {
      setError("Request failed. Check network/API availability.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="hero">
        <h1>Commander Deck Doctor</h1>
        <p>
          Paste a decklist and get summary stats, role coverage, commander validation checks, deck health, and
          Commander Bracket heuristics.
        </p>
      </div>

      <section className="panel-grid">
        <form className="panel form-panel" onSubmit={onSubmit}>
          <label htmlFor="deck-url">Deck URL (Moxfield or Archidekt)</label>
          <div className="url-import-row">
            <input
              id="deck-url"
              type="url"
              value={deckUrl}
              onChange={(event) => setDeckUrl(event.target.value)}
              placeholder="https://www.moxfield.com/decks/..."
            />
            <button type="button" onClick={onImportUrl} disabled={importing}>
              {importing ? "Importing..." : "Import URL"}
            </button>
          </div>
          {importError ? <p className="error">{importError}</p> : null}
          {importInfo ? <p className="muted">{importInfo}</p> : null}

          <label htmlFor="decklist">Decklist</label>
          <textarea
            id="decklist"
            value={decklist}
            onChange={(event) => setDecklist(event.target.value)}
            placeholder="1 Sol Ring"
            rows={16}
            required
          />

          <div className="row">
            <label htmlFor="target-bracket">I&apos;m aiming for bracket</label>
            <select
              id="target-bracket"
              value={targetBracket}
              onChange={(event) => setTargetBracket(event.target.value)}
            >
              <option value="">Not specified</option>
              <option value="1">1 - Exhibition</option>
              <option value="2">2 - Core</option>
              <option value="3">3 - Upgraded</option>
              <option value="4">4 - Optimized</option>
              <option value="5">5 - cEDH</option>
            </select>
          </div>

          <div className="row">
            <label htmlFor="expected-turn">Expected win/lock turn</label>
            <select
              id="expected-turn"
              value={expectedWinTurn}
              onChange={(event) => setExpectedWinTurn(event.target.value)}
            >
              <option value="">Not specified</option>
              <option value=">=10">&gt;=10</option>
              <option value="8-9">8-9</option>
              <option value="6-7">6-7</option>
              <option value="<=5">&lt;=5</option>
            </select>
          </div>

          {result && !result.commander.detectedFromSection && result.commander.options.length > 0 ? (
            <div className="row">
              <label htmlFor="commander-name">Commander (manual selection)</label>
              <select
                id="commander-name"
                value={commanderName}
                onChange={(event) => setCommanderName(event.target.value)}
              >
                <option value="">Select a commander</option>
                {result.commander.options.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.name} ({option.colorIdentity.length > 0 ? option.colorIdentity.join("/") : "Colorless"})
                  </option>
                ))}
              </select>
              <p className="muted">Select commander and click Analyze Deck to run color identity validation.</p>
            </div>
          ) : null}

          <label className="checkbox">
            <input
              type="checkbox"
              checked={userHighPowerNoGCFlag}
              onChange={(event) => setUserHighPowerNoGCFlag(event.target.checked)}
            />
            This deck is highly optimized even without Game Changers.
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={userCedhFlag}
              onChange={(event) => setUserCedhFlag(event.target.checked)}
            />
            This deck is built for cEDH pods / tournament meta.
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Analyzing..." : "Analyze Deck"}
          </button>

          {error ? <p className="error">{error}</p> : null}
        </form>

        <div className="panel results-panel">
          <ExportButtons result={result} decklist={decklist} />

          {!result ? (
            <p className="muted">Run analysis to see summary, checks, deck health, and bracket report.</p>
          ) : (
            <AnalysisReport result={result} />
          )}
        </div>
      </section>
    </main>
  );
}
