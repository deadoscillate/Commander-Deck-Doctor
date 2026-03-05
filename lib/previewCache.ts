export type CardPreviewPrices = {
  usd: string | null;
  usdFoil: string | null;
  usdEtched: string | null;
  tix: string | null;
};

export type CardPreviewData = {
  name: string;
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

export function getCachedPreview(name: string): CardPreviewData | null | undefined {
  return previewCache.get(normalizePreviewName(name));
}

export function setCachedPreview(name: string, preview: CardPreviewData | null): void {
  previewCache.set(normalizePreviewName(name), preview);
}

export function getInflightPreview(name: string): Promise<CardPreviewData | null> | undefined {
  return inflightPreviewRequests.get(normalizePreviewName(name));
}

export function setInflightPreview(name: string, request: Promise<CardPreviewData | null>): void {
  inflightPreviewRequests.set(normalizePreviewName(name), request);
}

export function clearInflightPreview(name: string): void {
  inflightPreviewRequests.delete(normalizePreviewName(name));
}
