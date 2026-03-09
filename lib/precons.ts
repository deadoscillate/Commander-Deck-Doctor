import fs from "node:fs/promises";
import path from "node:path";
import type { PreconDeck, PreconLibraryFile, PreconSummary } from "./preconTypes";

const PRECONS_PATH = path.join(process.cwd(), "data", "precons", "commander-precons.json");

let cachedLibrary: PreconLibraryFile | null = null;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function loadLibraryFromDisk(): Promise<PreconLibraryFile> {
  const raw = await fs.readFile(PRECONS_PATH, "utf8");
  const parsed = JSON.parse(raw) as PreconLibraryFile;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.data)) {
    throw new Error("Invalid precon library file.");
  }

  return parsed;
}

export async function getPreconLibrary(): Promise<PreconLibraryFile> {
  if (cachedLibrary) {
    return cachedLibrary;
  }

  cachedLibrary = await loadLibraryFromDisk();
  return cachedLibrary;
}

export function clearPreconLibraryCache(): void {
  cachedLibrary = null;
}

export async function listPrecons(input?: {
  query?: string | null;
  limit?: number;
  commanderName?: string | null;
}): Promise<{ meta: PreconLibraryFile["meta"]; items: PreconSummary[] }> {
  const library = await getPreconLibrary();
  const query = normalizeSearchText(input?.query ?? "");
  const commanderName = normalizeSearchText(input?.commanderName ?? "");
  const limit = Math.max(1, Math.min(200, Math.floor(input?.limit ?? 24)));

  const items = library.data
    .filter((deck) => {
      if (commanderName) {
        const commanderPool = [...deck.commanderNames, ...deck.displayCommanderNames].map(normalizeSearchText);
        if (!commanderPool.includes(commanderName)) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      const haystack = normalizeSearchText(
        [
          deck.name,
          deck.code,
          ...deck.commanderNames,
          ...deck.displayCommanderNames
        ].join(" ")
      );
      return haystack.includes(query);
    })
    .sort((left, right) => {
      const byRelease = right.releaseDate.localeCompare(left.releaseDate);
      return byRelease !== 0 ? byRelease : left.name.localeCompare(right.name);
    })
    .slice(0, limit)
    .map((deck) => {
      const { decklist, ...summary } = deck;
      void decklist;
      return summary;
    });

  return {
    meta: library.meta,
    items
  };
}

export async function getPreconBySlug(slug: string): Promise<PreconDeck | null> {
  const library = await getPreconLibrary();
  return library.data.find((deck) => deck.slug === slug) ?? null;
}
