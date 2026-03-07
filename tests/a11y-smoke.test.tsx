// @vitest-environment jsdom

import { render } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import Page from "@/app/page";
import { CommanderHeroHeader } from "@/components/CommanderHeroHeader";

async function runAxe(container: HTMLElement) {
  return axe.run(container, {
    rules: {
      // JSDOM does not compute color contrast in a browser-equivalent way.
      "color-contrast": { enabled: false }
    }
  });
}

describe("accessibility smoke", () => {
  it("home page has no obvious a11y violations", async () => {
    const { container } = render(<Page />);
    const results = await runAxe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("commander hero header has no obvious a11y violations", async () => {
    const { container } = render(
      <CommanderHeroHeader
        commander={{
          name: "Kentaro, the Smiling Cat",
          colorIdentity: ["W", "U", "B", "R", "G"],
          cmc: 4
        }}
        archetypeLabel="Five-Color Legends"
        bracketLabel="Bracket 3 - Optimized"
      />
    );
    const results = await runAxe(container);
    expect(results.violations).toHaveLength(0);
  });
});
