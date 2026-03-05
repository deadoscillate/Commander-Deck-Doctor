import * as Sentry from "@sentry/nextjs";

const edgeDsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn: edgeDsn,
  enabled: Boolean(edgeDsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.1,
  sendDefaultPii: false
});
