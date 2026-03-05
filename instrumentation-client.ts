import * as Sentry from "@sentry/nextjs";

const clientDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: clientDsn,
  enabled: Boolean(clientDsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.1,
  sendDefaultPii: false
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
