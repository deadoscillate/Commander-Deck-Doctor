import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

type ParseJsonBodySuccess<T> = {
  ok: true;
  data: T;
};

type ParseJsonBodyFailure = {
  ok: false;
  status: number;
  error: string;
};

export type ParseJsonBodyResult<T> = ParseJsonBodySuccess<T> | ParseJsonBodyFailure;

type ApiJsonOptions = {
  status?: number;
  requestId: string;
  headers?: Record<string, string>;
};

/**
 * Uses incoming request headers when available, otherwise generates a UUID.
 */
export function getRequestId(request: Request): string {
  const fromHeader = request.headers.get("x-request-id");
  if (fromHeader) {
    const trimmed = fromHeader.trim();
    if (trimmed && trimmed.length <= 128) {
      return trimmed;
    }
  }

  const fromVercel = request.headers.get("x-vercel-id");
  if (fromVercel) {
    const trimmed = fromVercel.trim();
    if (trimmed && trimmed.length <= 128) {
      return trimmed;
    }
  }

  return randomUUID();
}

/**
 * Extracts a best-effort client address for rate-limiting and logs.
 */
export function getClientAddress(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) {
    return realIp.trim();
  }

  return "unknown";
}

/**
 * Parses JSON body with content-type and size checks.
 */
export async function parseJsonBody<T>(
  request: Request,
  options: { maxBytes: number }
): Promise<ParseJsonBodyResult<T>> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      status: 415,
      error: "Content-Type must be application/json."
    };
  }

  const raw = await request.text();
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > options.maxBytes) {
    return {
      ok: false,
      status: 413,
      error: "Request body too large."
    };
  }

  try {
    return {
      ok: true,
      data: JSON.parse(raw) as T
    };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Invalid JSON payload."
    };
  }
}

/**
 * Standard API response wrapper with request tracing headers.
 */
export function apiJson(body: unknown, options: ApiJsonOptions): NextResponse {
  const response = NextResponse.json(body, { status: options.status ?? 200 });
  response.headers.set("x-request-id", options.requestId);
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-content-type-options", "nosniff");

  for (const [key, value] of Object.entries(options.headers ?? {})) {
    response.headers.set(key, value);
  }

  return response;
}
