import { importDeckFromUrl } from "@/lib/deckUrlImport";
import { apiJson, getRequestId, parseJsonBody } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";

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
    console.error("Import URL failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    return apiJson({ error: message }, { status: 400, requestId, headers: rateLimitHeaders });
  }
}
