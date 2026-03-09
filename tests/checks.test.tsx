/* @vitest-environment jsdom */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Checks } from "@/components/Checks";
import type { DeckChecks, RulesEngineReport } from "@/lib/contracts";

const baseChecks: DeckChecks = {
  deckSize: {
    ok: true,
    expected: 100,
    actual: 100,
    message: "Deck size is 100."
  },
  unknownCards: {
    ok: true,
    count: 0,
    cards: [],
    message: "All card names resolved."
  },
  singleton: {
    ok: true,
    duplicateCount: 0,
    duplicates: [],
    message: "No non-basic duplicates detected."
  },
  colorIdentity: {
    ok: true,
    enabled: true,
    commanderName: "Atraxa, Praetors' Voice",
    commanderColorIdentity: ["W", "U", "B", "G"],
    offColorCount: 0,
    offColorCards: [],
    message: "All cards are in-color."
  }
};

const rulesEngineWithBanlistFailure: RulesEngineReport = {
  format: "commander",
  engineVersion: "fixture",
  status: "FAIL",
  passedRules: 5,
  failedRules: 1,
  skippedRules: 0,
  rules: [
    {
      id: "commander.banlist",
      name: "Banlist",
      description: "Commander banned cards are not legal.",
      domain: "CARD_VALIDATION",
      severity: "ERROR",
      outcome: "FAIL",
      message: "2 banned cards detected against Commander RC banlist (2026-03-07).",
      findings: [
        { name: "Black Lotus", qty: 1 },
        { name: "Flash", qty: 1 }
      ]
    }
  ],
  warnings: [],
  disclaimer: "Rules engine fixture."
};

describe("Checks", () => {
  it("shows the banned card list when the banlist rule fails", async () => {
    const user = userEvent.setup();

    render(<Checks checks={baseChecks} rulesEngine={rulesEngineWithBanlistFailure} />);

    const banlistCard = screen.getByText("Show banned cards").closest(".check-item") as HTMLElement | null;

    expect(banlistCard).toBeTruthy();
    expect(within(banlistCard as HTMLElement).getByText(/2 banned cards detected/i)).toBeTruthy();

    await user.click(within(banlistCard as HTMLElement).getByText("Show banned cards"));

    expect(within(banlistCard as HTMLElement).getByRole("button", { name: "Black Lotus" })).toBeTruthy();
    expect(within(banlistCard as HTMLElement).getByRole("button", { name: "Flash" })).toBeTruthy();
  });
});
