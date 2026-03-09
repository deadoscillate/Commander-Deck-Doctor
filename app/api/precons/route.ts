import { apiJson, getRequestId } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { getPreconBySlug, listPrecons } from "@/lib/precons";

export const runtime = "nodejs";

const PRECONS_RATE_LIMIT = {
  scope: "precons" as const,
  limit: 45,
  windowSeconds: 60
};

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = await checkRateLimit(request, PRECONS_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiJson(
      { error: "Too many precon library requests. Please wait a moment and try again." },
      {
        status: 429,
        requestId,
        headers: rateLimitHeaders
      }
    );
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() ?? "";
  if (slug) {
    const precon = await getPreconBySlug(slug);
    if (!precon) {
      return apiJson({ error: "Precon not found." }, { status: 404, requestId, headers: rateLimitHeaders });
    }

    return apiJson(precon, { requestId, headers: rateLimitHeaders });
  }

  const query = url.searchParams.get("q");
  const limit = parseLimit(url.searchParams.get("limit"));
  const payload = await listPrecons({ query, limit });
  return apiJson(payload, { requestId, headers: rateLimitHeaders });
}
