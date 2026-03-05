import { importDeckFromUrl } from "@/lib/deckUrlImport";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { reportApiError } from "@/lib/api/monitoring";

type ImportUrlRequest = {
  url?: string;
};

const IMPORT_URL_REQUEST_MAX_BYTES = 8_000;
const IMPORT_URL_MAX_CHARS = 2_048;
const IMPORT_URL_RATE_LIMIT = {
  scope: "import-url" as const,
  limit: 20,
  windowSeconds: 60
};

const IMPORT_CLIENT_ERRORS = [
  "Invalid URL.",
  "Only HTTPS deck URLs are supported.",
  "Could not parse Moxfield deck ID from URL.",
  "Could not parse Archidekt deck ID from URL.",
  "Unsupported deck URL. Supported providers: Moxfield, Archidekt.",
  "Deck not found. Check the URL and make sure the deck is public.",
  "Provider denied access. Make sure the deck is public."
];

function classifyImportErrorStatus(message: string): 400 | 502 | 500 {
  if (IMPORT_CLIENT_ERRORS.includes(message)) {
    return 400;
  }

  if (
    message === "Provider API timed out. Please retry." ||
    message.includes("blocked automated requests") ||
    /^Import failed \(\d+\) from provider API\.$/.test(message)
  ) {
    return 502;
  }

  return 500;
}

/**
 * POST /api/import-url
 * Imports deck text from supported provider URLs (Moxfield, Archidekt).
 */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = await checkRateLimit(request, IMPORT_URL_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Rate limit exceeded. Please retry shortly." },
      { status: 429, requestId, headers: rateLimitHeaders }
    );
  }

  const parsedBody = await parseJsonBody<ImportUrlRequest>(request, { maxBytes: IMPORT_URL_REQUEST_MAX_BYTES });
  if (!parsedBody.ok) {
    return apiJson(
      { error: parsedBody.error },
      { status: parsedBody.status, requestId, headers: rateLimitHeaders }
    );
  }

  const payload = parsedBody.data;
  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (!url) {
    return apiJson({ error: "Deck URL is required." }, { status: 400, requestId, headers: rateLimitHeaders });
  }

  if (url.length > IMPORT_URL_MAX_CHARS) {
    return apiJson(
      { error: "Deck URL is too long." },
      { status: 413, requestId, headers: rateLimitHeaders }
    );
  }

  try {
    const imported = await importDeckFromUrl(url);
    return apiJson(imported, { status: 200, requestId, headers: rateLimitHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deck import failed.";
    const status = classifyImportErrorStatus(message);
    const normalizedClientMessage = message.includes("Unsupported")
      ? "Unsupported URL. Use a Moxfield or Archidekt deck link."
      : message;
    reportApiError(error, {
      requestId,
      route: "/api/import-url",
      status,
      details: {
        upstreamMessage: message
      }
    });

    if (status >= 500) {
      return apiJson(
        { error: "Deck import failed due to an upstream provider issue. Please retry." },
        { status, requestId, headers: rateLimitHeaders }
      );
    }

    return apiJson({ error: normalizedClientMessage }, { status, requestId, headers: rateLimitHeaders });
  }
}
