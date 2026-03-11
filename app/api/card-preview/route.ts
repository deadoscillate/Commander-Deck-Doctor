import { apiJson, getRequestId } from "@/lib/api/http";
import { resolveCardPreview } from "@/lib/cardPreview.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const url = new URL(request.url);
  const cardName = url.searchParams.get("name")?.trim() ?? "";

  if (!cardName) {
    return apiJson({ error: "Card name is required." }, { status: 400, requestId });
  }

  const preview = await resolveCardPreview(cardName, {
    setCode: url.searchParams.get("set")?.trim() ?? null,
    collectorNumber: url.searchParams.get("collector")?.trim() ?? null,
    printingId: url.searchParams.get("printingId")?.trim() ?? null
  });

  return apiJson({ preview }, { requestId });
}
