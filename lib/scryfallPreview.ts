import {
  type CardPreviewData,
  getCachedPreview,
  getInflightPreview,
  setInflightPreview,
  clearInflightPreview,
  setCachedPreview
} from "@/lib/previewCache";

type CardPreviewRequestOptions = {
  setCode?: string | null;
  collectorNumber?: string | null;
  printingId?: string | null;
};

export async function getCardPreview(
  cardName: string,
  options?: CardPreviewRequestOptions
): Promise<CardPreviewData | null> {
  const trimmed = cardName.trim();
  if (!trimmed) {
    return null;
  }

  const lookup = {
    setCode: options?.setCode ?? null,
    collectorNumber: options?.collectorNumber ?? null,
    printingId: options?.printingId ?? null
  };
  const cached = getCachedPreview(trimmed, lookup);
  if (cached !== undefined) {
    return cached;
  }

  const inflight = getInflightPreview(trimmed, lookup);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const params = new URLSearchParams({ name: trimmed });
    if (lookup.setCode) {
      params.set("set", lookup.setCode);
    }
    if (lookup.collectorNumber) {
      params.set("collector", lookup.collectorNumber);
    }
    if (lookup.printingId) {
      params.set("printingId", lookup.printingId);
    }

    try {
      const response = await fetch(`/api/card-preview?${params.toString()}`, {
        method: "GET",
        cache: "force-cache"
      });
      if (!response.ok) {
        setCachedPreview(trimmed, null, lookup);
        return null;
      }

      const payload = (await response.json()) as { preview?: CardPreviewData | null };
      const preview = payload.preview ?? null;
      setCachedPreview(trimmed, preview, lookup);
      return preview;
    } catch {
      setCachedPreview(trimmed, null, lookup);
      return null;
    }
  })();

  setInflightPreview(trimmed, request, lookup);
  request.finally(() => clearInflightPreview(trimmed, lookup));
  return request;
}
