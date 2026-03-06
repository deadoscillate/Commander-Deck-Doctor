import { describe, expect, it } from "vitest";

type SimulateResponse = {
  error?: string;
  opening?: {
    type?: string;
    playableHandsPct?: number;
    deadHandsPct?: number;
  };
  goldfish?: {
    type?: string;
    avgFirstSpellTurn?: number | null;
    avgCommanderCastTurn?: number | null;
  };
  warning?: string | null;
  unknownCardQty?: number;
  modeledCardQty?: number;
  totalDeckSize?: number;
};

function buildRequest(payload: unknown): Request {
  return new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

describe("POST /api/simulate", () => {
  it("returns 400 when simulation deck is missing", async () => {
    const { POST } = await import("@/app/api/simulate/route");
    const response = await POST(buildRequest({ deck: [] }));
    const body = (await response.json()) as SimulateResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe("Simulation deck is empty. Analyze a deck first, then retry.");
  });

  it("produces deterministic results for the same seed", async () => {
    const { POST } = await import("@/app/api/simulate/route");
    const payload = {
      deck: [
        { name: "Forest", qty: 36 },
        { name: "Island", qty: 32 },
        { name: "Arcane Signet", qty: 1 },
        { name: "Sol Ring", qty: 1 },
        { name: "Cultivate", qty: 4 },
        { name: "Counterspell", qty: 4 },
        { name: "Beast Within", qty: 4 },
        { name: "Rhystic Study", qty: 3 },
        { name: "Aesi, Tyrant of Gyre Strait", qty: 1 },
        { name: "Cyclonic Rift", qty: 2 },
        { name: "Kodama's Reach", qty: 3 },
        { name: "Mystic Remora", qty: 2 },
        { name: "Swan Song", qty: 2 },
        { name: "Nature's Lore", qty: 3 },
        { name: "Farseek", qty: 2 }
      ],
      commanderName: "Aesi, Tyrant of Gyre Strait",
      runs: 250,
      seed: "deterministic-seed-1"
    };

    const responseA = await POST(buildRequest(payload));
    const bodyA = (await responseA.json()) as SimulateResponse;
    const responseB = await POST(buildRequest(payload));
    const bodyB = (await responseB.json()) as SimulateResponse;

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(bodyA.opening?.type).toBe("OPENING_HAND");
    expect(bodyA.goldfish?.type).toBe("GOLDFISH");
    expect(bodyA.opening?.playableHandsPct).toBe(bodyB.opening?.playableHandsPct);
    expect(bodyA.opening?.deadHandsPct).toBe(bodyB.opening?.deadHandsPct);
    expect(bodyA.goldfish?.avgFirstSpellTurn).toBe(bodyB.goldfish?.avgFirstSpellTurn);
    expect(bodyA.goldfish?.avgCommanderCastTurn).toBe(bodyB.goldfish?.avgCommanderCastTurn);
  });

  it("returns unknown-card warning details when names are unresolved", async () => {
    const { POST } = await import("@/app/api/simulate/route");
    const response = await POST(
      buildRequest({
        deck: [
          { name: "Forest", qty: 30 },
          { name: "Totally Fake Card Name", qty: 10 }
        ],
        runs: 100,
        seed: "unknown-test"
      })
    );
    const body = (await response.json()) as SimulateResponse;

    expect(response.status).toBe(200);
    expect(body.unknownCardQty).toBe(10);
    expect(body.modeledCardQty).toBe(30);
    expect(body.totalDeckSize).toBe(40);
    expect(typeof body.warning).toBe("string");
  });
});

