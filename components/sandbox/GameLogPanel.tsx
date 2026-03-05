"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameLogEvent } from "@/lib/engineClient";

type GameLogPanelProps = {
  events: GameLogEvent[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
};

function payloadSummary(payload: Record<string, unknown>): string {
  const prioritizedKeys = ["cardName", "playerId", "from", "to", "reason", "amount"];
  const rows: string[] = [];

  for (const key of prioritizedKeys) {
    if (!(key in payload)) {
      continue;
    }

    const value = payload[key];
    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      rows.push(`${key}: ${value.join(", ")}`);
      continue;
    }

    rows.push(`${key}: ${String(value)}`);
  }

  if (rows.length === 0) {
    return "";
  }

  return rows.join(" | ");
}

export function GameLogPanel({ events, selectedIndex, onSelectIndex }: GameLogPanelProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScroll || !listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [autoScroll, events.length]);

  const rows = useMemo(() => {
    const result: Array<{ kind: "header"; turn: number } | { kind: "event"; event: GameLogEvent; index: number }> = [];
    let seenTurn: number | null = null;

    events.forEach((event, idx) => {
      if (event.turn !== seenTurn) {
        result.push({ kind: "header", turn: event.turn });
        seenTurn = event.turn;
      }

      result.push({ kind: "event", event, index: idx + 1 });
    });

    return result;
  }, [events]);

  return (
    <section className="sandbox-panel sandbox-log-panel">
      <div className="sandbox-log-head">
        <h2>Game Log</h2>
        <label htmlFor="log-auto-scroll" className="timeline-live-toggle">
          <input
            id="log-auto-scroll"
            type="checkbox"
            checked={autoScroll}
            onChange={(event) => setAutoScroll(event.target.checked)}
          />
          Auto-scroll
        </label>
      </div>

      <div className="sandbox-log-list" ref={listRef}>
        {rows.length === 0 ? (
          <p className="muted">No events yet.</p>
        ) : (
          rows.map((row) => {
            if (row.kind === "header") {
              return (
                <p key={`turn-${row.turn}`} className="sandbox-log-turn muted">
                  Turn {row.turn}
                </p>
              );
            }

            const selected = row.index === selectedIndex;
            const summary = payloadSummary(row.event.payload);
            return (
              <button
                key={`event-${row.event.seq}`}
                type="button"
                className={`sandbox-log-entry${selected ? " sandbox-log-entry-selected" : ""}`}
                onClick={() => onSelectIndex(row.index)}
              >
                <span className="sandbox-log-entry-head">
                  #{row.event.seq} {row.event.step} - {row.event.type}
                </span>
                {summary ? <span className="sandbox-log-entry-body">{summary}</span> : null}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
