import { CardNameHover } from "@/components/CardNameHover";
import type { DeckChecks, RulesEngineReport } from "@/lib/contracts";

type ChecksProps = {
  checks: DeckChecks;
  rulesEngine?: RulesEngineReport;
};

type CheckTone = "ok" | "warn" | "pending";

function toneLabel(tone: CheckTone): string {
  if (tone === "ok") return "PASS";
  if (tone === "warn") return "ISSUE";
  return "PENDING";
}

function toneIcon(tone: CheckTone): string {
  if (tone === "ok") return "\u2713";
  if (tone === "warn") return "\u26A0";
  return "\u23F3";
}

function toneFromOutcome(outcome: "PASS" | "FAIL" | "SKIP"): CheckTone {
  if (outcome === "PASS") return "ok";
  if (outcome === "FAIL") return "warn";
  return "pending";
}

export function Checks({ checks, rulesEngine }: ChecksProps) {
  const deckSizeTone: CheckTone = checks.deckSize.ok ? "ok" : "warn";
  const unknownTone: CheckTone = checks.unknownCards.ok ? "ok" : "warn";
  const singletonTone: CheckTone = checks.singleton.ok ? "ok" : "warn";
  const colorIdentityTone: CheckTone = checks.colorIdentity.enabled
    ? checks.colorIdentity.ok
      ? "ok"
      : "warn"
    : "pending";
  const rulesEngineTone: CheckTone | null = rulesEngine
    ? rulesEngine.status === "PASS"
      ? "ok"
      : "warn"
    : null;
  const banlistRule = rulesEngine?.rules.find((rule) => rule.id === "commander.banlist") ?? null;
  const banlistTone = banlistRule ? toneFromOutcome(banlistRule.outcome) : null;
  const failingRules =
    rulesEngine?.rules.filter((rule) => rule.outcome === "FAIL").sort((a, b) => a.name.localeCompare(b.name)) ?? [];

  return (
    <section>
      <h2>Legality Checks</h2>
      <ul className="checks-list checks-grid">
        <li className={`check-item check-${deckSizeTone}`}>
          <div className="check-item-head">
            <strong>
              {toneIcon(deckSizeTone)} Deck Size
            </strong>
            <span className="check-pill">{toneLabel(deckSizeTone)}</span>
          </div>
          <p>{checks.deckSize.message}</p>
        </li>
        <li className={`check-item check-${unknownTone}`}>
          <div className="check-item-head">
            <strong>
              {toneIcon(unknownTone)} Unknown Cards
            </strong>
            <span className="check-pill">{toneLabel(unknownTone)}</span>
          </div>
          <p>{checks.unknownCards.message}</p>
          {!checks.unknownCards.ok ? (
            <details className="checks-details">
              <summary>Show unknown cards</summary>
              <ul>
                {checks.unknownCards.cards.map((name) => (
                  <li key={name}>
                    <CardNameHover name={name} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </li>
        <li className={`check-item check-${singletonTone}`}>
          <div className="check-item-head">
            <strong>
              {toneIcon(singletonTone)} Singleton
            </strong>
            <span className="check-pill">{toneLabel(singletonTone)}</span>
          </div>
          <p>{checks.singleton.message}</p>
          {!checks.singleton.ok ? (
            <ul>
              {checks.singleton.duplicates.map((entry) => (
                <li key={entry.name}>
                  <CardNameHover name={entry.name} /> x{entry.qty}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
        <li className={`check-item check-${colorIdentityTone}`}>
          <div className="check-item-head">
            <strong>
              {toneIcon(colorIdentityTone)} Color Identity
            </strong>
            <span className="check-pill">{toneLabel(colorIdentityTone)}</span>
          </div>
          <p>{checks.colorIdentity.message}</p>
          {checks.colorIdentity.offColorCount > 0 ? (
            <ul>
              {checks.colorIdentity.offColorCards.map((entry) => (
                <li key={entry.name}>
                  <CardNameHover name={entry.name} />
                  {entry.qty > 1 ? ` x${entry.qty}` : ""} (
                  {entry.disallowedColors.join(", ")} not allowed)
                </li>
              ))}
            </ul>
          ) : null}
        </li>
        {banlistRule && banlistTone ? (
          <li className={`check-item check-${banlistTone}`}>
            <div className="check-item-head">
              <strong>
                {toneIcon(banlistTone)} Banlist
              </strong>
              <span className="check-pill">{toneLabel(banlistTone)}</span>
            </div>
            <p>{banlistRule.message}</p>
            {banlistRule.findings.length > 0 ? (
              <details className="checks-details">
                <summary>Show banned cards</summary>
                <ul>
                  {banlistRule.findings.map((entry) => (
                    <li key={entry.name}>
                      <CardNameHover name={entry.name} />
                      {entry.qty > 1 ? ` x${entry.qty}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        ) : null}
        {rulesEngine && rulesEngineTone ? (
          <li className={`check-item check-${rulesEngineTone}`}>
            <div className="check-item-head">
              <strong>
                {toneIcon(rulesEngineTone)} Rules Engine
              </strong>
              <span className="check-pill">{toneLabel(rulesEngineTone)}</span>
            </div>
            <p>
              {rulesEngine.passedRules} pass, {rulesEngine.failedRules} fail, {rulesEngine.skippedRules} skip
              {" "}({rulesEngine.format}, {rulesEngine.engineVersion}).
            </p>
            {failingRules.length > 0 ? (
              <details className="checks-details">
                <summary>Show failing rules</summary>
                <ul>
                  {failingRules.map((rule) => (
                    <li key={rule.id}>
                      <strong>{rule.name}</strong>: {rule.message}
                      {Array.isArray(rule.remediation) && rule.remediation.length > 0 ? (
                        <ul>
                          {rule.remediation.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
