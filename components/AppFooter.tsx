import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <p className="muted">Not affiliated with Wizards of the Coast.</p>
        <p className="muted">Card data and symbols via Scryfall.</p>
        <p className="muted">
          Combo data via{" "}
          <Link href="https://commanderspellbook.com" target="_blank" rel="noreferrer" className="inline-link">
            Commander Spellbook
          </Link>
          .
        </p>
        <p className="muted">
          Privacy: saved decks are stored locally in your browser (no server upload for saved-deck storage).
        </p>
        <p>
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
