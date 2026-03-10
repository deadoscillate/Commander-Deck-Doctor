import { toSafeExternalUrl } from "@/lib/security/url";

export type SellerName = "tcgplayer" | "cardkingdom";

const SELLER_AFFILIATE_QUERY_ENV_KEYS: Record<SellerName, string> = {
  tcgplayer: "TCGPLAYER_AFFILIATE_QUERY",
  cardkingdom: "CARDKINGDOM_AFFILIATE_QUERY"
};

function normalizeAffiliateQuery(raw: string | undefined): URLSearchParams | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  const params = new URLSearchParams(trimmed.startsWith("?") ? trimmed.slice(1) : trimmed);
  return [...params.keys()].length > 0 ? params : null;
}

export function decorateSellerUrl(
  seller: SellerName,
  targetUrl: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const safeTarget = toSafeExternalUrl(targetUrl);
  if (!safeTarget) {
    return null;
  }

  const url = new URL(safeTarget);
  const affiliateQuery = normalizeAffiliateQuery(env[SELLER_AFFILIATE_QUERY_ENV_KEYS[seller]]);
  if (affiliateQuery) {
    for (const [key, value] of affiliateQuery.entries()) {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    }
  }

  return url.toString();
}

export function buildSellerOutboundHref(
  seller: SellerName,
  targetUrl: string | null | undefined
): string | null {
  const safeTarget = toSafeExternalUrl(targetUrl);
  if (!safeTarget) {
    return null;
  }

  const params = new URLSearchParams({
    seller,
    target: safeTarget
  });
  return `/api/outbound?${params.toString()}`;
}
