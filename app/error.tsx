"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="page">
      <section className="panel" style={{ maxWidth: 760, margin: "3rem auto" }}>
        <h1>Something went wrong</h1>
        <p className="muted">
          The page hit a runtime error. You can retry this view.
        </p>
        <p className="error-inline">{error.message}</p>
        <div className="export-actions">
          <button type="button" onClick={reset}>
            Try again
          </button>
          <button type="button" onClick={() => window.location.assign("/")}>
            Back to home
          </button>
        </div>
      </section>
    </main>
  );
}

