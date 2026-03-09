"use client";

import { useEffect, useMemo, useState } from "react";
import { ComboCardTile } from "@/components/ComboCardTile";
import type {
  ImprovementSuggestions as ImprovementSuggestionsType,
  RoleSuggestion
} from "@/lib/contracts";

type ImprovementSuggestionsProps = {
  suggestions: ImprovementSuggestionsType;
  loading?: boolean;
  error?: string | null;
  getCardPreviewImage?: (cardName: string) => string | null;
};

type SuggestionDirection = RoleSuggestion["direction"];

function getDirectionMeta(direction: SuggestionDirection): {
  label: string;
  emptyState: string;
} {
  if (direction === "CUT") {
    return {
      label: "Cuts",
      emptyState: "No clear cut candidates found for this role."
    };
  }

  return {
    label: "Adds",
    emptyState: "No matching additions for this color identity."
  };
}

export function ImprovementSuggestions({
  suggestions,
  loading = false,
  error = null,
  getCardPreviewImage
}: ImprovementSuggestionsProps) {
  const directionTabs = useMemo(() => {
    const directions: SuggestionDirection[] = [];

    for (const item of suggestions.items) {
      if (!directions.includes(item.direction)) {
        directions.push(item.direction);
      }
    }

    return directions;
  }, [suggestions.items]);

  const fallbackDirection = directionTabs[0] ?? null;
  const [activeDirection, setActiveDirection] = useState<SuggestionDirection | null>(fallbackDirection);

  useEffect(() => {
    setActiveDirection((currentDirection) =>
      currentDirection && directionTabs.includes(currentDirection) ? currentDirection : fallbackDirection
    );
  }, [directionTabs, fallbackDirection]);

  return (
    <section>
      <h2>Deck Improvement Suggestions</h2>
      <p className="muted">{suggestions.disclaimer}</p>
      <p className="muted">
        Suggestion color identity:{" "}
        {suggestions.colorIdentity.length > 0 ? suggestions.colorIdentity.join("/") : "Colorless"}
      </p>

      {loading ? (
        <p className="muted">Loading suggestions...</p>
      ) : error ? (
        <p className="muted">{error}</p>
      ) : suggestions.items.length === 0 ? (
        <p className="muted">No add/cut role suggestions right now.</p>
      ) : (
        <div className="suggestion-tabs-shell">
          <div className="suggestion-tabs" role="tablist" aria-label="Deck improvement suggestion categories">
            {directionTabs.map((direction) => {
              const meta = getDirectionMeta(direction);
              const count = suggestions.items.filter((item) => item.direction === direction).length;
              const isActive = activeDirection === direction;

              return (
                <button
                  key={direction}
                  id={`suggestion-tab-${direction.toLowerCase()}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`suggestion-panel-${direction.toLowerCase()}`}
                  className={`suggestion-tab${isActive ? " suggestion-tab-active" : ""}`}
                  onClick={() => setActiveDirection(direction)}
                >
                  <span>{meta.label}</span>
                  <span className="suggestion-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          {directionTabs.map((direction) => {
            const meta = getDirectionMeta(direction);
            const items = suggestions.items.filter((item) => item.direction === direction);
            const isActive = activeDirection === direction;

            return (
              <div
                key={direction}
                id={`suggestion-panel-${direction.toLowerCase()}`}
                role="tabpanel"
                aria-labelledby={`suggestion-tab-${direction.toLowerCase()}`}
                hidden={!isActive}
              >
                <div className="suggestion-groups">
                  {items.map((item) => (
                    <div className="suggestion-card" key={item.key}>
                      <h3>{item.label}</h3>
                      <p className="muted">
                        Current: {item.currentCount} | Recommended: {item.recommendedRange}
                      </p>
                      {item.rationale ? <p className="muted">{item.rationale}</p> : null}
                      {item.suggestions.length > 0 ? (
                        <div className="suggestion-card-grid">
                          {item.suggestions.map((name) => (
                            <ComboCardTile
                              key={`${item.key}-${direction}-${name}`}
                              name={name}
                              imageUrl={getCardPreviewImage?.(name) ?? null}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="muted">{meta.emptyState}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
