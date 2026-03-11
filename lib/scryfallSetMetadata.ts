import fs from "node:fs";
import path from "node:path";

export type ScryfallSetOption = {
  setCode: string;
  setName: string;
  releasedAt: string | null;
  releaseYear: number | null;
};

const SET_METADATA_FILE = path.resolve("data/scryfall/set-metadata.compiled.json");

let setOptionsCache: ScryfallSetOption[] | null = null;
let setNameByCodeCache: Map<string, string> | null = null;

function normalizeSetCode(setCode: string): string {
  return setCode.trim().toUpperCase();
}

function readSetMetadataFile(): ScryfallSetOption[] {
  if (!fs.existsSync(SET_METADATA_FILE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(SET_METADATA_FILE, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (row): row is { setCode?: unknown; setName?: unknown; releasedAt?: unknown; releaseYear?: unknown } =>
          Boolean(row) && typeof row === "object"
      )
      .map((row) => ({
        setCode: typeof row.setCode === "string" ? normalizeSetCode(row.setCode) : "",
        setName: typeof row.setName === "string" ? row.setName.trim() : "",
        releasedAt: typeof row.releasedAt === "string" && row.releasedAt.trim() ? row.releasedAt.trim() : null,
        releaseYear:
          typeof row.releaseYear === "number" && Number.isFinite(row.releaseYear)
            ? Math.trunc(row.releaseYear)
            : typeof row.releasedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.releasedAt)
              ? Number.parseInt(row.releasedAt.slice(0, 4), 10)
              : null
      }))
      .filter((row) => row.setCode.length > 0 && row.setName.length > 0)
      .sort((left, right) => {
        const leftYear = left.releaseYear ?? Number.MAX_SAFE_INTEGER;
        const rightYear = right.releaseYear ?? Number.MAX_SAFE_INTEGER;
        if (leftYear !== rightYear) {
          return leftYear - rightYear;
        }

        const leftDate = left.releasedAt ?? "";
        const rightDate = right.releasedAt ?? "";
        if (leftDate !== rightDate) {
          return leftDate.localeCompare(rightDate);
        }

        const nameOrder = left.setName.localeCompare(right.setName);
        if (nameOrder !== 0) {
          return nameOrder;
        }

        return left.setCode.localeCompare(right.setCode);
      });
  } catch {
    return [];
  }
}

export function listScryfallSetMetadata(): ScryfallSetOption[] {
  if (!setOptionsCache) {
    setOptionsCache = readSetMetadataFile();
  }

  return setOptionsCache;
}

export function getScryfallSetName(setCode: string | null | undefined): string | null {
  if (!setCode) {
    return null;
  }

  if (!setNameByCodeCache) {
    setNameByCodeCache = new Map(
      listScryfallSetMetadata().map((row) => [row.setCode, row.setName])
    );
  }

  return setNameByCodeCache.get(normalizeSetCode(setCode)) ?? null;
}

export function getScryfallSetOption(setCode: string | null | undefined): ScryfallSetOption | null {
  if (!setCode) {
    return null;
  }

  const normalized = normalizeSetCode(setCode);
  return listScryfallSetMetadata().find((row) => row.setCode === normalized) ?? null;
}

export function clearScryfallSetMetadataCache(): void {
  setOptionsCache = null;
  setNameByCodeCache = null;
}
