import type { EngineApi } from "@/engine";
import { prewarmScryfallRuntime } from "@/lib/scryfall";

type DetectCombosInDeckFn = typeof import("@/lib/combos").detectCombosInDeck;

let analyzerEnginePromise: Promise<EngineApi> | null = null;
let detectCombosInDeckFn: DetectCombosInDeckFn | null = null;

export async function getAnalyzerEngine(): Promise<EngineApi> {
  if (!analyzerEnginePromise) {
    analyzerEnginePromise = (async () => {
      const engineModule = await import("@/engine");

      try {
        return engineModule.createEngine();
      } catch {
        return engineModule.createEngine({
          cardDatabase: engineModule.CardDatabase.createWithEngineSet()
        });
      }
    })();
  }

  try {
    return await analyzerEnginePromise;
  } catch (error) {
    analyzerEnginePromise = null;
    throw error;
  }
}

export async function getDetectCombosInDeck(): Promise<DetectCombosInDeckFn> {
  if (detectCombosInDeckFn) {
    return detectCombosInDeckFn;
  }

  const combosModule = await import("@/lib/combos");
  detectCombosInDeckFn = combosModule.detectCombosInDeck;
  return detectCombosInDeckFn;
}

export async function prewarmAnalyzeRuntime(): Promise<{
  engineCardCount: number;
  comboDetectorReady: boolean;
  oracleCardCount: number;
  defaultCardCount: number;
  sqliteAvailable: boolean;
}> {
  await getDetectCombosInDeck();
  const [engine, scryfall] = await Promise.all([
    getAnalyzerEngine(),
    prewarmScryfallRuntime()
  ]);

  return {
    engineCardCount: engine.cardDatabase.cardCount(),
    comboDetectorReady: true,
    oracleCardCount: scryfall.oracleCardCount,
    defaultCardCount: scryfall.defaultCardCount,
    sqliteAvailable: scryfall.sqliteAvailable
  };
}
