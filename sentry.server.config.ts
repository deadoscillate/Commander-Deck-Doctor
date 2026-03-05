import * as Sentry from "@sentry/nextjs";

const serverDsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn: serverDsn,
  enabled: Boolean(serverDsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.1,
  sendDefaultPii: false
});
