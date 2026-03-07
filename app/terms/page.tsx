import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use | Commander Deck Doctor",
  description: "Terms of use for Commander Deck Doctor."
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <h1>Terms of Use</h1>
      <p className="muted">Last updated: March 6, 2026</p>

      <section>
        <h2>Service Scope</h2>
        <ul>
          <li>Commander Deck Doctor provides gameplay/deck-analysis guidance for informational use.</li>
          <li>Outputs are heuristics and do not constitute official tournament rulings or legal advice.</li>
        </ul>
      </section>

      <section>
        <h2>Intellectual Property and Trademarks</h2>
        <ul>
          <li>
            Commander Deck Doctor is unofficial Fan Content under the Wizards Fan Content Policy and is not
            approved/endorsed by Wizards of the Coast.
          </li>
          <li>Magic: The Gathering and Commander are trademarks of Wizards of the Coast LLC.</li>
          <li>Card data and symbols are provided via Scryfall; combo references are from Commander Spellbook data.</li>
        </ul>
      </section>

      <section>
        <h2>Acceptable Use</h2>
        <ul>
          <li>Do not abuse API endpoints, attempt denial-of-service, or circumvent rate limits.</li>
          <li>Do not submit unlawful content or content that infringes third-party rights.</li>
        </ul>
      </section>

      <section>
        <h2>Availability and Changes</h2>
        <ul>
          <li>Features may change, pause, or be removed at any time.</li>
          <li>We may update these terms and the privacy policy as the product evolves.</li>
        </ul>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For legal notices or takedown requests, open a{" "}
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
