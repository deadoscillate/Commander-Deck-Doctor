import type { ImprovementSuggestions as ImprovementSuggestionsType } from "@/lib/contracts";

type ImprovementSuggestionsProps = {
  suggestions: ImprovementSuggestionsType;
};

export function ImprovementSuggestions({ suggestions }: ImprovementSuggestionsProps) {
  return (
    <section>
      <h2>Deck Improvement Suggestions</h2>
      <p className="muted">{suggestions.disclaimer}</p>
      <p className="muted">
        Suggestion color identity:{" "}
        {suggestions.colorIdentity.length > 0 ? suggestions.colorIdentity.join("/") : "Colorless"}
      </p>

      {suggestions.items.length === 0 ? (
        <p className="muted">No LOW role suggestions right now.</p>
      ) : (
        <div className="suggestion-groups">
          {suggestions.items.map((item) => (
            <div className="suggestion-card" key={item.key}>
              <h3>Suggested {item.label}</h3>
              <p className="muted">
                Current: {item.currentCount} | Recommended: {item.recommendedRange}
              </p>
              {item.suggestions.length > 0 ? (
                <ul>
                  {item.suggestions.map((name) => (
                    <li key={`${item.key}-${name}`}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No matching suggestions for this color identity.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
