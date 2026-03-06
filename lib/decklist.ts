import { ParsedDeckEntry } from "./types";

/**
 * Decklist parser utilities for free-form Commander text exports.
 */
export type DecklistParseResult = {
  entries: ParsedDeckEntry[];
  commanderFromSection: string | null;
};

// Common section headers that should be ignored when users paste deck exports.
const COMMON_HEADINGS = new Set<string>([
  "commander",
  "commander(s)",
  "deck",
  "mainboard",
  "sideboard",
  "maybeboard",
  "creatures",
  "instants",
  "sorceries",
  "artifacts",
  "enchantments",
  "planeswalkers",
  "battles",
  "lands"
]);

function normalizeHeadingCandidate(line: string): string {
  return line
    .toLowerCase()
    .replace(/\(.*\)/g, "")
    .replace(/[:\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeSplitCard(left: string, right: string): boolean {
  const token = /^[A-Za-z0-9',\- ]+$/;
  return token.test(left) && token.test(right) && /^[A-Z]/.test(right.trim());
}

function stripComment(line: string): string {
  const hashIdx = line.indexOf("#");
  const slashIdx = line.indexOf("//");

  let cutAt = -1;

  if (hashIdx >= 0) {
    cutAt = hashIdx;
  }

  if (slashIdx >= 0) {
    const left = line.slice(0, slashIdx).trim();
    const right = line.slice(slashIdx + 2).trim();
    // Avoid stripping split cards such as "Fire // Ice".
    if (!looksLikeSplitCard(left, right)) {
      cutAt = cutAt === -1 ? slashIdx : Math.min(cutAt, slashIdx);
    }
  }

  return (cutAt === -1 ? line : line.slice(0, cutAt)).trim();
}

function isHeadingLine(line: string): boolean {
  const normalized = normalizeHeadingCandidate(line);
  if (COMMON_HEADINGS.has(normalized)) {
    return true;
  }

  return /^[a-z ]+\(\d+\)$/i.test(line.trim());
}

function isCommanderHeading(line: string): boolean {
  const normalized = normalizeHeadingCandidate(line);
  return normalized === "commander" || normalized === "commanders";
}

function parseInlineCommander(line: string): ParsedDeckEntry | null {
  const match = line.match(/^commander\s*[:\-]\s*(.+)$/i);
  if (!match) {
    return null;
  }

  return parseQuantityAndName(match[1].trim());
}

function isStandalonePrintingMarker(line: string): boolean {
  return /^\*[a-z0-9]{1,8}\*$/i.test(line.trim());
}

function isPrintingMetadataToken(token: string): boolean {
  return /^([a-z0-9]+(?:[/-][a-z0-9]+)*|\*[a-z0-9]+\*)$/i.test(token);
}

function isPrintingMetadataSuffix(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  return trimmed.split(/\s+/).every((token) => isPrintingMetadataToken(token));
}

function stripTrailingPrintingMarkers(value: string): string {
  return value.replace(/(?:\s+\*[a-z0-9]{1,8}\*)+$/gi, "").trim();
}

function extractSetCode(name: string): { cardName: string; setCode?: string } {
  const bracketMatch = name.match(/^(.*?)\s*\[([a-z0-9]{2,6})\]\s*$/i);
  if (bracketMatch) {
    const cardName = bracketMatch[1]?.trim() ?? "";
    const setCode = bracketMatch[2]?.trim().toLowerCase() ?? "";
    if (cardName && setCode) {
      return {
        cardName,
        setCode
      };
    }
  }

  const parenMatch = name.match(/^(.*?)\s+\(([a-z0-9]{2,6})\)\s*(.*)$/i);
  if (parenMatch) {
    const cardName = parenMatch[1]?.trim() ?? "";
    const setCode = parenMatch[2]?.trim().toLowerCase() ?? "";
    const metadataTail = parenMatch[3]?.trim() ?? "";
    if (cardName && setCode && isPrintingMetadataSuffix(metadataTail)) {
      return {
        cardName,
        setCode
      };
    }
  }

  return {
    cardName: name
  };
}

function normalizeParsedName(name: string): { cardName: string; setCode?: string } {
  const stripped = stripTrailingPrintingMarkers(name.trim());
  if (!stripped) {
    return {
      cardName: ""
    };
  }

  return extractSetCode(stripped);
}

function parseQuantityAndName(line: string): ParsedDeckEntry | null {
  const cleaned = line.replace(/^[-*]\s+/, "").trim();
  if (!cleaned || isHeadingLine(cleaned) || isStandalonePrintingMarker(cleaned)) {
    return null;
  }

  // Supports "1 Sol Ring" and "1 x Sol Ring".
  const qtyMatch = cleaned.match(/^(\d+)\s*x?\s+(.+)$/i);
  if (qtyMatch) {
    const qty = Number(qtyMatch[1]);
    const parsedName = normalizeParsedName(qtyMatch[2]);
    const name = parsedName.cardName;
    if (!name || Number.isNaN(qty) || qty <= 0) {
      return null;
    }

    return parsedName.setCode ? { name, qty, setCode: parsedName.setCode } : { name, qty };
  }

  // Supports compact prefixes like "1x Sol Ring".
  const compactQtyMatch = cleaned.match(/^(\d+)x\s*(.+)$/i);
  if (compactQtyMatch) {
    const qty = Number(compactQtyMatch[1]);
    const parsedName = normalizeParsedName(compactQtyMatch[2]);
    const name = parsedName.cardName;
    if (!name || Number.isNaN(qty) || qty <= 0) {
      return null;
    }

    return parsedName.setCode ? { name, qty, setCode: parsedName.setCode } : { name, qty };
  }

  const parsedName = normalizeParsedName(cleaned);
  if (!parsedName.cardName) {
    return null;
  }

  if (parsedName.setCode) {
    return {
      name: parsedName.cardName,
      qty: 1,
      setCode: parsedName.setCode
    };
  }

  return { name: parsedName.cardName, qty: 1 };
}

/**
 * Parses a free-form decklist into merged rows.
 * - ignores blank/comment/header lines
 * - defaults quantity to 1 when omitted
 * - merges duplicates case-insensitively
 */
export function parseDecklist(input: string): ParsedDeckEntry[] {
  return parseDecklistWithCommander(input).entries;
}

/**
 * Parses decklist rows and captures commander name when a Commander section exists.
 */
export function parseDecklistWithCommander(input: string): DecklistParseResult {
  const merged = new Map<string, ParsedDeckEntry>();
  let inCommanderSection = false;
  let commanderFromSection: string | null = null;

  for (const rawLine of input.split(/\r?\n/)) {
    const noComment = stripComment(rawLine);
    if (!noComment) {
      if (inCommanderSection) {
        inCommanderSection = false;
      }
      continue;
    }

    const inlineCommander = parseInlineCommander(noComment);
    if (inlineCommander) {
      if (!commanderFromSection) {
        commanderFromSection = inlineCommander.name;
      }
      const key = inlineCommander.name.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.qty += inlineCommander.qty;
        if (existing.setCode && inlineCommander.setCode && existing.setCode !== inlineCommander.setCode) {
          delete existing.setCode;
        } else if (!existing.setCode && inlineCommander.setCode) {
          existing.setCode = inlineCommander.setCode;
        }
      } else {
        merged.set(key, inlineCommander);
      }
      inCommanderSection = false;
      continue;
    }

    if (isHeadingLine(noComment)) {
      inCommanderSection = isCommanderHeading(noComment);
      continue;
    }

    const parsed = parseQuantityAndName(noComment);
    if (!parsed) {
      continue;
    }

    if (inCommanderSection && !commanderFromSection) {
      commanderFromSection = parsed.name;
    }

    const key = parsed.name.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.qty += parsed.qty;
      if (existing.setCode && parsed.setCode && existing.setCode !== parsed.setCode) {
        delete existing.setCode;
      } else if (!existing.setCode && parsed.setCode) {
        existing.setCode = parsed.setCode;
      }
      continue;
    }

    merged.set(key, parsed);
  }

  return {
    entries: [...merged.values()],
    commanderFromSection
  };
}
