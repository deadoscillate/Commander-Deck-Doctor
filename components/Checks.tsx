import type { DeckChecks } from "@/lib/contracts";

type ChecksProps = {
  checks: DeckChecks;
};

function icon(ok: boolean): string {
  return ok ? "\u2713" : "\u26A0";
}

export function Checks({ checks }: ChecksProps) {
  const colorIdentityIcon = checks.colorIdentity.enabled
    ? icon(checks.colorIdentity.ok)
    : "\u26A0";

  return (
    <section>
      <h2>Checks</h2>
      <ul className="checks-list">
        <li>
          <strong>{icon(checks.deckSize.ok)} Deck Size:</strong> {checks.deckSize.message}
        </li>
        <li>
          <strong>{icon(checks.unknownCards.ok)} Unknown Cards:</strong> {checks.unknownCards.message}
          {!checks.unknownCards.ok ? (
            <details className="checks-details">
              <summary>Show unknown cards</summary>
              <ul>
                {checks.unknownCards.cards.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </li>
        <li>
          <strong>{icon(checks.singleton.ok)} Singleton:</strong> {checks.singleton.message}
          {!checks.singleton.ok ? (
            <ul>
              {checks.singleton.duplicates.map((entry) => (
                <li key={entry.name}>
                  {entry.name} x{entry.qty}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
        <li>
          <strong>{colorIdentityIcon} Color Identity:</strong> {checks.colorIdentity.message}
          {checks.colorIdentity.offColorCount > 0 ? (
            <ul>
              {checks.colorIdentity.offColorCards.map((entry) => (
                <li key={entry.name}>
                  {entry.name}
                  {entry.qty > 1 ? ` x${entry.qty}` : ""} (
                  {entry.disallowedColors.join(", ")} not allowed)
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      </ul>
    </section>
  );
}
