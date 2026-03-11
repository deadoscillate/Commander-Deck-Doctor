import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeTelemetryRecord } from "@/lib/analyzeTelemetryStore";
import type { ScryfallCard } from "@/lib/types";

function buildAnalyzeRequest(payload: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function buildWarmupRequest(headers?: HeadersInit): Request {
  return new Request("http://localhost/api/warmup", {
    method: "GET",
    headers
  });
}

function buildCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    name: "Test Card",
    type_line: "Artifact",
    cmc: 1,
    mana_cost: "{1}",
    colors: [],
    color_identity: [],
    oracle_text: "",
    image_uris: null,
    card_faces: [],
    prices: {
      usd: null,
      usd_foil: null,
      usd_etched: null,
      tix: null
    },
    ...overrides
  };
}

afterEach(() => {
  delete process.env.ANALYZE_WARMUP_TOKEN;
  vi.clearAllMocks();
  vi.resetModules();
  vi.unmock("@/lib/analyzeRuntime");
  vi.unmock("@/lib/scryfall");
  vi.unmock("@/lib/analyzeTelemetryStore");
});

describe("GET /api/warmup", () => {
  it("returns 401 when a warmup token is configured and missing", async () => {
    process.env.ANALYZE_WARMUP_TOKEN = "secret-token";

    const { GET } = await import("@/app/api/warmup/route");
    const response = await GET(buildWarmupRequest());
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Warmup token required.");
  });

  it("warms the runtime so the next analyze request is not marked cold", async () => {
    const recordAnalyzeTelemetryMock = vi.fn(async (_record: AnalyzeTelemetryRecord) => {});

    vi.doMock("@/lib/analyzeRuntime", () => ({
      getAnalyzerEngine: vi.fn(async () => ({
        cardDatabase: {
          getCardByName: vi.fn(() => null),
          cardCount: vi.fn(() => 42)
        }
      })),
      getDetectCombosInDeck: vi.fn(async () =>
        vi.fn(() => ({
          detected: [],
          conditional: [],
          potential: []
        }))
      ),
      prewarmAnalyzeRuntime: vi.fn(async () => ({
        engineCardCount: 42,
        comboDetectorReady: true,
        oracleCardCount: 36923,
        defaultCardCount: 36440,
        sqliteAvailable: true,
        cardSearchIndexCount: 36440,
        commanderSearchCount: 2907,
        builderSetOptionCount: 512
      }))
    }));

    vi.doMock("@/lib/scryfall", () => ({
      fetchDeckCards: vi.fn(async () => ({
        knownCards: [
          {
            name: "Sol Ring",
            qty: 1,
            card: buildCard({
              name: "Sol Ring",
              type_line: "Artifact",
              cmc: 1,
              mana_cost: "{1}",
              oracle_text: "{T}: Add {C}{C}."
            })
          }
        ],
        unknownCards: []
      })),
      getCardById: vi.fn(async () => null),
      getCardByName: vi.fn(async () => null),
      getCardByNameWithSet: vi.fn(async () => null)
    }));
    vi.doMock("@/lib/analyzeTelemetryStore", () => ({
      recordAnalyzeTelemetry: recordAnalyzeTelemetryMock
    }));

    const { GET } = await import("@/app/api/warmup/route");
    const warmupResponse = await GET(buildWarmupRequest());
    const warmupBody = (await warmupResponse.json()) as {
      ok?: boolean;
      coldStartClaimed?: boolean;
      warmed?: {
        engineCardCount?: number;
        sqliteAvailable?: boolean;
      };
    };

    const { POST } = await import("@/app/api/analyze/route");
    const analyzeResponse = await POST(buildAnalyzeRequest({ decklist: "1 Sol Ring" }));

    expect(warmupResponse.status).toBe(200);
    expect(warmupBody.ok).toBe(true);
    expect(warmupBody.coldStartClaimed).toBe(true);
    expect(warmupBody.warmed?.engineCardCount).toBe(42);
    expect(warmupBody.warmed?.sqliteAvailable).toBe(true);

    expect(analyzeResponse.status).toBe(200);
    expect(analyzeResponse.headers.get("x-analyze-cold-start")).toBe("0");
    expect(recordAnalyzeTelemetryMock).toHaveBeenCalledTimes(1);
    expect(recordAnalyzeTelemetryMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        coldStart: false,
        cache: "miss"
      })
    );
  });
});
