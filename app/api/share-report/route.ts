import { NextResponse } from "next/server";
import type { AnalyzeResponse } from "@/lib/contracts";
import { saveReport } from "@/lib/reportStore";

export const runtime = "nodejs";

type ShareReportRequest = {
  decklist?: unknown;
  analysis?: unknown;
};

function isAnalyzeResponse(value: unknown): value is AnalyzeResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AnalyzeResponse>;
  return (
    candidate.schemaVersion === "1.0" &&
    Array.isArray(candidate.parsedDeck) &&
    typeof candidate.summary === "object" &&
    typeof candidate.bracketReport === "object"
  );
}

/**
 * POST /api/share-report
 * Saves a report snapshot and returns a deterministic share URL path.
 */
export async function POST(request: Request) {
  let payload: ShareReportRequest;

  try {
    payload = (await request.json()) as ShareReportRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const decklist = typeof payload.decklist === "string" ? payload.decklist.trim() : "";
  if (!decklist) {
    return NextResponse.json({ error: "Decklist is required for sharing." }, { status: 400 });
  }

  if (!isAnalyzeResponse(payload.analysis)) {
    return NextResponse.json({ error: "Valid analysis payload is required for sharing." }, { status: 400 });
  }

  try {
    const { hash } = saveReport(decklist, payload.analysis);
    const path = `/report/${hash}`;
    const origin = new URL(request.url).origin;
    return NextResponse.json({ hash, path, url: `${origin}${path}` });
  } catch {
    return NextResponse.json({ error: "Could not save shared report." }, { status: 500 });
  }
}
