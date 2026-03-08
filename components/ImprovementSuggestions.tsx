import { ComboCardTile } from "@/components/ComboCardTile";
import type { ImprovementSuggestions as ImprovementSuggestionsType } from "@/lib/contracts";

type ImprovementSuggestionsProps = {
  suggestions: ImprovementSuggestionsType;
  loading?: boolean;
  error?: string | null;
  getCardPreviewImage?: (cardName: string) => string | null;
};

export function ImprovementSuggestions({
  suggestions,
  loading = false,
  error = null,
  getCardPreviewImage
}: ImprovementSuggestionsProps) {
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
        <div className="suggestion-groups">
          {suggestions.items.map((item) => (
            <div className="suggestion-card" key={item.key}>
              <h3>
                {item.direction === "CUT" ? "Suggested Cuts" : "Suggested Adds"}: {item.label}
              </h3>
              <p className="muted">
                Current: {item.currentCount} | Recommended: {item.recommendedRange}
              </p>
              {item.suggestions.length > 0 ? (
                <div className="suggestion-card-grid">
                  {item.suggestions.map((name) => (
                    <ComboCardTile
                      key={`${item.key}-${name}`}
                      name={name}
                      imageUrl={getCardPreviewImage?.(name) ?? null}
                    />
                  ))}
                </div>
              ) : (
                <p className="muted">
                  {item.direction === "CUT"
                    ? "No clear cut candidates found for this role."
                    : "No matching additions for this color identity."}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
