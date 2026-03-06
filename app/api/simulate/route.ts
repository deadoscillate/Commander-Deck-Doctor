import { CardDatabase, createEngine } from "@/engine";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { reportApiError } from "@/lib/api/monitoring";

export const runtime = "nodejs";

const SIMULATE_REQUEST_MAX_BYTES = 200_000;
const MAX_DECK_ENTRIES = 400;
const MAX_CARD_NAME_LENGTH = 160;
const MAX_RUNS = 10_000;
const DEFAULT_RUNS = 1_000;
const DEFAULT_SEED = "report-sim";

type RawDeckEntry = {
  name?: unknown;
  qty?: unknown;
};

type SimulateRequest = {
  deck?: unknown;
  commanderName?: unknown;
  runs?: unknown;
  seed?: unknown;
};

type NormalizedDeckEntry = {
  name: string;
  qty: number;
};

let simulatorEngine: ReturnType<typeof createEngine> | null = null;

function getSimulatorEngine() {
  if (simulatorEngine) {
    return simulatorEngine;
  }

  try {
    simulatorEngine = createEngine();
  } catch {
    simulatorEngine = createEngine({
      cardDatabase: CardDatabase.createWithEngineSet()
    });
  }

  return simulatorEngine;
}

function normalizeLookupName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseCommanderName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseSeed(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return DEFAULT_SEED;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return DEFAULT_SEED;
  }

  return trimmed.slice(0, 256);
}

function parseRuns(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_RUNS;
  }

  const normalized = Math.floor(value);
  return Math.max(1, Math.min(MAX_RUNS, normalized));
}

function parseDeckEntries(value: unknown): NormalizedDeckEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows = value as RawDeckEntry[];
  const merged = new Map<string, NormalizedDeckEntry>();
  for (const row of rows) {
    const rawName = typeof row?.name === "string" ? row.name.trim() : "";
    if (!rawName || rawName.length > MAX_CARD_NAME_LENGTH) {
      continue;
    }

    const qtyValue = typeof row?.qty === "number" && Number.isFinite(row.qty) ? Math.floor(row.qty) : 0;
    if (qtyValue <= 0) {
      continue;
    }

    const normalized = normalizeLookupName(rawName);
    if (!normalized) {
      continue;
    }

    const existing = merged.get(normalized);
    if (existing) {
      existing.qty += qtyValue;
      continue;
    }

    merged.set(normalized, {
      name: rawName,
      qty: qtyValue
    });
  }

  return Array.from(merged.values()).slice(0, MAX_DECK_ENTRIES);
}

/**
 * POST /api/simulate
 * Runs deterministic opening-hand and goldfish simulations using the server-side engine/card DB.
 */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const parsedBody = await parseJsonBody<SimulateRequest>(request, {
    maxBytes: SIMULATE_REQUEST_MAX_BYTES
  });
  if (!parsedBody.ok) {
    return apiJson({ error: parsedBody.error }, { status: parsedBody.status, requestId });
  }

  const payload = parsedBody.data;
  const deck = parseDeckEntries(payload.deck);
  if (deck.length === 0) {
    return apiJson(
      { error: "Simulation deck is empty. Analyze a deck first, then retry." },
      { status: 400, requestId }
    );
  }

  if (deck.length > MAX_DECK_ENTRIES) {
    return apiJson(
      { error: `Simulation supports up to ${MAX_DECK_ENTRIES} distinct entries.` },
      { status: 413, requestId }
    );
  }

  try {
    const engine = getSimulatorEngine();
    const runs = parseRuns(payload.runs);
    const seed = parseSeed(payload.seed);
    const commander = parseCommanderName(payload.commanderName);

    const opening = engine.simulate({
      type: "OPENING_HAND",
      deck,
      runs,
      seed,
      commander
    });
    const goldfish = engine.simulate({
      type: "GOLDFISH",
      deck,
      runs,
      seed,
      commander
    });

    const unknownCards: string[] = [];
    let unknownCardQty = 0;
    let totalDeckSize = 0;
    for (const entry of deck) {
      totalDeckSize += entry.qty;
      if (!engine.cardDatabase.getCardByName(entry.name)) {
        unknownCards.push(entry.name);
        unknownCardQty += entry.qty;
      }
    }

    const modeledCardQty = Math.max(0, totalDeckSize - unknownCardQty);
    let warning: string | null = null;
    if (modeledCardQty <= 0) {
      warning =
        "No cards from this deck matched the current simulation engine card set, so results are not representative yet.";
    } else if (unknownCardQty > 0) {
      warning = `${unknownCardQty} card slot(s) were ignored due to unknown card names in the simulation model.`;
    }

    return apiJson(
      {
        opening,
        goldfish,
        seed,
        runs,
        modeledCardQty,
        totalDeckSize,
        unknownCardQty,
        unknownCards,
        warning
      },
      { status: 200, requestId }
    );
  } catch (error) {
    reportApiError(error, {
      requestId,
      route: "/api/simulate",
      status: 500
    });
    return apiJson(
      { error: "Simulation failed due to a server error. Please retry." },
      { status: 500, requestId }
    );
  }
}

