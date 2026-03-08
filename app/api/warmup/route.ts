import { prewarmAnalyzeRuntime } from "@/lib/analyzeRuntime";
import { apiJson, getRequestId } from "@/lib/api/http";
import { reportApiError } from "@/lib/api/monitoring";
import { markRuntimeWarm } from "@/lib/runtimeWarmState";

export const runtime = "nodejs";

function isWarmupAuthorized(request: Request): boolean {
  const configuredToken = process.env.ANALYZE_WARMUP_TOKEN?.trim();
  if (!configuredToken) {
    return true;
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token && token === configuredToken) {
      return true;
    }
  }

  const headerToken = request.headers.get("x-warmup-token")?.trim();
  return Boolean(headerToken && headerToken === configuredToken);
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  if (!isWarmupAuthorized(request)) {
    return apiJson(
      { error: "Warmup token required." },
      {
        status: 401,
        requestId
      }
    );
  }

  const startedAt = performance.now();
  const runtimeState = markRuntimeWarm();

  try {
    const warmed = await prewarmAnalyzeRuntime();
    const durationMs = Number((performance.now() - startedAt).toFixed(1));

    return apiJson(
      {
        ok: true,
        coldStartClaimed: runtimeState.coldStart,
        instanceUptimeMs: runtimeState.instanceUptimeMs,
        durationMs,
        warmed
      },
      {
        status: 200,
        requestId,
        headers: {
          "x-runtime-cold-start": runtimeState.coldStart ? "1" : "0",
          "x-runtime-instance-uptime-ms": String(Math.max(0, Math.floor(runtimeState.instanceUptimeMs)))
        }
      }
    );
  } catch (error) {
    reportApiError(error, {
      requestId,
      route: "/api/warmup",
      status: 500
    });

    return apiJson(
      { error: "Warmup failed due to a server error." },
      {
        status: 500,
        requestId
      }
    );
  }
}
