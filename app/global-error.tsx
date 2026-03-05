"use client";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps) {
  return (
    <html lang="en">
      <body>
        <main className="page">
          <section className="panel" style={{ maxWidth: 760, margin: "3rem auto" }}>
            <h1>Application error</h1>
            <p className="muted">
              A root-level error occurred while rendering this app.
            </p>
            <p className="error-inline">{error.message}</p>
            <div className="export-actions">
              <button type="button" onClick={reset}>
                Try again
              </button>
              <button type="button" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}

