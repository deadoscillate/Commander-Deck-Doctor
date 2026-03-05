"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AnalysisReport } from "@/components/AnalysisReport";
import { CardLink } from "@/components/CardLink";
import { ExportButtons } from "@/components/ExportButtons";
import type { AnalyzeResponse } from "@/lib/contracts";
import { parseDecklist, parseDecklistWithCommander } from "@/lib/decklist";
import { SAMPLE_DECKLIST, SAMPLE_DECK_NAME } from "@/lib/sampleDeck";
import { SANDBOX_DEMO_DECKS } from "@/lib/sandboxDecklists";
import { saveRulesSandboxPreset } from "@/lib/sandboxPreset";
const SAVED_DECKS_STORAGE_KEY = "commanderDeckDoctor.savedDecks.v1";
const MAX_SAVED_DECKS = 30;

type ImportUrlResponse = {
  provider: "moxfield" | "archidekt";
  providerDeckId: string;
  deckName: string | null;
  decklist: string;
  cardCount: number;
  commanderCount: number;
};

type SavedDeck = {
  id: string;
  name: string;
  decklist: string;
  targetBracket: string;
  expectedWinTurn: string;
  commanderName: string;
  userCedhFlag: boolean;
  userHighPowerNoGCFlag: boolean;
  updatedAt: string;
};

function parseSavedDecks(raw: string | null): SavedDeck[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item, index) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const candidate = item as Partial<SavedDeck>;
        const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
        const decklist = typeof candidate.decklist === "string" ? candidate.decklist : "";
        if (!name || !decklist.trim()) {
          return null;
        }

        const fallbackId = `saved-${index}-${name.toLowerCase().replace(/\s+/g, "-")}`;
        return {
          id: typeof candidate.id === "string" && candidate.id ? candidate.id : fallbackId,
          name,
          decklist,
          targetBracket: typeof candidate.targetBracket === "string" ? candidate.targetBracket : "",
          expectedWinTurn: typeof candidate.expectedWinTurn === "string" ? candidate.expectedWinTurn : "",
          commanderName: typeof candidate.commanderName === "string" ? candidate.commanderName : "",
          userCedhFlag: Boolean(candidate.userCedhFlag),
          userHighPowerNoGCFlag: Boolean(candidate.userHighPowerNoGCFlag),
          updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString()
        } satisfies SavedDeck;
      })
      .filter((item): item is SavedDeck => Boolean(item))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_SAVED_DECKS);
  } catch {
    return [];
  }
}

function createSavedDeckId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `saved-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function importProviderForUrl(value: string): "moxfield" | "archidekt" | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "moxfield.com" || host === "www.moxfield.com") {
      return "moxfield";
    }

    if (host === "archidekt.com" || host === "www.archidekt.com") {
      return "archidekt";
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeImportError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("unsupported")) {
    return "Unsupported URL. Use a Moxfield or Archidekt deck link.";
  }

  if (lower.includes("deck not found") || lower.includes("public") || lower.includes("provider")) {
    return "Could not import deck. Check the link is public and try again.";
  }

  return "Could not import deck. Check the link is public and try again.";
}

export default function Page() {
  const router = useRouter();
  const [deckUrl, setDeckUrl] = useState("");
  const [deckName, setDeckName] = useState("");
  const [decklist, setDecklist] = useState("");
  const [targetBracket, setTargetBracket] = useState("");
  const [expectedWinTurn, setExpectedWinTurn] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [userCedhFlag, setUserCedhFlag] = useState(false);
  const [userHighPowerNoGCFlag, setUserHighPowerNoGCFlag] = useState(false);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveInfo, setSaveInfo] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importInfo, setImportInfo] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSavedDecks(parseSavedDecks(window.localStorage.getItem(SAVED_DECKS_STORAGE_KEY)));
  }, []);

  function persistSavedDecks(next: SavedDeck[]) {
    setSavedDecks(next);

    try {
      window.localStorage.setItem(SAVED_DECKS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setSaveError("Could not persist saved decks in this browser.");
    }
  }

  function onSaveDeck() {
    const trimmedName = deckName.trim();
    if (!trimmedName) {
      setSaveInfo("");
      setSaveError("Enter a deck name before saving.");
      return;
    }

    const trimmedDecklist = decklist.trim();
    if (!trimmedDecklist) {
      setSaveInfo("");
      setSaveError("Decklist is required before saving.");
      return;
    }

    const existing = savedDecks.find(
      (saved) => saved.name.toLowerCase() === trimmedName.toLowerCase()
    );
    const now = new Date().toISOString();

    const nextEntry: SavedDeck = {
      id: existing?.id ?? createSavedDeckId(),
      name: trimmedName,
      decklist: trimmedDecklist,
      targetBracket,
      expectedWinTurn,
      commanderName,
      userCedhFlag,
      userHighPowerNoGCFlag,
      updatedAt: now
    };

    const next = [nextEntry, ...savedDecks.filter((saved) => saved.id !== nextEntry.id)].slice(
      0,
      MAX_SAVED_DECKS
    );

    persistSavedDecks(next);
    setSaveError("");
    setSaveInfo(
      existing ? `Updated "${trimmedName}" in Saved Decks.` : `Saved "${trimmedName}" locally.`
    );
  }

  function onLoadSavedDeck(saved: SavedDeck) {
    setDeckName(saved.name);
    setDecklist(saved.decklist);
    setTargetBracket(saved.targetBracket);
    setExpectedWinTurn(saved.expectedWinTurn);
    setCommanderName(saved.commanderName);
    setUserCedhFlag(saved.userCedhFlag);
    setUserHighPowerNoGCFlag(saved.userHighPowerNoGCFlag);
    setResult(null);
    setError("");
    setImportError("");
    setImportInfo("");
    setSaveError("");
    setSaveInfo(`Loaded "${saved.name}".`);

    const next = [
      { ...saved, updatedAt: new Date().toISOString() },
      ...savedDecks.filter((item) => item.id !== saved.id)
    ].slice(0, MAX_SAVED_DECKS);

    persistSavedDecks(next);
  }

  function onRemoveSavedDeck(id: string) {
    const next = savedDecks.filter((saved) => saved.id !== id);
    persistSavedDecks(next);
    setSaveError("");
    setSaveInfo("Removed saved deck.");
  }

  async function onImportUrl() {
    const trimmed = deckUrl.trim();
    if (!trimmed) {
      setImportError("Enter a deck URL first.");
      return;
    }

    if (!importProviderForUrl(trimmed)) {
      setImportError("Unsupported URL. Use a Moxfield or Archidekt deck link.");
      setImportInfo("");
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
        setImportError(normalizeImportError("error" in data ? data.error : "Import failed."));
        return;
      }

      const imported = data as ImportUrlResponse;
      setDecklist(imported.decklist);
      if (imported.deckName) {
        setDeckName(imported.deckName);
      }
      setCommanderName("");
      setResult(null);
      const label = imported.provider === "moxfield" ? "Moxfield" : "Archidekt";
      const commander = parseDecklistWithCommander(imported.decklist).commanderFromSection;
      setImportInfo(
        `Imported: ${imported.deckName ?? `${label} deck`} ${commander ? `(Commander: ${commander})` : ""}`.trim()
      );
    } catch {
      setImportError("Could not import deck. Check the link is public and try again.");
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

  const previewRows = previewMode ? parseDecklist(decklist) : [];
  const tuningSummary = targetBracket && expectedWinTurn
    ? `Target: Bracket ${targetBracket} | Win/Lock: ${expectedWinTurn}`
    : null;

  async function runAnalysis(overrides?: { commanderName?: string | null }) {
    setLoading(true);
    setError("");

    try {
      const commanderForRequest =
        typeof overrides?.commanderName === "string"
          ? overrides.commanderName
          : commanderName || null;

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decklist,
          targetBracket: targetBracket ? Number(targetBracket) : null,
          expectedWinTurn: expectedWinTurn || null,
          commanderName: commanderForRequest,
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    await runAnalysis();
  }

  async function onTrySampleDeck() {
    setDeckName(SAMPLE_DECK_NAME);
    setDecklist(SAMPLE_DECKLIST);
    setCommanderName("");
    setImportError("");
    setImportInfo("Loaded sample deck. Running analysis...");
    await runAnalysis({ commanderName: null });
  }

  function onOpenRulesSandbox() {
    const trimmedDecklist = decklist.trim();
    if (trimmedDecklist) {
      const parsed = parseDecklistWithCommander(trimmedDecklist);
      const selectedCommander =
        result?.commander.selectedName?.trim() ||
        commanderName.trim() ||
        parsed.commanderFromSection ||
        null;

      saveRulesSandboxPreset({
        version: 1,
        seed: "rules-sandbox",
        updatedAt: new Date().toISOString(),
        players: [
          {
            name: deckName.trim() ? `${deckName.trim()} (You)` : "You",
            decklist: trimmedDecklist,
            commanderName: selectedCommander
          },
          {
            name: "Opponent 1",
            decklist: SANDBOX_DEMO_DECKS.playerOne,
            commanderName: "Captain Verity"
          },
          {
            name: "Opponent 2",
            decklist: SANDBOX_DEMO_DECKS.playerTwo,
            commanderName: "Ravager of Embers"
          }
        ]
      });
    }

    router.push("/rules-sandbox");
  }

  return (
    <main className="page">
      <div className="hero">
        <h1>Commander Deck Doctor</h1>
        <p>
          Paste a decklist and get summary stats, role coverage, commander validation checks, deck health, and
          Commander Bracket guidance.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn-secondary" onClick={() => void onTrySampleDeck()}>
            Try a sample deck
          </button>
          <button type="button" className="btn-secondary" onClick={onOpenRulesSandbox}>
            Open Current Deck in Rules Sandbox
          </button>
        </div>
        <p>
          Supports Moxfield and Archidekt imports, or paste your decklist directly below.
        </p>
      </div>

      <section className="panel-grid">
        <form className="panel form-panel" onSubmit={onSubmit}>
          <label htmlFor="deck-url">Deck URL (Moxfield or Archidekt)</label>
          <p className="muted field-help">Supports Moxfield and Archidekt deck links.</p>
          <div className="url-import-row">
            <input
              id="deck-url"
              type="url"
              value={deckUrl}
              onChange={(event) => setDeckUrl(event.target.value)}
              placeholder="https://www.moxfield.com/decks/... or https://archidekt.com/decks/..."
            />
            <button type="button" className="btn-secondary" onClick={onImportUrl} disabled={importing}>
              {importing ? "Importing..." : "Import URL"}
            </button>
          </div>
          {importError ? <p className="error">{importError}</p> : null}
          {importInfo ? <p className="import-toast">{importInfo}</p> : null}

          <label htmlFor="deck-name">Deck Name</label>
          <div className="save-row">
            <input
              id="deck-name"
              type="text"
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
              placeholder="Atraxa Infect"
            />
            <button type="button" className="btn-tertiary" onClick={onSaveDeck}>
              Save Deck Locally
            </button>
          </div>
          {saveError ? <p className="error">{saveError}</p> : null}
          {saveInfo ? <p className="muted">{saveInfo}</p> : null}

          <section className="saved-decks-panel">
            <h3>Saved Decks</h3>
            {savedDecks.length === 0 ? (
              <p className="muted">
                No saved decks yet. Analyze a deck, then click &quot;Save Deck Locally&quot;.{" "}
                <button type="button" className="inline-action" onClick={() => void onTrySampleDeck()}>
                  Try sample deck
                </button>
              </p>
            ) : (
              <ul className="saved-decks-list">
                {savedDecks.map((saved) => (
                  <li key={saved.id} className="saved-decks-item">
                    <button
                      type="button"
                      className="saved-deck-load"
                      onClick={() => onLoadSavedDeck(saved)}
                    >
                      {saved.name}
                    </button>
                    <button
                      type="button"
                      className="saved-deck-remove"
                      onClick={() => onRemoveSavedDeck(saved.id)}
                      aria-label={`Remove saved deck ${saved.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <label htmlFor="decklist">Decklist (paste here)</label>
          <p className="muted field-help">One card per line; quantities allowed.</p>
          <label className="checkbox decklist-preview-toggle decklist-preview-header">
            <input
              type="checkbox"
              checked={previewMode}
              onChange={(event) => setPreviewMode(event.target.checked)}
            />
            Preview mode (hover/tap card names for preview)
          </label>

          {previewMode ? (
            <div className="decklist-preview">
              {previewRows.length === 0 ? (
                <p className="muted">No valid deck lines to preview yet.</p>
              ) : (
                <ul>
                  {previewRows.map((entry) => (
                    <li key={`${entry.name}-${entry.qty}`}>
                      {entry.qty} <CardLink name={entry.name} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {!previewMode ? (
            <textarea
              id="decklist"
              value={decklist}
              onChange={(event) => setDecklist(event.target.value)}
              placeholder={`Example: 1 Sol Ring\nOne card per line; quantities allowed.`}
              rows={16}
              required
            />
          ) : (
            <p className="muted">Preview mode is on. Disable it to edit the raw decklist text.</p>
          )}

          <section className="tuning-controls">
            <div className="tuning-header">
              <strong>Tuning Targets (affects recommendations, not legality)</strong>
              <span
                className="info-pill"
                title="Bracket and expected turn tune recommendation targets. They do not enforce deck legality."
              >
                i
              </span>
            </div>
            {tuningSummary ? <p className="tuning-summary">{tuningSummary}</p> : null}

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

          <label
            className="checkbox"
            title="Use when your list is highly optimized despite low Game Changer count."
          >
            <input
              type="checkbox"
              checked={userHighPowerNoGCFlag}
              onChange={(event) => setUserHighPowerNoGCFlag(event.target.checked)}
            />
            Optimized without many Game Changers
          </label>

          <label className="checkbox" title="Use when this deck is tuned for cEDH pods / tournament pace.">
            <input
              type="checkbox"
              checked={userCedhFlag}
              onChange={(event) => setUserCedhFlag(event.target.checked)}
            />
            cEDH pod / tournament intent
          </label>
          </section>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Analyzing..." : "Analyze Deck"}
          </button>

          {error ? <p className="error">{error}</p> : null}
        </form>

        <div className="panel results-panel">
          {result && !result.commander.detectedFromSection && result.commander.options.length > 0 ? (
            <section className="results-commander-picker">
              <label htmlFor="commander-name-right">Commander (manual selection)</label>
              <select
                id="commander-name-right"
                value={commanderName}
                disabled={loading}
                onChange={(event) => {
                  const nextCommander = event.target.value;
                  setCommanderName(nextCommander);
                  void runAnalysis({ commanderName: nextCommander || null });
                }}
              >
                <option value="">Select a commander</option>
                {result.commander.options.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.name} ({option.colorIdentity.length > 0 ? option.colorIdentity.join("/") : "Colorless"})
                  </option>
                ))}
              </select>
              <p className="muted">Selecting a commander updates the report automatically.</p>
            </section>
          ) : null}

          <ExportButtons result={result} decklist={decklist} />

          {!result ? (
            <p className="muted results-empty-hint">
              Run analysis to see summary, checks, deck health, and bracket report.
            </p>
          ) : (
            <AnalysisReport result={result} />
          )}
        </div>
      </section>
    </main>
  );
}
