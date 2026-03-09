import { deriveCommanderOptions } from "@/lib/commanderOptions";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { parseDecklistWithCommander } from "@/lib/decklist";
import { fetchDeckCards } from "@/lib/scryfall";
import type { DeckPriceMode } from "@/lib/contracts";

export const runtime = "nodejs";

const COMMANDER_OPTIONS_REQUEST_MAX_BYTES = 300_000;
const COMMANDER_OPTIONS_RATE_LIMIT = {
  scope: "commander-options" as const,
  limit: 30,
  windowSeconds: 60
};

type CommanderOptionsRequest = {
  decklist?: string;
  deckPriceMode?: DeckPriceMode | null;
};

function parseDeckPriceMode(value: unknown): DeckPriceMode {
  return value === "decklist-set" ? "decklist-set" : "oracle-default";
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = await checkRateLimit(request, COMMANDER_OPTIONS_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Too many commander-option lookups. Please wait a moment and try again." },
      {
        status: 429,
        requestId,
        headers: rateLimitHeaders
      }
    );
  }

  const parsedBody = await parseJsonBody<CommanderOptionsRequest>(request, {
    maxBytes: COMMANDER_OPTIONS_REQUEST_MAX_BYTES
  });
  if (!parsedBody.ok) {
    return apiJson({ error: parsedBody.error }, { status: parsedBody.status, requestId, headers: rateLimitHeaders });
  }

  const decklist = typeof parsedBody.data.decklist === "string" ? parsedBody.data.decklist.trim() : "";
  if (!decklist) {
    return apiJson(
      {
        commanderFromSection: null,
        options: [],
        suggestedCommanderName: null
      },
      { requestId, headers: rateLimitHeaders }
    );
  }

  const deckPriceMode = parseDeckPriceMode(parsedBody.data.deckPriceMode);
  const { entries, commanderFromSection } = parseDecklistWithCommander(decklist);
  if (entries.length === 0 || commanderFromSection) {
    return apiJson(
      {
        commanderFromSection,
        options: [],
        suggestedCommanderName: commanderFromSection
      },
      { requestId, headers: rateLimitHeaders }
    );
  }

  const { knownCards } = await fetchDeckCards(entries, 8, { deckPriceMode });
  const commanderSelection = deriveCommanderOptions(
    knownCards,
    entries,
    entries.reduce((sum, entry) => sum + entry.qty, 0)
  );

  return apiJson(
    {
      commanderFromSection: null,
      options: commanderSelection.options,
      suggestedCommanderName: commanderSelection.suggestedCommanderCard?.name ?? null
    },
    { requestId, headers: rateLimitHeaders }
  );
}
