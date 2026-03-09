"use client";

import { useEffect, useMemo, useState } from "react";
import { CardNameHover } from "@/components/CardNameHover";
import type { AnalyzeResponse } from "@/lib/contracts";
import type { PreconDeck, PreconSummary } from "@/lib/preconTypes";

type StockPreconComparisonProps = {
  result: AnalyzeResponse;
  commanderName: string | null;
};

type PreconLibraryResponse = {
  meta: {
    generatedAt: string;
    totalDecks: number;
  };
  items: PreconSummary[];
};

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function formatSignedNumber(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function formatSignedCurrency(value: number): string {
  const rounded = Number(value.toFixed(2));
  return `${rounded >= 0 ? "+" : "-"}$${Math.abs(rounded).toFixed(2)}`;
}

function buildDeckCardMap(result: AnalyzeResponse): Map<string, { name: string; qty: number }> {
  const rows = new Map<string, { name: string; qty: number }>();
  for (const entry of result.parsedDeck) {
    const label = entry.resolvedName ?? entry.name;
    const key = normalizeName(label);
    if (!key) {
      continue;
    }

    const existing = rows.get(key);
    if (existing) {
      existing.qty += entry.qty;
      continue;
    }

    rows.set(key, {
      name: label,
      qty: entry.qty
    });
  }

  return rows;
}

export function StockPreconComparison({
  result,
  commanderName
}: StockPreconComparisonProps) {
  const [matches, setMatches] = useState<PreconSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [stockResult, setStockResult] = useState<AnalyzeResponse | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMatches([]);
    setSelectedSlug("");
    setStockResult(null);
    setError(null);

    const trimmedCommander = commanderName?.trim() ?? "";
    if (!trimmedCommander) {
      return;
    }

    const controller = new AbortController();

    async function loadMatches() {
      setLibraryLoading(true);
      try {
        const response = await fetch(
          `/api/precons?commander=${encodeURIComponent(trimmedCommander)}&limit=50`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
          }
        );
        const payload = (await response.json()) as PreconLibraryResponse | { error: string };
        if (!response.ok) {
          throw new Error(
            "error" in payload && payload.error ? payload.error : "Could not load stock precon matches."
          );
        }

        const nextMatches = (payload as PreconLibraryResponse).items ?? [];
        setMatches(nextMatches);
        setSelectedSlug(nextMatches[0]?.slug ?? "");
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Could not load stock precon matches."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLibraryLoading(false);
        }
      }
    }

    void loadMatches();

    return () => {
      controller.abort();
    };
  }, [commanderName]);

  useEffect(() => {
    setStockResult(null);
    setError((previous) => (previous && previous.includes("stock precon") ? null : previous));

    if (!selectedSlug) {
      return;
    }

    const controller = new AbortController();

    async function loadComparison() {
      setComparisonLoading(true);
      try {
        const detailResponse = await fetch(`/api/precons?slug=${encodeURIComponent(selectedSlug)}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });
        const detailPayload = (await detailResponse.json()) as PreconDeck | { error: string };
        if (!detailResponse.ok) {
          throw new Error(
            "error" in detailPayload && detailPayload.error
              ? detailPayload.error
              : "Could not load stock precon."
          );
        }

        const precon = detailPayload as PreconDeck;
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            decklist: precon.decklist,
            deckPriceMode: "decklist-set",
            commanderName:
              precon.commanderNames[0] ?? precon.displayCommanderNames[0] ?? commanderName ?? null
          }),
          signal: controller.signal
        });
        const payload = (await response.json()) as AnalyzeResponse | { error: string };
        if (!response.ok) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Could not analyze the stock precon."
          );
        }

        setStockResult(payload as AnalyzeResponse);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Could not load stock precon comparison."
        );
      } finally {
        if (!controller.signal.aborted) {
          setComparisonLoading(false);
        }
      }
    }

    void loadComparison();

    return () => {
      controller.abort();
    };
  }, [commanderName, selectedSlug]);

  const currentDeckCards = useMemo(() => buildDeckCardMap(result), [result]);
  const stockDeckCards = useMemo(
    () => (stockResult ? buildDeckCardMap(stockResult) : new Map<string, { name: string; qty: number }>()),
    [stockResult]
  );

  const comparison = useMemo(() => {
    if (!stockResult) {
      return null;
    }

    const added: Array<{ name: string; qty: number }> = [];
    const removed: Array<{ name: string; qty: number }> = [];
    const allKeys = new Set([...currentDeckCards.keys(), ...stockDeckCards.keys()]);

    for (const key of allKeys) {
      const current = currentDeckCards.get(key);
      const stock = stockDeckCards.get(key);
      const currentQty = current?.qty ?? 0;
      const stockQty = stock?.qty ?? 0;
      const delta = currentQty - stockQty;
      if (delta > 0) {
        added.push({ name: current?.name ?? stock?.name ?? key, qty: delta });
      } else if (delta < 0) {
        removed.push({ name: current?.name ?? stock?.name ?? key, qty: Math.abs(delta) });
      }
    }

    added.sort((left, right) => right.qty - left.qty || left.name.localeCompare(right.name));
    removed.sort((left, right) => right.qty - left.qty || left.name.localeCompare(right.name));

    const roleDelta = Object.entries(result.roles)
      .map(([key, value]) => ({
        key,
        value: value - stockResult.roles[key as keyof typeof stockResult.roles]
      }))
      .filter((row) => row.value !== 0)
      .sort((left, right) => Math.abs(right.value) - Math.abs(left.value) || left.key.localeCompare(right.key));

    return {
      stockResult,
      priceDelta:
        typeof result.deckPrice?.totals.usd === "number" && typeof stockResult.deckPrice?.totals.usd === "number"
          ? result.deckPrice.totals.usd - stockResult.deckPrice.totals.usd
          : null,
      bracketDelta: result.bracketReport.estimatedBracket - stockResult.bracketReport.estimatedBracket,
      manaValueDelta: result.summary.averageManaValue - stockResult.summary.averageManaValue,
      roleDelta,
      added,
      removed
    };
  }, [currentDeckCards, result, stockDeckCards, stockResult]);

  if (!commanderName) {
    return null;
  }

  return (
    <section className="stock-precon-comparison">
      <div className="stock-precon-head">
        <div>
          <h2>Compare To Stock Precon</h2>
          <p className="muted">
            Compare this list to the synced stock precon library for <strong>{commanderName}</strong>.
          </p>
        </div>
        {matches.length > 0 ? (
          <label className="stock-precon-picker">
            <span>Stock list</span>
            <select
              value={selectedSlug}
              onChange={(event) => setSelectedSlug(event.target.value)}
              disabled={libraryLoading || comparisonLoading}
            >
              {matches.map((deck) => (
                <option key={deck.slug} value={deck.slug}>
                  {deck.name} ({deck.releaseDate})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {libraryLoading ? <p className="muted">Loading stock precon matches...</p> : null}
      {!libraryLoading && matches.length === 0 && !error ? (
        <p className="muted">No synced stock precon was found for this commander.</p>
      ) : null}
      {comparisonLoading ? <p className="muted">Analyzing stock precon...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {comparison ? (
        <>
          <div className="summary-grid">
            <div className="summary-card">
              <span>Bracket Delta</span>
              <strong>{formatSignedNumber(comparison.bracketDelta, 0)}</strong>
            </div>
            <div className="summary-card">
              <span>Avg MV Delta</span>
              <strong>{formatSignedNumber(comparison.manaValueDelta)}</strong>
            </div>
            <div className="summary-card">
              <span>USD Price Delta</span>
              <strong>
                {comparison.priceDelta === null ? "N/A" : formatSignedCurrency(comparison.priceDelta)}
              </strong>
            </div>
            <div className="summary-card">
              <span>Changed Cards</span>
              <strong>
                +{comparison.added.reduce((sum, row) => sum + row.qty, 0)} / -
                {comparison.removed.reduce((sum, row) => sum + row.qty, 0)}
              </strong>
            </div>
          </div>

          {comparison.roleDelta.length > 0 ? (
            <div className="technical-group">
              <h3>Role Shifts</h3>
              <ul className="stock-precon-role-delta">
                {comparison.roleDelta.slice(0, 6).map((row) => (
                  <li key={row.key}>
                    <strong>{row.key}</strong>: {row.value > 0 ? "+" : ""}
                    {row.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="stock-precon-diff-grid">
            <div className="technical-group">
              <h3>Added vs Stock</h3>
              {comparison.added.length > 0 ? (
                <ul>
                  {comparison.added.slice(0, 10).map((entry) => (
                    <li key={`add-${entry.name}`}>
                      <CardNameHover name={entry.name} /> {entry.qty > 1 ? `x${entry.qty}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No card additions detected.</p>
              )}
            </div>
            <div className="technical-group">
              <h3>Removed From Stock</h3>
              {comparison.removed.length > 0 ? (
                <ul>
                  {comparison.removed.slice(0, 10).map((entry) => (
                    <li key={`cut-${entry.name}`}>
                      <CardNameHover name={entry.name} /> {entry.qty > 1 ? `x${entry.qty}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No card removals detected.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
