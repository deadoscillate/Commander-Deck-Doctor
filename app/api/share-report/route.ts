import type { AnalyzeResponse } from "@/lib/contracts";
import { saveReport } from "@/lib/reportStore";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { reportApiError } from "@/lib/api/monitoring";
import { getPublicAppOrigin } from "@/lib/security/url";

export const runtime = "nodejs";

type ShareReportRequest = {
  decklist?: unknown;
  analysis?: unknown;
};

const SHARE_REQUEST_MAX_BYTES = 2_000_000;
const SHARE_DECKLIST_MAX_CHARS = 50_000;
const SHARE_RATE_LIMIT = {
  scope: "share-report" as const,
  limit: 20,
  windowSeconds: 60
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasFiniteNumber(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value);
}

function hasStringArray(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAnalyzeResponse(value: unknown): value is AnalyzeResponse {
  if (!isRecord(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const summary = isRecord(candidate.summary) ? candidate.summary : null;
  const metrics = isRecord(candidate.metrics) ? candidate.metrics : null;
  const roles = isRecord(candidate.roles) ? candidate.roles : null;
  const checks = isRecord(candidate.checks) ? candidate.checks : null;
  const deckHealth = isRecord(candidate.deckHealth) ? candidate.deckHealth : null;
  const commander = isRecord(candidate.commander) ? candidate.commander : null;
  const input = isRecord(candidate.input) ? candidate.input : null;
  const bracketReport = isRecord(candidate.bracketReport) ? candidate.bracketReport : null;

  const hasSummaryCore =
    summary !== null &&
    hasFiniteNumber(summary, "deckSize") &&
    hasFiniteNumber(summary, "uniqueCards") &&
    hasFiniteNumber(summary, "averageManaValue") &&
    isRecord(summary.types) &&
    isRecord(summary.manaCurve);

  const hasMetricsCore =
    metrics !== null &&
    hasFiniteNumber(metrics, "deckSize") &&
    hasFiniteNumber(metrics, "uniqueCards") &&
    hasFiniteNumber(metrics, "averageManaValue") &&
    isRecord(metrics.types) &&
    isRecord(metrics.manaCurve);

  const hasRoleCore =
    roles !== null &&
    hasFiniteNumber(roles, "ramp") &&
    hasFiniteNumber(roles, "draw") &&
    hasFiniteNumber(roles, "removal") &&
    hasFiniteNumber(roles, "wipes") &&
    hasFiniteNumber(roles, "tutors") &&
    hasFiniteNumber(roles, "protection") &&
    hasFiniteNumber(roles, "finishers");

  const hasChecksCore =
    checks !== null &&
    isRecord(checks.deckSize) &&
    isRecord(checks.unknownCards) &&
    isRecord(checks.singleton) &&
    isRecord(checks.colorIdentity);

  const hasDeckHealthCore =
    deckHealth !== null &&
    Array.isArray(deckHealth.rows) &&
    hasStringArray(deckHealth, "warnings") &&
    hasStringArray(deckHealth, "okays");

  const hasCommanderCore =
    commander !== null &&
    Array.isArray(commander.options) &&
    hasStringArray(commander, "selectedColorIdentity");

  const hasInputCore =
    input !== null &&
    Object.prototype.hasOwnProperty.call(input, "targetBracket") &&
    Object.prototype.hasOwnProperty.call(input, "expectedWinTurn") &&
    Object.prototype.hasOwnProperty.call(input, "commanderName") &&
    typeof input.userCedhFlag === "boolean" &&
    typeof input.userHighPowerNoGCFlag === "boolean";

  return (
    candidate.schemaVersion === "1.0" &&
    Array.isArray(candidate.parsedDeck) &&
    hasStringArray(candidate, "unknownCards") &&
    hasSummaryCore &&
    hasMetricsCore &&
    hasRoleCore &&
    hasChecksCore &&
    hasDeckHealthCore &&
    hasCommanderCore &&
    hasInputCore &&
    isRecord(candidate.archetypeReport) &&
    isRecord(candidate.comboReport) &&
    isRecord(candidate.ruleZero) &&
    isRecord(candidate.improvementSuggestions) &&
    hasStringArray(candidate, "warnings") &&
    bracketReport !== null
  );
}

/**
 * POST /api/share-report
 * Saves a report snapshot and returns a deterministic share URL path.
 */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = await checkRateLimit(request, SHARE_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Rate limit exceeded. Please retry shortly." },
      { status: 429, requestId, headers: rateLimitHeaders }
    );
  }

  const parsedBody = await parseJsonBody<ShareReportRequest>(request, { maxBytes: SHARE_REQUEST_MAX_BYTES });
  if (!parsedBody.ok) {
    return apiJson(
      { error: parsedBody.error },
      { status: parsedBody.status, requestId, headers: rateLimitHeaders }
    );
  }

  const payload = parsedBody.data;
  const decklist = typeof payload.decklist === "string" ? payload.decklist.trim() : "";
  if (!decklist) {
    return apiJson(
      { error: "Decklist is required for sharing." },
      { status: 400, requestId, headers: rateLimitHeaders }
    );
  }

  if (decklist.length > SHARE_DECKLIST_MAX_CHARS) {
    return apiJson(
      { error: "Decklist is too large. Reduce size and retry." },
      { status: 413, requestId, headers: rateLimitHeaders }
    );
  }

  if (!isAnalyzeResponse(payload.analysis)) {
    return apiJson(
      { error: "Valid analysis payload is required for sharing." },
      { status: 400, requestId, headers: rateLimitHeaders }
    );
  }

  try {
    const { hash } = await saveReport(decklist, payload.analysis);
    const path = `/report/${hash}`;
    const publicOrigin = getPublicAppOrigin(request);
    return apiJson(
      {
        hash,
        path,
        url: publicOrigin ? `${publicOrigin}${path}` : path
      },
      { status: 200, requestId, headers: rateLimitHeaders }
    );
  } catch (error) {
    reportApiError(error, {
      requestId,
      route: "/api/share-report",
      status: 500
    });
    return apiJson(
      { error: "Could not save shared report." },
      { status: 500, requestId, headers: rateLimitHeaders }
    );
  }
}
