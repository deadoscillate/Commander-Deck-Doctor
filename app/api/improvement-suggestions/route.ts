import { CardDatabase, createEngine, type EngineApi } from "@/engine";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { reportApiError } from "@/lib/api/monitoring";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import type { RoleBreakdown } from "@/lib/contracts";
import { buildRoleSuggestions } from "@/lib/suggestions";
import type { CountKey } from "@/lib/thresholds";

export const runtime = "nodejs";

const SUGGESTIONS_REQUEST_MAX_BYTES = 150_000;
const SUGGESTIONS_RATE_LIMIT = {
  scope: "improvement-suggestions" as const,
  limit: 45,
  windowSeconds: 60
};

type SuggestionsRequest = {
  roleRows?: unknown;
  roleBreakdown?: unknown;
  deckColorIdentity?: unknown;
  existingCardNames?: unknown;
  archetypes?: unknown;
  commanderNames?: unknown;
  manaCurve?: unknown;
  averageManaValue?: unknown;
  limit?: unknown;
};

type RoleRowInput = {
  key: CountKey;
  label: string;
  value: number;
  recommendedText: string;
  status: "LOW" | "OK" | "HIGH";
};

const ALLOWED_ROLE_KEYS = new Set<CountKey>([
  "lands",
  "ramp",
  "draw",
  "removal",
  "wipes",
  "protection",
  "finishers"
]);

let suggestionEnginePromise: Promise<EngineApi> | null = null;

function getSuggestionEngine(): Promise<EngineApi> {
  if (!suggestionEnginePromise) {
    suggestionEnginePromise = (async () => {
      try {
        return createEngine();
      } catch {
        return createEngine({
          cardDatabase: CardDatabase.createWithEngineSet()
        });
      }
    })();
  }

  return suggestionEnginePromise;
}

function parseStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maxLength)
    .slice(0, maxItems);
}

function parseRoleRows(value: unknown): RoleRowInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: RoleRowInput[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const record = row as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const recommendedText =
      typeof record.recommendedText === "string" ? record.recommendedText.trim() : "";
    const valueNumber =
      typeof record.value === "number" && Number.isFinite(record.value) ? Math.floor(record.value) : 0;
    const status =
      record.status === "LOW" || record.status === "HIGH" || record.status === "OK"
        ? record.status
        : "OK";

    if (!ALLOWED_ROLE_KEYS.has(key as CountKey) || !label) {
      continue;
    }

    parsed.push({
      key: key as CountKey,
      label,
      value: Math.max(0, valueNumber),
      recommendedText,
      status
    });

    if (parsed.length >= 8) {
      break;
    }
  }

  return parsed;
}

function emptyRoleBreakdown(): RoleBreakdown {
  return {
    ramp: [],
    draw: [],
    removal: [],
    wipes: [],
    tutors: [],
    protection: [],
    finishers: []
  };
}

function parseRoleBreakdown(value: unknown): RoleBreakdown {
  const parsed = emptyRoleBreakdown();
  if (!value || typeof value !== "object") {
    return parsed;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(parsed) as Array<keyof RoleBreakdown>) {
    const rows = record[key];
    if (!Array.isArray(rows)) {
      continue;
    }

    parsed[key] = rows
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      .map((row) => ({
        name: typeof row.name === "string" ? row.name.trim() : "",
        qty: typeof row.qty === "number" && Number.isFinite(row.qty) ? Math.max(0, Math.floor(row.qty)) : 0
      }))
      .filter((row) => row.name.length > 0 && row.qty > 0)
      .slice(0, 64);
  }

  return parsed;
}

function parseLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 7;
  }

  return Math.max(3, Math.min(10, Math.floor(value)));
}

function parseAverageManaValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(12, value));
}

function parseArchetypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function parseManaCurve(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const parsed: Record<string, number> = {};
  for (const [bucket, count] of Object.entries(record)) {
    if (typeof count !== "number" || !Number.isFinite(count)) {
      continue;
    }

    parsed[bucket] = Math.max(0, Math.floor(count));
  }

  return parsed;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = await checkRateLimit(request, SUGGESTIONS_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Rate limit exceeded. Please retry shortly." },
      { status: 429, requestId, headers: rateLimitHeaders }
    );
  }

  const parsedBody = await parseJsonBody<SuggestionsRequest>(request, {
    maxBytes: SUGGESTIONS_REQUEST_MAX_BYTES
  });
  if (!parsedBody.ok) {
    return apiJson(
      { error: parsedBody.error },
      { status: parsedBody.status, requestId, headers: rateLimitHeaders }
    );
  }

  const payload = parsedBody.data;
  const roleRows = parseRoleRows(payload.roleRows);
  if (roleRows.length === 0) {
    return apiJson(
      { error: "Suggestion context is empty. Analyze a deck first, then retry." },
      { status: 400, requestId, headers: rateLimitHeaders }
    );
  }

  const roleBreakdown = parseRoleBreakdown(payload.roleBreakdown);
  const deckColorIdentity = parseStringArray(payload.deckColorIdentity, 6, 4);
  const existingCardNames = parseStringArray(payload.existingCardNames, 400, 160);
  const archetypes = parseArchetypes(payload.archetypes);
  const commanderNames = parseStringArray(payload.commanderNames, 4, 160);
  const manaCurve = parseManaCurve(payload.manaCurve);
  const averageManaValue = parseAverageManaValue(payload.averageManaValue);
  const limit = parseLimit(payload.limit);

  try {
    const engine = await getSuggestionEngine();
    const items = buildRoleSuggestions({
      roleRows,
      roleBreakdown,
      deckColorIdentity,
      existingCardNames,
      archetypes,
      commanderNames,
      manaCurve,
      averageManaValue,
      cardDatabase: engine.cardDatabase,
      limit
    });

    return apiJson(
      {
        colorIdentity: deckColorIdentity,
        items,
        disclaimer:
          "Suggestions prioritize staple options, commander and archetype fit, curve fit, and protection density, then backfill from Commander-legal engine-classified cards in your color identity. Existing deck cards are excluded."
      },
      { status: 200, requestId, headers: rateLimitHeaders }
    );
  } catch (error) {
    reportApiError(error, {
      requestId,
      route: "/api/improvement-suggestions",
      status: 500,
      details: {
        roleRowCount: roleRows.length,
        existingCardCount: existingCardNames.length
      }
    });
    return apiJson(
      { error: "Failed to build improvement suggestions." },
      { status: 500, requestId, headers: rateLimitHeaders }
    );
  }
}
