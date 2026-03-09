import { ParsedDeckEntry } from "./types";

/**
 * Decklist parser utilities for free-form Commander text exports.
 */
export type DecklistParseResult = {
  entries: ParsedDeckEntry[];
  commanderFromSection: string | null;
  commandersFromSection: string[];
  companionFromSection: string | null;
  companionsFromSection: ParsedDeckEntry[];
};

// Common section headers that should be ignored when users paste deck exports.
const COMMON_HEADINGS = new Set<string>([
  "commander",
  "commander(s)",
  "companion",
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

function looksLikeCollectorHashSuffix(line: string, hashIndex: number): boolean {
  if (hashIndex < 0 || hashIndex >= line.length) {
    return false;
  }

  if (hashIndex > 0 && !/\s/.test(line[hashIndex - 1] ?? "")) {
    return false;
  }

  const suffix = line.slice(hashIndex + 1);
  return /^\s*\d+[a-z0-9]*(?:[/-][a-z0-9]+)*(?:[★☆])?(?:\s+\*[a-z0-9]{1,8}\*)?\s*$/i.test(suffix);
}

function stripComment(line: string): string {
  const hashIdx = line.indexOf("#");
  const slashIdx = line.indexOf("//");

  let cutAt = -1;

  if (hashIdx >= 0 && !looksLikeCollectorHashSuffix(line, hashIdx)) {
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

function isCompanionHeading(line: string): boolean {
  const normalized = normalizeHeadingCandidate(line);
  return normalized === "companion" || normalized === "companions";
}

function parseInlineCommander(line: string): ParsedDeckEntry | null {
  const match = line.match(/^commander\s*[:\-]\s*(.+)$/i);
  if (!match) {
    return null;
  }

  return parseQuantityAndName(match[1].trim());
}

function parseInlineCompanion(line: string): ParsedDeckEntry | null {
  const match = line.match(/^companions?\s*[:\-]\s*(.+)$/i);
  if (!match) {
    return null;
  }

  return parseQuantityAndName(match[1].trim());
}

function isStandalonePrintingMarker(line: string): boolean {
  return /^\*[a-z0-9]{1,8}\*$/i.test(line.trim());
}

function isCollectorNumberToken(token: string): boolean {
  return /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/i.test(token);
}

function normalizePrintingMetadataToken(rawToken: string): string {
  return rawToken
    .replace(/[.,;:]+$/g, "")
    .replace(/^[#]+/, "")
    .replace(/[★☆]/g, "")
    .trim();
}

function parsePrintingMetadataSuffix(value: string): { valid: boolean; collectorNumber?: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: true };
  }

  let collectorNumber: string | undefined;
  for (const rawToken of trimmed.split(/\s+/)) {
    const token = normalizePrintingMetadataToken(rawToken);
    if (!token) {
      continue;
    }

    if (isStandalonePrintingMarker(token)) {
      continue;
    }

    if (!collectorNumber && isCollectorNumberToken(token)) {
      collectorNumber = token;
      continue;
    }

    if (isCollectorNumberToken(token)) {
      continue;
    }

    return { valid: false };
  }

  return { valid: true, collectorNumber };
}

function stripTrailingPrintingMarkers(value: string): string {
  return value.replace(/(?:\s+\*[a-z0-9]{1,8}\*)+$/gi, "").trim();
}

function extractSetCode(name: string): { cardName: string; setCode?: string; collectorNumber?: string } {
  const bracketMatch = name.match(/^(.*?)\s*\[([a-z0-9]{2,6})\]\s*(.*)$/i);
  if (bracketMatch) {
    const cardName = bracketMatch[1]?.trim() ?? "";
    const setCode = bracketMatch[2]?.trim().toLowerCase() ?? "";
    const metadata = parsePrintingMetadataSuffix(bracketMatch[3] ?? "");
    if (cardName && setCode && metadata.valid) {
      return {
        cardName,
        setCode,
        collectorNumber: metadata.collectorNumber
      };
    }
  }

  const parenMatch = name.match(/^(.*?)\s+\(([a-z0-9]{2,6})\)\s*(.*)$/i);
  if (parenMatch) {
    const cardName = parenMatch[1]?.trim() ?? "";
    const setCode = parenMatch[2]?.trim().toLowerCase() ?? "";
    const metadata = parsePrintingMetadataSuffix(parenMatch[3] ?? "");
    if (cardName && setCode && metadata.valid) {
      return {
        cardName,
        setCode,
        collectorNumber: metadata.collectorNumber
      };
    }
  }

  return {
    cardName: name
  };
}

function normalizeParsedName(name: string): {
  cardName: string;
  setCode?: string;
  collectorNumber?: string;
} {
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

    return parsedName.setCode
      ? { name, qty, setCode: parsedName.setCode, collectorNumber: parsedName.collectorNumber }
      : { name, qty };
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

    return parsedName.setCode
      ? { name, qty, setCode: parsedName.setCode, collectorNumber: parsedName.collectorNumber }
      : { name, qty };
  }

  const parsedName = normalizeParsedName(cleaned);
  if (!parsedName.cardName) {
    return null;
  }

  if (parsedName.setCode) {
    return {
      name: parsedName.cardName,
      qty: 1,
      setCode: parsedName.setCode,
      collectorNumber: parsedName.collectorNumber
    };
  }

  return { name: parsedName.cardName, qty: 1 };
}

function mergeParsedEntry(existing: ParsedDeckEntry, parsed: ParsedDeckEntry): void {
  existing.qty += parsed.qty;

  if (existing.setCode && parsed.setCode && existing.setCode !== parsed.setCode) {
    delete existing.setCode;
    delete existing.collectorNumber;
    delete existing.printingId;
    return;
  }

  if (!existing.setCode && parsed.setCode) {
    existing.setCode = parsed.setCode;
  }

  if (existing.setCode && parsed.setCode && existing.setCode === parsed.setCode) {
    const sameCollector =
      existing.collectorNumber &&
      parsed.collectorNumber &&
      existing.collectorNumber.toLowerCase() === parsed.collectorNumber.toLowerCase();
    if (
      existing.collectorNumber &&
      parsed.collectorNumber &&
      !sameCollector
    ) {
      delete existing.collectorNumber;
    } else if (!existing.collectorNumber && parsed.collectorNumber) {
      existing.collectorNumber = parsed.collectorNumber;
    }
    return;
  }

  if (!existing.setCode) {
    delete existing.collectorNumber;
  }
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
  let activeSection: "commander" | "companion" | null = null;
  let commanderFromSection: string | null = null;
  const commandersFromSection: string[] = [];
  let companionFromSection: string | null = null;
  const companionsFromSection: ParsedDeckEntry[] = [];

  function addCommanderFromSection(name: string): void {
    if (!commanderFromSection) {
      commanderFromSection = name;
    }

    if (!commandersFromSection.includes(name)) {
      commandersFromSection.push(name);
    }
  }

  function addCompanionFromSection(entry: ParsedDeckEntry): void {
    if (!companionFromSection) {
      companionFromSection = entry.name;
    }

    companionsFromSection.push({ ...entry });
  }

  for (const rawLine of input.split(/\r?\n/)) {
    const noComment = stripComment(rawLine);
    if (!noComment) {
      activeSection = null;
      continue;
    }

    const inlineCommander = parseInlineCommander(noComment);
    if (inlineCommander) {
      addCommanderFromSection(inlineCommander.name);
      const key = inlineCommander.name.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        mergeParsedEntry(existing, inlineCommander);
      } else {
        merged.set(key, inlineCommander);
      }
      activeSection = null;
      continue;
    }

    const inlineCompanion = parseInlineCompanion(noComment);
    if (inlineCompanion) {
      addCompanionFromSection(inlineCompanion);
      activeSection = null;
      continue;
    }

    if (isHeadingLine(noComment)) {
      activeSection = isCommanderHeading(noComment)
        ? "commander"
        : isCompanionHeading(noComment)
          ? "companion"
          : null;
      continue;
    }

    const parsed = parseQuantityAndName(noComment);
    if (!parsed) {
      continue;
    }

    if (activeSection === "commander" && parsed.qty === 1 && commandersFromSection.length < 2) {
      addCommanderFromSection(parsed.name);
    } else if (activeSection === "commander") {
      activeSection = null;
    }

    if (activeSection === "companion") {
      addCompanionFromSection(parsed);
      if (parsed.qty !== 1 || companionsFromSection.length > 1) {
        activeSection = null;
      }
      continue;
    }

    const key = parsed.name.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      mergeParsedEntry(existing, parsed);
      continue;
    }

    merged.set(key, parsed);
  }

  return {
    entries: [...merged.values()],
    commanderFromSection,
    commandersFromSection,
    companionFromSection,
    companionsFromSection
  };
}
