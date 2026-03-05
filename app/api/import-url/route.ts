import { NextResponse } from "next/server";
import { importDeckFromUrl } from "@/lib/deckUrlImport";

type ImportUrlRequest = {
  url?: string;
};

/**
 * POST /api/import-url
 * Imports deck text from supported provider URLs (Moxfield, Archidekt).
 */
export async function POST(request: Request) {
  let payload: ImportUrlRequest;

  try {
    payload = (await request.json()) as ImportUrlRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "Deck URL is required." }, { status: 400 });
  }

  try {
    const imported = await importDeckFromUrl(url);
    return NextResponse.json(imported);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deck import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
