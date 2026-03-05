/**
 * Generic status buckets used by recommendation comparisons.
 */
export type CountStatus = "LOW" | "OK" | "HIGH";

/**
 * Returns LOW below lowMin, HIGH above okMax, otherwise OK.
 */
export function getStatus(value: number, lowMin: number, okMax: number): CountStatus {
  if (value < lowMin) {
    return "LOW";
  }

  if (value > okMax) {
    return "HIGH";
  }

  return "OK";
}
