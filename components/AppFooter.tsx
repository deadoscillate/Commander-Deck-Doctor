import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <p className="muted">
          Commander Deck Doctor is unofficial Fan Content permitted under the{" "}
          <Link
            href="https://company.wizards.com/en/legal/fancontentpolicy"
            target="_blank"
            rel="noreferrer"
            className="inline-link"
          >
            Wizards Fan Content Policy
          </Link>
          . Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast.
          Copyright Wizards of the Coast LLC.
        </p>
        <p className="muted">Magic: The Gathering and Commander are trademarks of Wizards of the Coast LLC.</p>
        <p className="muted">
          Card data and symbols via{" "}
          <Link href="https://scryfall.com" target="_blank" rel="noreferrer" className="inline-link">
            Scryfall
          </Link>
          .
        </p>
        <p className="muted">
          Combo data via{" "}
          <Link href="https://commanderspellbook.com" target="_blank" rel="noreferrer" className="inline-link">
            Commander Spellbook
          </Link>
          .
        </p>
        <p className="muted">
          Privacy: saved decks stay in your browser local storage. Analysis requests are processed server-side. Shared
          report links store decklist + report snapshot server-side with retention limits (default 180 days).
        </p>
        <p className="muted">
          Copyright/takedown/privacy request:{" "}
          <Link
            href="https://github.com/deadoscillate/Commander-Deck-Doctor/issues/new?title=%5BLegal%20Request%5D%20"
            target="_blank"
            rel="noreferrer"
            className="inline-link"
          >
            Open a legal request
          </Link>
          .
        </p>
        <p className="app-footer-links">
          <Link href="/privacy" className="inline-link">
            Privacy Policy
          </Link>{" "}
          |{" "}
          <Link href="/terms" className="inline-link">
            Terms of Use
          </Link>{" "}
          |{" "}
          <Link
            href="https://github.com/deadoscillate/Commander-Deck-Doctor/issues"
            target="_blank"
            rel="noreferrer"
            className="inline-link"
          >
            Report a bug / feedback
          </Link>
        </p>
      </div>
    </footer>
  );
}
