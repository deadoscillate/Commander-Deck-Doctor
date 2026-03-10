import { apiJson, getRequestId } from "@/lib/api/http";
import { decorateSellerUrl, type SellerName } from "@/lib/commerce/sellerLinks";

export const runtime = "nodejs";

function parseSeller(value: string | null): SellerName | null {
  return value === "tcgplayer" || value === "cardkingdom" ? value : null;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const url = new URL(request.url);
  const seller = parseSeller(url.searchParams.get("seller"));
  const target = url.searchParams.get("target");

  if (!seller || !target) {
    return apiJson(
      { error: "Seller and target are required." },
      { status: 400, requestId }
    );
  }

  const destination = decorateSellerUrl(seller, target);
  if (!destination) {
    return apiJson(
      { error: "Invalid outbound target." },
      { status: 400, requestId }
    );
  }

  return Response.redirect(destination, 307);
}
