import { describe, expect, it } from "vitest";
import type { AnalyzeResponse } from "@/lib/contracts";
import { buildPlaintextReport } from "@/lib/reportText";
import { createAnalyzeResponseFixture } from "@/tests/fixtures/analyzeResponseFixture";

describe("buildPlaintextReport", () => {
  it("formats nullable numeric fields without throwing", () => {
    const result = createAnalyzeResponseFixture();
    const unsafeResult = result as unknown as {
      summary: { averageManaValue: number | null };
      openingHandSimulation: {
        playablePct: number | null;
        deadPct: number | null;
        rampInOpeningPct: number | null;
        averageFirstSpellTurn: number | null;
        estimatedCommanderCastTurn: number | null;
      };
    };

    unsafeResult.summary.averageManaValue = null;
    unsafeResult.openingHandSimulation.playablePct = null;
    unsafeResult.openingHandSimulation.deadPct = null;
    unsafeResult.openingHandSimulation.rampInOpeningPct = null;
    unsafeResult.openingHandSimulation.averageFirstSpellTurn = null;
    unsafeResult.openingHandSimulation.estimatedCommanderCastTurn = null;

    const report = buildPlaintextReport(result as AnalyzeResponse);

    expect(report).toContain("- Avg Mana Value: N/A");
    expect(report).toContain("- Playable hands: 0.0%");
    expect(report).toContain("- Average first spell turn: N/A");
    expect(report).toContain("- Estimated commander cast turn: N/A");
  });
});
