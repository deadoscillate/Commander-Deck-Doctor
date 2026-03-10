import { apiJson, getRequestId } from "@/lib/api/http";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/api/rateLimit";
import { getMergedCommanderProfile } from "@/lib/commanderProfiles.server";

export const runtime = "nodejs";

const COMMANDER_PROFILE_RATE_LIMIT = {
  scope: "commander-profile" as const,
  limit: 60,
  windowSeconds: 60
};

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = await checkRateLimit(request, COMMANDER_PROFILE_RATE_LIMIT);
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return apiJson({ error: "Too many requests." }, { status: 429, requestId, headers: rateLimitHeaders });
  }

  const url = new URL(request.url);
  const rawName = url.searchParams.get("name") ?? "";
  const name = rawName.trim();

  if (!name) {
    return apiJson({ error: "Commander name is required." }, { status: 400, requestId, headers: rateLimitHeaders });
  }

  const merged = getMergedCommanderProfile(name);
  return apiJson(
    {
      commanderName: name,
      source: merged.source,
      profile: merged.profile
    },
    { requestId, headers: rateLimitHeaders }
  );
}

