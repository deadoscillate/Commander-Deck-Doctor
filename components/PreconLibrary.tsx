"use client";

import { useEffect, useState } from "react";
import type { PreconDeck, PreconSummary } from "@/lib/preconTypes";

type PreconLibraryResponse = {
  meta: {
    generatedAt: string;
    totalDecks: number;
  };
  items: PreconSummary[];
};

type PreconLibraryProps = {
  busy?: boolean;
  onLoadPrecon: (precon: PreconDeck) => Promise<void> | void;
};

export function PreconLibrary({ busy = false, onLoadPrecon }: PreconLibraryProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PreconSummary[]>([]);
  const [totalDecks, setTotalDecks] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSlug, setActiveSlug] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        params.set("limit", "24");
        if (query.trim()) {
          params.set("q", query.trim());
        }

        const response = await fetch(`/api/precons?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json()) as PreconLibraryResponse | { error: string };
        if (!response.ok) {
          setItems([]);
          setError("error" in payload ? payload.error : "Could not load the precon library.");
          return;
        }

        const data = payload as PreconLibraryResponse;
        setItems(data.items ?? []);
        setTotalDecks(typeof data.meta?.totalDecks === "number" ? data.meta.totalDecks : null);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") {
          return;
        }

        setItems([]);
        setError("Could not load the precon library.");
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, query]);

  async function onLoad(slug: string) {
    setActiveSlug(slug);
    setError("");

    try {
      const response = await fetch(`/api/precons?slug=${encodeURIComponent(slug)}`, {
        method: "GET",
        cache: "no-store"
      });
      const payload = (await response.json()) as PreconDeck | { error: string };
      if (!response.ok) {
        setError("error" in payload ? payload.error : "Could not load that precon.");
        return;
      }

      await onLoadPrecon(payload as PreconDeck);
    } catch {
      setError("Could not load that precon.");
    } finally {
      setActiveSlug("");
    }
  }

  return (
    <section className="saved-decks-panel precon-library-panel">
      <div className="precon-library-head">
        <h2>Browse Precons</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          {open ? "Hide Library" : "Open Library"}
        </button>
      </div>
      <p className="muted">
        Load and analyze stock Commander precons from the synced library{typeof totalDecks === "number" ? ` (${totalDecks} decks)` : ""}.
      </p>

      {open ? (
        <div className="precon-library-body">
          <label htmlFor="precon-search">Search precons</label>
          <input
            id="precon-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by deck name, commander, or set code"
          />

          {loading ? <p className="muted">Loading precon library...</p> : null}
          {error ? <p className="error">{error}</p> : null}

          {!loading && !error ? (
            items.length > 0 ? (
              <ul className="precon-list">
                {items.map((deck) => (
                  <li key={deck.slug} className="precon-item">
                    <div className="precon-item-main">
                      <strong>{deck.name}</strong>
                      <p className="muted">
                        {deck.code} • {deck.releaseDate} • {deck.displayCommanderNames.join(" / ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-tertiary"
                      disabled={busy || activeSlug === deck.slug}
                      onClick={() => void onLoad(deck.slug)}
                    >
                      {activeSlug === deck.slug ? "Loading..." : "Load"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No precons match this search.</p>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
