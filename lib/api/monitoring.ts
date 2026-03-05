import * as Sentry from "@sentry/nextjs";

type ApiErrorContext = {
  requestId: string;
  route: string;
  status: number;
  details?: Record<string, unknown>;
};

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : "Unknown error");
}

/**
 * Captures API failures in server logs and forwards 5xx failures to Sentry.
 */
export function reportApiError(error: unknown, context: ApiErrorContext): void {
  const normalized = toError(error);

  console.error("API route failed", {
    route: context.route,
    status: context.status,
    requestId: context.requestId,
    message: normalized.message,
    details: context.details
  });

  if (context.status < 500) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("api.route", context.route);
    scope.setTag("api.status", String(context.status));
    scope.setTag("request_id", context.requestId);
    scope.setContext("api", {
      requestId: context.requestId,
      route: context.route,
      status: context.status,
      ...context.details
    });

    Sentry.captureException(normalized);
  });
}
