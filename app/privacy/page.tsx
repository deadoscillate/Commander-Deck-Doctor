import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Commander Deck Doctor",
  description: "Privacy policy for Commander Deck Doctor."
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: March 6, 2026</p>

      <section>
        <h2>What We Store</h2>
        <ul>
          <li>Saved Decks are stored in your browser local storage only.</li>
          <li>Analyze Deck sends your submitted decklist to server endpoints for processing.</li>
          <li>Share Deck Report stores a decklist + report snapshot in our database to generate share links.</li>
        </ul>
      </section>

      <section>
        <h2>Data Retention</h2>
        <ul>
          <li>Shared report records are automatically pruned using a retention window.</li>
          <li>Default retention is 180 days and may be adjusted by environment configuration.</li>
        </ul>
      </section>

      <section>
        <h2>Third-Party Services</h2>
        <ul>
          <li>Hosting/infrastructure: Vercel.</li>
          <li>Shared report database: Neon Postgres.</li>
          <li>Error monitoring: Sentry (when enabled by environment configuration).</li>
          <li>Card metadata/images: Scryfall.</li>
          <li>Combo references: Commander Spellbook snapshot data.</li>
        </ul>
      </section>

      <section>
        <h2>Your Controls</h2>
        <ul>
          <li>You can clear locally stored decks by clearing local site storage in your browser.</li>
          <li>You can avoid creating server-stored entries by not using the Share Deck Report feature.</li>
        </ul>
      </section>

      <section>
        <h2>Requests and Contact</h2>
        <p>
          For privacy, takedown, or data-removal requests, open a{" "}
          <Link
            href="https://github.com/deadoscillate/Commander-Deck-Doctor/issues/new?title=%5BLegal%20Request%5D%20"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-link"
          >
            legal request
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
