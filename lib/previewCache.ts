export type CardPreviewPrices = {
  usd: string | null;
  usdFoil: string | null;
  usdEtched: string | null;
  tix: string | null;
};

export type CardPreviewData = {
  name: string;
  scryfallId: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  releasedAt: string | null;
  imageUrl: string | null;
  manaCost: string | null;
  typeLine: string | null;
  prices: CardPreviewPrices | null;
};

const previewCache = new Map<string, CardPreviewData | null>();
const inflightPreviewRequests = new Map<string, Promise<CardPreviewData | null>>();

export function normalizePreviewName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeKeyPart(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.trim().toLowerCase();
}

export function buildPreviewKey(
  name: string,
  options?: { setCode?: string | null; collectorNumber?: string | null; printingId?: string | null }
): string {
  const normalizedName = normalizePreviewName(name);
  const setCode = normalizeKeyPart(options?.setCode);
  const collectorNumber = normalizeKeyPart(options?.collectorNumber);
  const printingId = normalizeKeyPart(options?.printingId);
  return `${normalizedName}|set:${setCode}|cn:${collectorNumber}|id:${printingId}`;
}

export function getCachedPreview(
  name: string,
  options?: { setCode?: string | null; collectorNumber?: string | null; printingId?: string | null }
): CardPreviewData | null | undefined {
  return previewCache.get(buildPreviewKey(name, options));
}

export function setCachedPreview(
  name: string,
  preview: CardPreviewData | null,
  options?: { setCode?: string | null; collectorNumber?: string | null; printingId?: string | null }
): void {
  previewCache.set(buildPreviewKey(name, options), preview);
}

export function getInflightPreview(
  name: string,
  options?: { setCode?: string | null; collectorNumber?: string | null; printingId?: string | null }
): Promise<CardPreviewData | null> | undefined {
  return inflightPreviewRequests.get(buildPreviewKey(name, options));
}

export function setInflightPreview(
  name: string,
  request: Promise<CardPreviewData | null>,
  options?: { setCode?: string | null; collectorNumber?: string | null; printingId?: string | null }
): void {
  inflightPreviewRequests.set(buildPreviewKey(name, options), request);
}

export function clearInflightPreview(
  name: string,
  options?: { setCode?: string | null; collectorNumber?: string | null; printingId?: string | null }
): void {
  inflightPreviewRequests.delete(buildPreviewKey(name, options));
}
