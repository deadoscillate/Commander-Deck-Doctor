"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisReport } from "@/components/AnalysisReport";
import { ExportButtons } from "@/components/ExportButtons";
import { PreconLibrary } from "@/components/PreconLibrary";
import type { AnalyzeResponse, CommanderChoice, DeckPriceMode } from "@/lib/contracts";
import { parseDecklist, parseDecklistWithCommander } from "@/lib/decklist";
import type { PreconDeck } from "@/lib/preconTypes";
import { SAMPLE_DECKLIST, SAMPLE_DECK_NAME } from "@/lib/sampleDeck";
const SAVED_DECKS_STORAGE_KEY = "commanderDeckDoctor.savedDecks.v1";
const MAX_SAVED_DECKS = 30;

type ImportUrlResponse = {
  provider: "archidekt";
  providerDeckId: string;
  deckName: string | null;
  decklist: string;
  cardCount: number;
  commanderCount: number;
};

type SavedDeck = {
  id: string;
  name: string;
  decklist: string;
  deckPriceMode: DeckPriceMode;
  printingOverrides: Record<string, DeckPrintingOverride>;
  targetBracket: string;
  expectedWinTurn: string;
  commanderName: string;
  userCedhFlag: boolean;
  userHighPowerNoGCFlag: boolean;
  updatedAt: string;
};

type DeckPrintingOption = {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string | null;
  imageUrl: string | null;
  label: string;
};

type DeckPrintingOverride = {
  setCode: string;
  printingId: string;
  label: string;
};

type ActivePrintingPicker = {
  cardKey: string;
  cardName: string;
};

type CardPrintingsResponse = {
  name: string;
  count: number;
  printings: DeckPrintingOption[];
};

type CommanderOptionsResponse = {
  commanderFromSection: string | null;
  options: CommanderChoice[];
  suggestedCommanderName: string | null;
};

function parseSavedDecks(raw: string | null): SavedDeck[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item, index) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const candidate = item as Partial<SavedDeck>;
        const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
        const decklist = typeof candidate.decklist === "string" ? candidate.decklist : "";
        if (!name || !decklist.trim()) {
          return null;
        }

        const fallbackId = `saved-${index}-${name.toLowerCase().replace(/\s+/g, "-")}`;
        return {
          id: typeof candidate.id === "string" && candidate.id ? candidate.id : fallbackId,
          name,
          decklist,
          deckPriceMode: candidate.deckPriceMode === "decklist-set" ? "decklist-set" : "oracle-default",
          printingOverrides: parsePrintingOverrides(candidate.printingOverrides),
          targetBracket: typeof candidate.targetBracket === "string" ? candidate.targetBracket : "",
          expectedWinTurn: typeof candidate.expectedWinTurn === "string" ? candidate.expectedWinTurn : "",
          commanderName: typeof candidate.commanderName === "string" ? candidate.commanderName : "",
          userCedhFlag: Boolean(candidate.userCedhFlag),
          userHighPowerNoGCFlag: Boolean(candidate.userHighPowerNoGCFlag),
          updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString()
        } satisfies SavedDeck;
      })
      .filter((item): item is SavedDeck => Boolean(item))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_SAVED_DECKS);
  } catch {
    return [];
  }
}

function createSavedDeckId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `saved-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function importProviderForUrl(value: string): "archidekt" | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "archidekt.com" || host === "www.archidekt.com") {
      return "archidekt";
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeImportError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("unsupported")) {
    return "Unsupported URL. Use an Archidekt deck link.";
  }

  if (lower.includes("deck not found") || lower.includes("public") || lower.includes("provider")) {
    return "Could not import deck. Check the link is public and try again.";
  }

  return "Could not import deck. Check the link is public and try again.";
}

function normalizeCardKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitCommanderSelection(value: string | null | undefined): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .split(/\s+\+\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function joinCommanderSelection(
  primary: string | null | undefined,
  secondary?: string | null
): string | null {
  const names = [primary, secondary]
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter(Boolean);

  return names.length > 0 ? names.join(" + ") : null;
}

function labelCommanderPairType(
  pairType: NonNullable<CommanderChoice["pairOptions"]>[number]["pairType"]
): string {
  switch (pairType) {
    case "partner":
      return "Partner";
    case "partner-with":
      return "Partner With";
    case "friends-forever":
      return "Friends Forever";
    case "doctor-companion":
      return "Doctor's Companion";
    case "background":
      return "Background";
    default:
      return "Paired";
  }
}

function parsePrintingOverrides(raw: unknown): Record<string, DeckPrintingOverride> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const record = raw as Record<string, unknown>;
  const parsed: Record<string, DeckPrintingOverride> = {};
  for (const [cardKey, value] of Object.entries(record)) {
    const normalizedCardKey = normalizeCardKey(cardKey);
    if (!normalizedCardKey) {
      continue;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const row = value as Record<string, unknown>;
    const setCode =
      typeof row.setCode === "string" && row.setCode.trim()
        ? row.setCode.trim().toLowerCase()
        : "";
    const printingId =
      typeof row.printingId === "string" && row.printingId.trim()
        ? row.printingId.trim()
        : "";
    const label =
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim()
        : "";
    if (!setCode || !printingId || !label) {
      continue;
    }

    parsed[normalizedCardKey] = {
      setCode,
      printingId,
      label
    };
  }

  return parsed;
}

function toSetOverrides(
  overrides: Record<string, DeckPrintingOverride>
): Record<string, { setCode: string; printingId: string }> {
  const mapped: Record<string, { setCode: string; printingId: string }> = {};
  for (const [cardKey, override] of Object.entries(overrides)) {
    if (!override.setCode || !override.printingId) {
      continue;
    }

    mapped[cardKey] = {
      setCode: override.setCode,
      printingId: override.printingId
    };
  }

  return mapped;
}

export default function Page() {
  const [deckUrl, setDeckUrl] = useState("");
  const [deckName, setDeckName] = useState("");
  const [decklist, setDecklist] = useState("");
  const [deckPriceMode, setDeckPriceMode] = useState<DeckPriceMode>("oracle-default");
  const [printingOverrides, setPrintingOverrides] = useState<Record<string, DeckPrintingOverride>>({});
  const [printingOptionsByCard, setPrintingOptionsByCard] = useState<Record<string, DeckPrintingOption[]>>({});
  const [printingLoadByCard, setPrintingLoadByCard] = useState<Record<string, boolean>>({});
  const [printingErrorByCard, setPrintingErrorByCard] = useState<Record<string, string>>({});
  const [activePrintingPicker, setActivePrintingPicker] = useState<ActivePrintingPicker | null>(null);
  const [targetBracket, setTargetBracket] = useState("");
  const [expectedWinTurn, setExpectedWinTurn] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [commanderPartnerName, setCommanderPartnerName] = useState("");
  const [userCedhFlag, setUserCedhFlag] = useState(false);
  const [userHighPowerNoGCFlag, setUserHighPowerNoGCFlag] = useState(false);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [saveError, setSaveError] = useState("");
  const [saveInfo, setSaveInfo] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importInfo, setImportInfo] = useState("");
  const [commanderOptions, setCommanderOptions] = useState<CommanderChoice[]>([]);
  const [commanderOptionsLoading, setCommanderOptionsLoading] = useState(false);
  const [commanderOptionsError, setCommanderOptionsError] = useState("");
  const printingModalRef = useRef<HTMLDivElement | null>(null);
  const printingCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const parsedDeckInput = useMemo(() => parseDecklistWithCommander(decklist), [decklist]);
  const parsedDeckEntries = parsedDeckInput.entries;
  const commanderFromDecklist = joinCommanderSelection(
    parsedDeckInput.commandersFromSection[0] ?? parsedDeckInput.commanderFromSection,
    parsedDeckInput.commandersFromSection[1] ?? null
  );
  const selectedCommanderName = commanderName.trim();
  const selectedCommanderOption = useMemo(
    () =>
      commanderOptions.find(
        (option) => normalizeCardKey(option.name) === normalizeCardKey(selectedCommanderName)
      ) ?? null,
    [commanderOptions, selectedCommanderName]
  );
  const selectedCommanderPairOptions = useMemo(
    () => selectedCommanderOption?.pairOptions ?? [],
    [selectedCommanderOption]
  );
  const selectedCommanderPartnerName = commanderPartnerName.trim();
  const effectiveCommanderName =
    commanderFromDecklist ?? joinCommanderSelection(selectedCommanderName, selectedCommanderPartnerName);
  const commanderSelectionRequired = !commanderFromDecklist && parsedDeckEntries.length > 0;
  const canAnalyze =
    Boolean(decklist.trim()) &&
    (!commanderSelectionRequired || Boolean(selectedCommanderName)) &&
    !commanderOptionsLoading &&
    !loading;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSavedDecks(parseSavedDecks(window.localStorage.getItem(SAVED_DECKS_STORAGE_KEY)));
  }, []);

  function persistSavedDecks(next: SavedDeck[]) {
    setSavedDecks(next);

    try {
      window.localStorage.setItem(SAVED_DECKS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setSaveError("Could not persist saved decks in this browser.");
    }
  }

  function onSaveDeck() {
    const trimmedName = deckName.trim();
    if (!trimmedName) {
      setSaveInfo("");
      setSaveError("Enter a deck name before saving.");
      return;
    }

    const trimmedDecklist = decklist.trim();
    if (!trimmedDecklist) {
      setSaveInfo("");
      setSaveError("Decklist is required before saving.");
      return;
    }

    const existing = savedDecks.find(
      (saved) => saved.name.toLowerCase() === trimmedName.toLowerCase()
    );
    const now = new Date().toISOString();

    const nextEntry: SavedDeck = {
      id: existing?.id ?? createSavedDeckId(),
      name: trimmedName,
      decklist: trimmedDecklist,
      deckPriceMode,
      printingOverrides,
      targetBracket,
      expectedWinTurn,
      commanderName: effectiveCommanderName ?? "",
      userCedhFlag,
      userHighPowerNoGCFlag,
      updatedAt: now
    };

    const next = [nextEntry, ...savedDecks.filter((saved) => saved.id !== nextEntry.id)].slice(
      0,
      MAX_SAVED_DECKS
    );

    persistSavedDecks(next);
    setSaveError("");
    setSaveInfo(
      existing ? `Updated "${trimmedName}" in Saved Decks.` : `Saved "${trimmedName}" locally.`
    );
  }

  function onLoadSavedDeck(saved: SavedDeck) {
    setDeckName(saved.name);
    setDecklist(saved.decklist);
    setDeckPriceMode(saved.deckPriceMode);
    setPrintingOverrides(saved.printingOverrides);
    setPrintingOptionsByCard({});
    setPrintingLoadByCard({});
    setPrintingErrorByCard({});
    setActivePrintingPicker(null);
    setTargetBracket(saved.targetBracket);
    setExpectedWinTurn(saved.expectedWinTurn);
    const savedCommanderSelection = splitCommanderSelection(saved.commanderName);
    setCommanderName(savedCommanderSelection[0] ?? "");
    setCommanderPartnerName(savedCommanderSelection[1] ?? "");
    setUserCedhFlag(saved.userCedhFlag);
    setUserHighPowerNoGCFlag(saved.userHighPowerNoGCFlag);
    setResult(null);
    setError("");
    setImportError("");
    setImportInfo("");
    setSaveError("");
    setSaveInfo(`Loaded "${saved.name}".`);

    const next = [
      { ...saved, updatedAt: new Date().toISOString() },
      ...savedDecks.filter((item) => item.id !== saved.id)
    ].slice(0, MAX_SAVED_DECKS);

    persistSavedDecks(next);
  }

  function onRemoveSavedDeck(id: string) {
    const next = savedDecks.filter((saved) => saved.id !== id);
    persistSavedDecks(next);
    setSaveError("");
    setSaveInfo("Removed saved deck.");
  }

  async function onImportUrl() {
    const trimmed = deckUrl.trim();
    if (!trimmed) {
      setImportError("Enter a deck URL first.");
      return;
    }

    if (!importProviderForUrl(trimmed)) {
      setImportError("Unsupported URL. Use an Archidekt deck link.");
      setImportInfo("");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportInfo("");

    try {
      const response = await fetch("/api/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed })
      });

      const data = (await response.json()) as ImportUrlResponse | { error: string };
      if (!response.ok) {
        setImportError(normalizeImportError("error" in data ? data.error : "Import failed."));
        return;
      }

      const imported = data as ImportUrlResponse;
      setDecklist(imported.decklist);
      setDeckPriceMode("decklist-set");
      if (imported.deckName) {
        setDeckName(imported.deckName);
      }
      setPrintingOverrides({});
      setPrintingOptionsByCard({});
      setPrintingLoadByCard({});
      setPrintingErrorByCard({});
      setActivePrintingPicker(null);
      const importedCommanderDeck = parseDecklistWithCommander(imported.decklist);
      const importedCommander = joinCommanderSelection(
        importedCommanderDeck.commandersFromSection[0] ?? importedCommanderDeck.commanderFromSection,
        importedCommanderDeck.commandersFromSection[1] ?? null
      );
      const importedCommanderSelection = splitCommanderSelection(importedCommander);
      setCommanderName(importedCommanderSelection[0] ?? "");
      setCommanderPartnerName(importedCommanderSelection[1] ?? "");
      setResult(null);
      setImportInfo(
        `Imported: ${imported.deckName ?? "Archidekt deck"} ${importedCommander ? `(Commander: ${importedCommander})` : ""}`.trim()
      );
    } catch {
      setImportError("Could not import deck. Check the link is public and try again.");
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    if (!result) {
      return;
    }

    if (
      (result.commander.source === "section" || result.commander.source === "auto") &&
      result.commander.selectedName
    ) {
      const nextCommanderSelection =
        result.commander.selectedNames && result.commander.selectedNames.length > 0
          ? result.commander.selectedNames
          : splitCommanderSelection(result.commander.selectedName);
      setCommanderName(nextCommanderSelection[0] ?? "");
      setCommanderPartnerName(nextCommanderSelection[1] ?? "");
    }
  }, [result]);

  useEffect(() => {
    if (commanderFromDecklist) {
      setCommanderOptions([]);
      setCommanderOptionsLoading(false);
      setCommanderOptionsError("");
      const decklistCommanderSelection = splitCommanderSelection(commanderFromDecklist);
      setCommanderName(decklistCommanderSelection[0] ?? "");
      setCommanderPartnerName(decklistCommanderSelection[1] ?? "");
      return;
    }

    if (parsedDeckEntries.length === 0) {
      setCommanderOptions([]);
      setCommanderOptionsLoading(false);
      setCommanderOptionsError("");
      setCommanderName("");
      setCommanderPartnerName("");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setCommanderOptionsLoading(true);
      setCommanderOptionsError("");

      try {
        const response = await fetch("/api/commander-options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decklist,
            deckPriceMode,
            setOverrides: toSetOverrides(printingOverrides)
          })
        });

        const payload = (await response.json()) as CommanderOptionsResponse | { error: string };
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setCommanderOptions([]);
          setCommanderOptionsError(
            "error" in payload && payload.error ? payload.error : "Could not load commander candidates."
          );
          return;
        }

        const data = payload as CommanderOptionsResponse;
        setCommanderOptions(data.options ?? []);
        const validCommanderKeys = new Set(
          (data.options ?? []).map((option) => normalizeCardKey(option.name))
        );
        setCommanderName((previous) => {
          if (previous && validCommanderKeys.has(normalizeCardKey(previous))) {
            return previous;
          }

          if (data.suggestedCommanderName) {
            return data.suggestedCommanderName;
          }

          return "";
        });
        setCommanderPartnerName("");
      } catch {
        if (cancelled) {
          return;
        }

        setCommanderOptions([]);
        setCommanderOptionsError("Could not load commander candidates.");
      } finally {
        if (!cancelled) {
          setCommanderOptionsLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [commanderFromDecklist, deckPriceMode, decklist, parsedDeckEntries.length, printingOverrides]);

  useEffect(() => {
    if (commanderFromDecklist) {
      return;
    }

    const availableCommanderKeys = new Set(
      commanderOptions.map((option) => normalizeCardKey(option.name))
    );
    setCommanderName((previous) => {
      if (!previous) {
        return previous;
      }

      return availableCommanderKeys.has(normalizeCardKey(previous)) ? previous : "";
    });
  }, [commanderFromDecklist, commanderOptions]);

  useEffect(() => {
    if (commanderFromDecklist) {
      return;
    }

    const validPairKeys = new Set(
      selectedCommanderPairOptions.map((option) => normalizeCardKey(option.name))
    );
    setCommanderPartnerName((previous) => {
      if (!previous) {
        return "";
      }

      return validPairKeys.has(normalizeCardKey(previous)) ? previous : "";
    });
  }, [commanderFromDecklist, selectedCommanderPairOptions]);

  const tuningSummary = targetBracket && expectedWinTurn
    ? `Target: Bracket ${targetBracket} | Win/Lock: ${expectedWinTurn}`
    : null;
  const activePrintingCardKey = activePrintingPicker?.cardKey ?? "";
  const activePrintingCardName = activePrintingPicker?.cardName ?? "";
  const activePrintingOptions = activePrintingCardKey ? (printingOptionsByCard[activePrintingCardKey] ?? []) : [];
  const activePrintingLoading = activePrintingCardKey ? Boolean(printingLoadByCard[activePrintingCardKey]) : false;
  const activePrintingError = activePrintingCardKey ? (printingErrorByCard[activePrintingCardKey] ?? "") : "";
  const activePrintingOverride = activePrintingCardKey ? printingOverrides[activePrintingCardKey] : undefined;

  useEffect(() => {
    const deckCardKeys = new Set(parseDecklist(decklist).map((entry) => normalizeCardKey(entry.name)));
    setPrintingOverrides((previous) => {
      const filtered = Object.fromEntries(
        Object.entries(previous).filter(([cardKey]) => deckCardKeys.has(cardKey))
      );
      if (Object.keys(filtered).length === Object.keys(previous).length) {
        return previous;
      }

      return filtered;
    });

    setActivePrintingPicker((previous) => {
      if (!previous) {
        return null;
      }

      return deckCardKeys.has(previous.cardKey) ? previous : null;
    });
  }, [decklist]);

  async function ensurePrintingsLoaded(cardName: string) {
    const cardKey = normalizeCardKey(cardName);
    if (printingOptionsByCard[cardKey] || printingLoadByCard[cardKey]) {
      return;
    }

    setPrintingLoadByCard((previous) => ({ ...previous, [cardKey]: true }));
    setPrintingErrorByCard((previous) => ({ ...previous, [cardKey]: "" }));
    try {
      const response = await fetch(`/api/card-printings?name=${encodeURIComponent(cardName)}`, {
        method: "GET",
        cache: "no-store"
      });
      const payload = (await response.json()) as CardPrintingsResponse | { error: string };
      if (!response.ok) {
        const message = "error" in payload && payload.error ? payload.error : "Could not load printings.";
        setPrintingErrorByCard((previous) => ({ ...previous, [cardKey]: message }));
        return;
      }

      const data = payload as CardPrintingsResponse;
      setPrintingOptionsByCard((previous) => ({ ...previous, [cardKey]: data.printings ?? [] }));
    } catch {
      setPrintingErrorByCard((previous) => ({ ...previous, [cardKey]: "Could not load printings." }));
    } finally {
      setPrintingLoadByCard((previous) => ({ ...previous, [cardKey]: false }));
    }
  }

  function openPrintingPicker(cardName: string) {
    const cardKey = normalizeCardKey(cardName);
    setActivePrintingPicker({ cardKey, cardName });
    void ensurePrintingsLoaded(cardName);
  }

  useEffect(() => {
    if (!activePrintingPicker || typeof document === "undefined") {
      return;
    }

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusModal = window.setTimeout(() => {
      const modal = printingModalRef.current;
      if (!modal) {
        return;
      }

      const firstFocusable = modal.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable ?? printingCloseButtonRef.current ?? modal).focus();
    }, 0);

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setActivePrintingPicker(null);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const modal = printingModalRef.current;
      if (!modal) {
        return;
      }

      const focusableElements = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex >= 0
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!activeElement || !modal.contains(activeElement) || activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (!activeElement || !modal.contains(activeElement) || activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", onDocumentKeyDown);

    return () => {
      window.clearTimeout(focusModal);
      document.removeEventListener("keydown", onDocumentKeyDown);
      previousActiveElement?.focus();
    };
  }, [activePrintingPicker]);

  function onSelectPrinting(cardName: string, printingId: string) {
    const cardKey = normalizeCardKey(cardName);
    if (!printingId) {
      if (!printingOverrides[cardKey]) {
        return;
      }

      const nextOverrides = { ...printingOverrides };
      delete nextOverrides[cardKey];
      setPrintingOverrides(nextOverrides);
      if (result && !loading) {
        void runAnalysis({ printingOverrides: nextOverrides });
      }
      return;
    }

    const options = printingOptionsByCard[cardKey] ?? [];
    const selected = options.find((option) => option.id === printingId);
    if (!selected) {
      return;
    }

    const nextOverrides = {
      ...printingOverrides,
      [cardKey]: {
        setCode: selected.setCode,
        printingId: selected.id,
        label: selected.label
      }
    };
    setPrintingOverrides(nextOverrides);
    if (deckPriceMode !== "decklist-set") {
      setDeckPriceMode("decklist-set");
    }
    if (result && !loading) {
      void runAnalysis({ printingOverrides: nextOverrides, deckPriceMode: "decklist-set" });
    }
  }

  async function runAnalysis(overrides?: {
    decklist?: string;
    commanderName?: string | null;
    deckPriceMode?: DeckPriceMode;
    printingOverrides?: Record<string, DeckPrintingOverride>;
  }) {
    setLoading(true);
    setError("");

    try {
      const decklistForRequest = overrides?.decklist ?? decklist;
      const commanderForRequest =
        typeof overrides?.commanderName === "string"
          ? overrides.commanderName
          : effectiveCommanderName || null;
      const pricingModeForRequest = overrides?.deckPriceMode ?? deckPriceMode;
      const printingOverridesForRequest = overrides?.printingOverrides ?? printingOverrides;
      const setOverrides = toSetOverrides(printingOverridesForRequest);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decklist: decklistForRequest,
          deckPriceMode: pricingModeForRequest,
          setOverrides,
          targetBracket: targetBracket ? Number(targetBracket) : null,
          expectedWinTurn: expectedWinTurn || null,
          commanderName: commanderForRequest,
          userCedhFlag,
          userHighPowerNoGCFlag
        })
      });

      const data = (await response.json()) as AnalyzeResponse | { error: string };
      if (!response.ok) {
        setResult(null);
        setError("error" in data ? data.error : "Analysis failed.");
        return;
      }

      setResult(data as AnalyzeResponse);
    } catch {
      setError("Request failed. Check network/API availability.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!canAnalyze) {
      if (commanderSelectionRequired && !selectedCommanderName) {
        setError("Select a commander before analysis.");
      }
      return;
    }

    await runAnalysis();
  }

  async function onTrySampleDeck() {
    const sampleDeck = parseDecklistWithCommander(SAMPLE_DECKLIST);
    const sampleCommander =
      joinCommanderSelection(
        sampleDeck.commandersFromSection[0] ?? sampleDeck.commanderFromSection,
        sampleDeck.commandersFromSection[1] ?? null
      ) ?? "";
    const sampleCommanderSelection = splitCommanderSelection(sampleCommander);
    setDeckName(SAMPLE_DECK_NAME);
    setDecklist(SAMPLE_DECKLIST);
    setPrintingOverrides({});
    setPrintingOptionsByCard({});
    setPrintingLoadByCard({});
    setPrintingErrorByCard({});
    setActivePrintingPicker(null);
    setCommanderName(sampleCommanderSelection[0] ?? "");
    setCommanderPartnerName(sampleCommanderSelection[1] ?? "");
    setImportError("");
    setImportInfo("Loaded sample deck. Running analysis...");
    await runAnalysis({ decklist: SAMPLE_DECKLIST, commanderName: sampleCommander || null });
  }

  async function onLoadPrecon(precon: PreconDeck) {
    const preconDeck = parseDecklistWithCommander(precon.decklist);
    const preconCommander =
      joinCommanderSelection(
        preconDeck.commandersFromSection[0] ??
          preconDeck.commanderFromSection ??
          precon.commanderNames[0] ??
          "",
        preconDeck.commandersFromSection[1] ?? null
      ) ?? "";
    const preconCommanderSelection = splitCommanderSelection(preconCommander);
    setDeckName(precon.name);
    setDecklist(precon.decklist);
    setDeckPriceMode("decklist-set");
    setPrintingOverrides({});
    setPrintingOptionsByCard({});
    setPrintingLoadByCard({});
    setPrintingErrorByCard({});
    setActivePrintingPicker(null);
    setTargetBracket("");
    setExpectedWinTurn("");
    setCommanderName(preconCommanderSelection[0] ?? "");
    setCommanderPartnerName(preconCommanderSelection[1] ?? "");
    setUserCedhFlag(false);
    setUserHighPowerNoGCFlag(false);
    setResult(null);
    setError("");
    setImportError("");
    setImportInfo(`Loaded precon: ${precon.name}. Running analysis...`);
    setSaveError("");
    setSaveInfo("");
    await runAnalysis({
      decklist: precon.decklist,
      commanderName: preconCommander || null,
      deckPriceMode: "decklist-set",
      printingOverrides: {}
    });
  }

  return (
    <main className="page">
      <div className="hero">
        <h1>Commander Deck Doctor</h1>
        <p>
          Paste a decklist and get summary stats, role coverage, commander validation checks, deck health, and
          Commander Bracket guidance.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn-secondary" onClick={() => void onTrySampleDeck()}>
            Try a sample deck
          </button>
        </div>
      </div>

      <section className="panel-grid">
        <form className="panel form-panel" onSubmit={onSubmit}>
          <label htmlFor="deck-url">Deck URL (Archidekt)</label>
          <p className="muted field-help">Supports public Archidekt deck links.</p>
          <div className="url-import-row">
            <input
              id="deck-url"
              type="url"
              value={deckUrl}
              onChange={(event) => setDeckUrl(event.target.value)}
              placeholder="https://archidekt.com/decks/..."
            />
            <button type="button" className="btn-secondary" onClick={onImportUrl} disabled={importing}>
              {importing ? "Importing..." : "Import URL"}
            </button>
          </div>
          {importError ? <p className="error">{importError}</p> : null}
          {importInfo ? <p className="import-toast">{importInfo}</p> : null}

          <label htmlFor="deck-name">Deck Name</label>
          <div className="save-row">
            <input
              id="deck-name"
              type="text"
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
              placeholder="Atraxa Infect"
            />
            <button type="button" className="btn-tertiary" onClick={onSaveDeck}>
              Save Deck Locally
            </button>
          </div>
          {saveError ? <p className="error">{saveError}</p> : null}
          {saveInfo ? <p className="muted">{saveInfo}</p> : null}

          <section className="saved-decks-panel">
            <h2>Saved Decks</h2>
            {savedDecks.length === 0 ? (
              <p className="muted">
                No saved decks yet. Analyze a deck, then click &quot;Save Deck Locally&quot;.{" "}
                <button type="button" className="inline-action" onClick={() => void onTrySampleDeck()}>
                  Try sample deck
                </button>
              </p>
            ) : (
              <ul className="saved-decks-list">
                {savedDecks.map((saved) => (
                  <li key={saved.id} className="saved-decks-item">
                    <button
                      type="button"
                      className="saved-deck-load"
                      onClick={() => onLoadSavedDeck(saved)}
                    >
                      {saved.name}
                    </button>
                    <button
                      type="button"
                      className="saved-deck-remove"
                      onClick={() => onRemoveSavedDeck(saved.id)}
                      aria-label={`Remove saved deck ${saved.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <PreconLibrary busy={loading || importing} onLoadPrecon={onLoadPrecon} />

          <label htmlFor="decklist">Decklist (paste here)</label>
          <p className="muted field-help">
            One card per line; quantities allowed. Optional print-aware tags: <code>1 Sol Ring [CMM]</code> or{" "}
            <code>1 Sol Ring (CMM) 217</code>.
          </p>
          <textarea
            id="decklist"
            value={decklist}
            onChange={(event) => setDecklist(event.target.value)}
            placeholder={`Example: 1 Sol Ring\nOne card per line; quantities allowed.`}
            rows={16}
            required
          />

          <section className="results-commander-picker">
            <label htmlFor="commander-name">Commander</label>
            {commanderFromDecklist ? (
              <>
                <input
                  id="commander-name"
                  type="text"
                  value={commanderFromDecklist}
                  readOnly
                  aria-readonly="true"
                />
                <p className="muted">
                  Commander detected from the decklist. Edit the pasted deck or Commander section to change it.
                </p>
              </>
            ) : (
              <>
                <select
                  id="commander-name"
                  value={selectedCommanderName}
                  disabled={loading || commanderOptionsLoading || commanderOptions.length === 0}
                  onChange={(event) => {
                    setCommanderName(event.target.value);
                    setCommanderPartnerName("");
                    setError("");
                  }}
                >
                  <option value="">Select a commander</option>
                  {commanderOptions.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
                {commanderOptionsLoading ? (
                  <p className="muted">Checking possible commanders...</p>
                ) : commanderOptions.length > 0 ? (
                  <p className="muted">
                    Add a <code>Commander:</code> section in the decklist, or pick one of the possible commanders here before analysis.
                  </p>
                ) : (
                  <p className="muted">
                    No commander candidates found. Add a <code>Commander:</code> section or include the commander in the list.
                  </p>
                )}
                {commanderOptionsError ? <p className="error-inline">{commanderOptionsError}</p> : null}
                {commanderSelectionRequired && !selectedCommanderName ? (
                  <p className="error-inline">Commander selection is required before analysis.</p>
                ) : null}
                {selectedCommanderPairOptions.length > 0 ? (
                  <>
                    <label htmlFor="commander-pair-name">Partner / Background</label>
                    <select
                      id="commander-pair-name"
                      value={selectedCommanderPartnerName}
                      disabled={loading || commanderOptionsLoading}
                      onChange={(event) => {
                        setCommanderPartnerName(event.target.value);
                        setError("");
                      }}
                    >
                      <option value="">No paired commander</option>
                      {selectedCommanderPairOptions.map((option) => (
                        <option key={option.name} value={option.name}>
                          {option.name} ({labelCommanderPairType(option.pairType)})
                        </option>
                      ))}
                    </select>
                    <p className="muted">
                      Only legal pairings for {selectedCommanderName} are shown here.
                    </p>
                  </>
                ) : null}
              </>
            )}
          </section>

          <section className="tuning-controls">
            <div className="tuning-header">
              <strong>Pricing Mode</strong>
              <span
                className="info-pill"
                title="Decklist set mode uses [SET] tags like [CMM] for print-aware lookup, then falls back to name lookup."
              >
                i
              </span>
            </div>
            <div className="row">
              <label htmlFor="deck-price-mode">Card pricing lookup</label>
              <select
                id="deck-price-mode"
                value={deckPriceMode}
                onChange={(event) =>
                  setDeckPriceMode(
                    event.target.value === "decklist-set" ? "decklist-set" : "oracle-default"
                  )
                }
              >
                <option value="oracle-default">Oracle default lookup</option>
                <option value="decklist-set">Use [SET] tags in decklist</option>
              </select>
            </div>
            <p className="muted">
              Set-aware mode examples: <code>1 Rhystic Study [JMP]</code>, <code>1 Sol Ring (CMM) 217</code>.
            </p>
          </section>

          <section className="tuning-controls">
            <div className="tuning-header">
              <strong>Tuning Targets (affects recommendations, not legality)</strong>
              <span
                className="info-pill"
                title="Bracket and expected turn tune recommendation targets. They do not enforce deck legality."
              >
                i
              </span>
            </div>
            {tuningSummary ? <p className="tuning-summary">{tuningSummary}</p> : null}

          <div className="row">
            <label htmlFor="target-bracket">I&apos;m aiming for bracket</label>
            <select
              id="target-bracket"
              value={targetBracket}
              onChange={(event) => setTargetBracket(event.target.value)}
            >
              <option value="">Not specified</option>
              <option value="1">1 - Exhibition</option>
              <option value="2">2 - Core</option>
              <option value="3">3 - Upgraded</option>
              <option value="4">4 - Optimized</option>
              <option value="5">5 - cEDH</option>
            </select>
          </div>

          <div className="row">
            <label htmlFor="expected-turn">Expected win/lock turn</label>
            <select
              id="expected-turn"
              value={expectedWinTurn}
              onChange={(event) => setExpectedWinTurn(event.target.value)}
            >
              <option value="">Not specified</option>
              <option value=">=10">&gt;=10</option>
              <option value="8-9">8-9</option>
              <option value="6-7">6-7</option>
              <option value="<=5">&lt;=5</option>
            </select>
          </div>

          <label
            className="checkbox"
            title="Use when your list is highly optimized despite low Game Changer count."
          >
            <input
              type="checkbox"
              checked={userHighPowerNoGCFlag}
              onChange={(event) => setUserHighPowerNoGCFlag(event.target.checked)}
            />
            Optimized without many Game Changers
          </label>

          <label className="checkbox" title="Use when this deck is tuned for cEDH pods / tournament pace.">
            <input
              type="checkbox"
              checked={userCedhFlag}
              onChange={(event) => setUserCedhFlag(event.target.checked)}
            />
            cEDH pod / tournament intent
          </label>
          </section>

          <button type="submit" className="btn-primary" disabled={!canAnalyze}>
            {loading ? "Analyzing..." : "Analyze Deck"}
          </button>

          {error ? <p className="error">{error}</p> : null}
        </form>

        <div className="panel results-panel">
          <ExportButtons result={result} decklist={decklist} />

          {!result ? (
            <p className="muted results-empty-hint">
              Run analysis to see summary, checks, deck health, and bracket report.
            </p>
          ) : (
            <AnalysisReport
              result={result}
              onOpenPrintingPicker={openPrintingPicker}
              onImprovementSuggestionsLoaded={(improvementSuggestions) => {
                setResult((current) => {
                  if (!current) {
                    return current;
                  }

                  return {
                    ...current,
                    improvementSuggestions
                  };
                });
              }}
            />
          )}
        </div>
      </section>

      {activePrintingPicker ? (
        <div
          className="printing-modal-backdrop"
          onClick={() => setActivePrintingPicker(null)}
        >
          <div
            ref={printingModalRef}
            className="printing-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="printing-modal-title"
            aria-describedby="printing-modal-description"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="printing-modal-head">
              <h2 id="printing-modal-title">Select Printing</h2>
              <button
                ref={printingCloseButtonRef}
                type="button"
                className="btn-tertiary"
                onClick={() => setActivePrintingPicker(null)}
              >
                Close
              </button>
            </div>
            <p>
              <strong>{activePrintingCardName}</strong>
            </p>
            <p id="printing-modal-description" className="muted">
              Selection updates card art and set-aware pricing lookup for this card.
            </p>

            {activePrintingLoading ? <p className="muted">Loading printings...</p> : null}
            {activePrintingError ? <p className="error">{activePrintingError}</p> : null}

            {!activePrintingLoading && !activePrintingError ? (
              activePrintingOptions.length > 0 ? (
                <div className="row">
                  <label htmlFor="printing-picker-select">Set / Printing</label>
                  <select
                    id="printing-picker-select"
                    value={activePrintingOverride?.printingId ?? ""}
                    onChange={(event) => {
                      onSelectPrinting(activePrintingCardName, event.target.value);
                      setActivePrintingPicker(null);
                    }}
                  >
                    <option value="">Auto/default printing</option>
                    {activePrintingOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="muted">No alternate printings found for this card.</p>
              )
            ) : null}

            {activePrintingOverride?.label ? (
              <p className="muted decklist-preview-printing-label">Current: {activePrintingOverride.label}</p>
            ) : null}

            <div className="printing-modal-actions">
              <button
                type="button"
                className="btn-tertiary"
                disabled={!activePrintingOverride}
                onClick={() => {
                  onSelectPrinting(activePrintingCardName, "");
                  setActivePrintingPicker(null);
                }}
              >
                Clear Selection
              </button>
              <button type="button" className="btn-secondary" onClick={() => setActivePrintingPicker(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
