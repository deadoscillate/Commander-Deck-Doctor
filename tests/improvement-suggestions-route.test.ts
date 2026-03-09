import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/improvement-suggestions/route";

describe("POST /api/improvement-suggestions", () => {
  it("returns suggestion payloads from report context", async () => {
    const response = await POST(
      new Request("http://localhost/api/improvement-suggestions", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          roleRows: [
            {
              key: "ramp",
              label: "Ramp",
              value: 4,
              recommendedText: "8-12",
              status: "LOW"
            }
          ],
          roleBreakdown: {
            ramp: [],
            draw: [],
            removal: [],
            wipes: [],
            tutors: [],
            protection: [],
            finishers: []
          },
          deckColorIdentity: ["G"],
          archetypes: ["Lands Matter"],
          manaCurve: {
            "5": 8,
            "6": 5,
            "7+": 4
          },
          averageManaValue: 3.6,
          existingCardNames: ["Cultivate", "Llanowar Elves"],
          limit: 4
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      colorIdentity: string[];
      items: Array<{ key: string; suggestions: string[]; rationale?: string }>;
      disclaimer: string;
    };

    expect(payload.colorIdentity).toEqual(["G"]);
    expect(payload.items[0]?.key).toBe("ramp");
    expect(payload.items[0]?.suggestions.length).toBeGreaterThan(0);
    expect(payload.items[0]?.rationale).toBeTruthy();
    expect(payload.disclaimer).toContain("curve fit");
  });
});
