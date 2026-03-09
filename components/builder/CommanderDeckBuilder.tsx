"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnalysisReport } from "@/components/AnalysisReport";
import { CardLink } from "@/components/CardLink";
import { ColorIdentityIcons } from "@/components/ColorIdentityIcons";
import { CommanderHeroHeader } from "@/components/CommanderHeroHeader";
import { ManaCost } from "@/components/ManaCost";
import type { AnalyzeResponse, CommanderChoice, RoleBreakdown } from "@/lib/contracts";
import {
  buildArchetypeLabel,
  buildBuilderDecklist,
  buildCommanderStapleSuggestionNames,
  buildManaBaseSuggestionNames,
  categorizeBuilderDeckCards,
  computePreconSimilarity,
  extractNeeds,
  totalDeckCardCount,
  type BuilderCardMeta,
  type BuilderCommanderSelection,
  type BuilderDeckCard
} from "@/lib/builder";
import type { PreconDeck } from "@/lib/preconTypes";

const BUILDER_STORAGE_KEY = "commanderDeckDoctor.builderDecks.v1";
const MAX_SAVED_BUILDS = 20;

type CardSearchRecord = {
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colorIdentity: string[];
  commanderEligible: boolean;
  isBasicLand: boolean;
  duplicateLimit: number | null;
  previewImageUrl: string | null;
  artUrl: string | null;
  pairOptions?: CommanderChoice["pairOptions"];
};

type CardSearchResponse = {
  query: string;
  count: number;
  items: CardSearchRecord[];
};

type SavedBuilderDeck = {
  id: string;
  name: string;
  commander: CardSearchRecord;
  partnerName: string | null;
  cards: BuilderDeckCard[];
  updatedAt: string;
};

type MatchingPreconSummary = {
  slug: string;
  name: string;
  releaseDate: string;
  decklist: string;
};

type SuggestionCardItem = {
  name: string;
  note?: string;
};

type SuggestionGroup = {
  key: string;
  label: string;
  description?: string;
  items: SuggestionCardItem[];
};

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseSavedBuilderDecks(raw: string | null): SavedBuilderDeck[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const record = entry as Partial<SavedBuilderDeck>;
        if (!record.commander || typeof record.commander !== "object") {
          return null;
        }

        const cards = Array.isArray(record.cards)
          ? record.cards
              .filter((card): card is BuilderDeckCard => {
                return Boolean(card) && typeof card === "object" && typeof card.name === "string" && typeof card.qty === "number";
              })
              .map((card) => ({
                name: card.name,
                qty: Math.max(1, Math.floor(card.qty))
              }))
          : [];

        return {
          id: typeof record.id === "string" && record.id ? record.id : `builder-${Date.now()}`,
          name:
            typeof record.name === "string" && record.name.trim()
              ? record.name.trim()
              : typeof (record.commander as { name?: unknown }).name === "string"
                ? `${(record.commander as { name: string }).name} Builder`
                : "Saved Build",
          commander: record.commander as CardSearchRecord,
          partnerName: typeof record.partnerName === "string" && record.partnerName ? record.partnerName : null,
          cards,
          updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString()
        } satisfies SavedBuilderDeck;
      })
      .filter((entry): entry is SavedBuilderDeck => Boolean(entry))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_SAVED_BUILDS);
  } catch {
    return [];
  }
}

function createSavedDeckId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `builder-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function addCardToDeck(current: BuilderDeckCard[], card: CardSearchRecord): BuilderDeckCard[] {
  const existing = current.find((entry) => normalizeName(entry.name) === normalizeName(card.name));
  if (existing) {
    const duplicateLimit = card.duplicateLimit;
    if (duplicateLimit !== null && Number.isFinite(duplicateLimit) && existing.qty >= duplicateLimit) {
      return current;
    }

    if (!card.isBasicLand && duplicateLimit === null) {
      return current;
    }

    return current.map((entry) =>
      normalizeName(entry.name) === normalizeName(card.name)
        ? { ...entry, qty: entry.qty + 1 }
        : entry
    );
  }

  return [...current, { name: card.name, qty: 1 }].sort((left, right) => left.name.localeCompare(right.name));
}

function updateCardQty(current: BuilderDeckCard[], cardName: string, delta: number): BuilderDeckCard[] {
  return current
    .map((entry) =>
      normalizeName(entry.name) === normalizeName(cardName)
        ? { ...entry, qty: entry.qty + delta }
        : entry
    )
    .filter((entry) => entry.qty > 0);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function isBasicLandName(name: string): boolean {
  return [
    "Plains",
    "Island",
    "Swamp",
    "Mountain",
    "Forest",
    "Wastes",
    "Snow-Covered Plains",
    "Snow-Covered Island",
    "Snow-Covered Swamp",
    "Snow-Covered Mountain",
    "Snow-Covered Forest",
    "Snow-Covered Wastes"
  ].some((basic) => normalizeName(basic) === normalizeName(name));
}

function basicCardTemplate(name: string, isBasicLand = false, duplicateLimit: number | null = null): CardSearchRecord {
  return {
    name,
    manaCost: "",
    cmc: 0,
    typeLine: "",
    oracleText: "",
    colorIdentity: [],
    commanderEligible: false,
    isBasicLand,
    duplicateLimit,
    previewImageUrl: null,
    artUrl: null
  };
}

function normalizeRoleBreakdown(result: AnalyzeResponse | null): RoleBreakdown | null {
  if (!result) {
    return null;
  }

  const empty: RoleBreakdown = {
    ramp: [],
    draw: [],
    removal: [],
    wipes: [],
    tutors: [],
    protection: [],
    finishers: []
  };

  const rawRoleBreakdown = (result as { roleBreakdown?: unknown }).roleBreakdown;
  if (!rawRoleBreakdown || typeof rawRoleBreakdown !== "object") {
    return empty;
  }

  const record = rawRoleBreakdown as Record<string, unknown>;
  for (const key of Object.keys(empty) as Array<keyof RoleBreakdown>) {
    const rows = record[key];
    if (!Array.isArray(rows)) {
      continue;
    }

    empty[key] = rows
      .filter((row): row is { name?: unknown; qty?: unknown } => Boolean(row) && typeof row === "object")
      .map((row) => ({
        name: typeof row.name === "string" ? row.name.trim() : "",
        qty: typeof row.qty === "number" && Number.isFinite(row.qty) ? Math.max(0, Math.floor(row.qty)) : 0
      }))
      .filter((row) => row.name.length > 0 && row.qty > 0);
  }

  return empty;
}

function buildSuggestionGroups(
  result: AnalyzeResponse | null,
  commanderStaples: string[],
  manaBaseSuggestions: string[]
): {
  roleGroups: SuggestionGroup[];
  comboGroups: SuggestionGroup[];
  stapleGroup: SuggestionGroup | null;
  manaBaseGroup: SuggestionGroup | null;
} {
  if (!result) {
    return {
      roleGroups: [],
      comboGroups: [],
      stapleGroup: commanderStaples.length > 0
        ? {
            key: "commander-staples",
            label: "Commander Staples",
            description: "Fast-start staples and color staples for the current commander shell.",
            items: commanderStaples.slice(0, 8).map((name) => ({ name }))
          }
        : null,
      manaBaseGroup: manaBaseSuggestions.length > 0
        ? {
            key: "mana-base",
            label: "Mana Base Suggestions",
            description: "Staple fixing lands, duals, and triomes for the current color identity.",
            items: manaBaseSuggestions.slice(0, 12).map((name) => ({ name }))
          }
        : null
    };
  }

  const roleGroups: SuggestionGroup[] = result.improvementSuggestions.items
    .filter((item) => item.direction === "ADD" && item.suggestions.length > 0)
    .map((item) => ({
      key: item.key,
      label: item.label,
      description: item.rationale ?? `Recommended range ${item.recommendedRange}.`,
      items: item.suggestions.slice(0, 6).map((name) => ({ name }))
    }));

  const comboGroups: SuggestionGroup[] = result.comboReport.potential.slice(0, 4).map((combo, index) => {
    const requires = Array.isArray(combo.requires) ? combo.requires : [];
    const missingCards = Array.isArray(combo.missingCards) ? combo.missingCards : [];

    return {
      key: `combo-${index}`,
      label: combo.comboName,
      description: `Missing ${combo.missingCount} card(s); matched ${combo.matchCount}/${combo.cards.length}.`,
      items: missingCards.slice(0, 4).map((name) => ({
        name,
        note: requires.length > 0 ? requires.join("; ") : undefined
      }))
    };
  });

  return {
    roleGroups,
    comboGroups,
    stapleGroup:
      commanderStaples.length > 0
        ? {
            key: "commander-staples",
            label: "Commander Staples",
            description: "Fast-start staples and color staples for the current commander shell.",
            items: commanderStaples.slice(0, 8).map((name) => ({ name }))
          }
        : null,
    manaBaseGroup:
      manaBaseSuggestions.length > 0
        ? {
            key: "mana-base",
            label: "Mana Base Suggestions",
            description: "Staple fixing lands, duals, and triomes for the current color identity.",
            items: manaBaseSuggestions.slice(0, 12).map((name) => ({ name }))
          }
        : null
  };
}

function toCardMetaMap(records: Record<string, CardSearchRecord>): Record<string, BuilderCardMeta> {
  return Object.fromEntries(
    Object.entries(records).map(([key, record]) => [
      key,
      {
        typeLine: record.typeLine
      }
    ])
  );
}

export function CommanderDeckBuilder() {
  const [deckName, setDeckName] = useState("");
  const [commanderQuery, setCommanderQuery] = useState("");
  const [commanderColors, setCommanderColors] = useState<string[]>([]);
  const [commanderResults, setCommanderResults] = useState<CardSearchRecord[]>([]);
  const [commanderLoading, setCommanderLoading] = useState(false);
  const [commanderError, setCommanderError] = useState("");
  const [selectedCommander, setSelectedCommander] = useState<CardSearchRecord | null>(null);
  const [selectedPartnerName, setSelectedPartnerName] = useState("");
  const [deckCards, setDeckCards] = useState<BuilderDeckCard[]>([]);
  const [cardQuery, setCardQuery] = useState("");
  const [cardResults, setCardResults] = useState<CardSearchRecord[]>([]);
  const [cardSearchLoading, setCardSearchLoading] = useState(false);
  const [cardSearchError, setCardSearchError] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [savedDecks, setSavedDecks] = useState<SavedBuilderDeck[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [decklistActionMessage, setDecklistActionMessage] = useState("");
  const [showReportView, setShowReportView] = useState(false);
  const [matchingPrecons, setMatchingPrecons] = useState<MatchingPreconSummary[]>([]);
  const [preconLoading, setPreconLoading] = useState(false);
  const [preconError, setPreconError] = useState("");
  const [resolvedCardsByName, setResolvedCardsByName] = useState<Record<string, CardSearchRecord>>({});
  const analyzeRequestId = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSavedDecks(parseSavedBuilderDecks(window.localStorage.getItem(BUILDER_STORAGE_KEY)));
  }, []);

  function persistSavedDecks(next: SavedBuilderDeck[]) {
    setSavedDecks(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(next));
    }
  }

  function toggleCommanderColor(color: string) {
    setCommanderColors((previous) =>
      previous.includes(color) ? previous.filter((entry) => entry !== color) : [...previous, color]
    );
  }

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setCommanderLoading(true);
      setCommanderError("");

      try {
        const params = new URLSearchParams({
          commanderOnly: "1",
          limit: "18"
        });
        if (commanderQuery.trim()) {
          params.set("q", commanderQuery.trim());
        }
        if (commanderColors.length > 0) {
          params.set("colors", [...commanderColors].sort().join(","));
        }

        const response = await fetch(`/api/card-search?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as CardSearchResponse | { error: string };
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setCommanderResults([]);
          setCommanderError("error" in payload ? payload.error : "Could not search commanders.");
          return;
        }

        setCommanderResults((payload as CardSearchResponse).items);
      } catch {
        if (!cancelled) {
          setCommanderResults([]);
          setCommanderError("Could not search commanders.");
        }
      } finally {
        if (!cancelled) {
          setCommanderLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [commanderColors, commanderQuery]);

  const selectedPairOption = useMemo(
    () => selectedCommander?.pairOptions?.find((option) => option.name === selectedPartnerName) ?? null,
    [selectedCommander, selectedPartnerName]
  );

  const allowedColorIdentity = useMemo(() => {
    if (selectedPairOption) {
      return selectedPairOption.combinedColorIdentity;
    }

    return selectedCommander?.colorIdentity ?? [];
  }, [selectedCommander, selectedPairOption]);

  const commanderSelection = useMemo<BuilderCommanderSelection | null>(() => {
    if (!selectedCommander) {
      return null;
    }

    return {
      primary: selectedCommander.name,
      secondary: selectedPairOption?.name ?? null
    };
  }, [selectedCommander, selectedPairOption]);

  const expectedMainDeckSize = selectedPairOption ? 98 : selectedCommander ? 99 : 0;
  const currentMainDeckCount = totalDeckCardCount(deckCards);

  useEffect(() => {
    if (!selectedCommander) {
      setCardResults([]);
      setCardSearchError("");
      return;
    }

    if (!cardQuery.trim()) {
      setCardResults([]);
      setCardSearchError("");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setCardSearchLoading(true);
      setCardSearchError("");

      try {
        const params = new URLSearchParams({
          q: cardQuery.trim(),
          limit: "20"
        });
        if (allowedColorIdentity.length > 0) {
          params.set("allowedColors", allowedColorIdentity.join(","));
        }

        const response = await fetch(`/api/card-search?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as CardSearchResponse | { error: string };
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setCardResults([]);
          setCardSearchError("error" in payload ? payload.error : "Could not search cards.");
          return;
        }

        const selectedNames = new Set(
          [selectedCommander.name, selectedPairOption?.name]
            .filter(Boolean)
            .map((name) => normalizeName(String(name)))
        );
        setCardResults(
          (payload as CardSearchResponse).items.filter(
            (item) => !selectedNames.has(normalizeName(item.name))
          )
        );
      } catch {
        if (!cancelled) {
          setCardResults([]);
          setCardSearchError("Could not search cards.");
        }
      } finally {
        if (!cancelled) {
          setCardSearchLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [allowedColorIdentity, cardQuery, selectedCommander, selectedPairOption]);

  useEffect(() => {
    if (!commanderSelection) {
      setAnalysis(null);
      setAnalysisError("");
      setAnalysisLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = analyzeRequestId.current + 1;
    analyzeRequestId.current = requestId;
    const timeoutId = window.setTimeout(async () => {
      setAnalysisLoading(true);
      setAnalysisError("");

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decklist: buildBuilderDecklist(commanderSelection, deckCards),
            commanderName: commanderSelection.secondary
              ? `${commanderSelection.primary} + ${commanderSelection.secondary}`
              : commanderSelection.primary,
            deckPriceMode: "oracle-default"
          })
        });

        const payload = (await response.json()) as AnalyzeResponse | { error: string };
        if (cancelled || analyzeRequestId.current !== requestId) {
          return;
        }

        if (!response.ok) {
          setAnalysis(null);
          setAnalysisError("error" in payload ? payload.error : "Could not analyze builder deck.");
          return;
        }

        setAnalysis(payload as AnalyzeResponse);
      } catch {
        if (!cancelled && analyzeRequestId.current === requestId) {
          setAnalysis(null);
          setAnalysisError("Could not analyze builder deck.");
        }
      } finally {
        if (!cancelled && analyzeRequestId.current === requestId) {
          setAnalysisLoading(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [commanderSelection, deckCards]);

  useEffect(() => {
    if (!selectedCommander) {
      setMatchingPrecons([]);
      setPreconError("");
      setPreconLoading(false);
      return;
    }

    const commanderName = selectedCommander.name;
    let cancelled = false;

    async function loadPrecons() {
      setPreconLoading(true);
      setPreconError("");

      try {
        const listResponse = await fetch(
          `/api/precons?commander=${encodeURIComponent(commanderName)}&limit=10`,
          { cache: "no-store" }
        );
        const listPayload = (await listResponse.json()) as
          | { items?: Array<{ slug: string }> }
          | { error: string };

        if (!listResponse.ok) {
          if (!cancelled) {
            setMatchingPrecons([]);
            setPreconError("error" in listPayload ? listPayload.error : "Could not load matching precons.");
          }
          return;
        }

        const slugs = Array.isArray((listPayload as { items?: Array<{ slug: string }> }).items)
          ? ((listPayload as { items: Array<{ slug: string }> }).items.map((item) => item.slug))
          : [];

        if (slugs.length === 0) {
          if (!cancelled) {
            setMatchingPrecons([]);
          }
          return;
        }

        const detailResponses = await Promise.all(
          slugs.slice(0, 5).map(async (slug) => {
            const response = await fetch(`/api/precons?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
            if (!response.ok) {
              return null;
            }

            return (await response.json()) as PreconDeck;
          })
        );

        if (!cancelled) {
          setMatchingPrecons(
            detailResponses
              .filter((deck): deck is PreconDeck => Boolean(deck))
              .map((deck) => ({
                slug: deck.slug,
                name: deck.name,
                releaseDate: deck.releaseDate,
                decklist: deck.decklist
              }))
          );
        }
      } catch {
        if (!cancelled) {
          setMatchingPrecons([]);
          setPreconError("Could not load matching precons.");
        }
      } finally {
        if (!cancelled) {
          setPreconLoading(false);
        }
      }
    }

    void loadPrecons();

    return () => {
      cancelled = true;
    };
  }, [selectedCommander]);

  const preconSimilarity = useMemo(() => {
    if (matchingPrecons.length === 0) {
      return null;
    }

    return matchingPrecons
      .map((precon) => computePreconSimilarity(deckCards, precon))
      .sort((left, right) => right.overlapPct - left.overlapPct || left.name.localeCompare(right.name))[0] ?? null;
  }, [deckCards, matchingPrecons]);

  const roleBreakdown = useMemo(() => normalizeRoleBreakdown(analysis), [analysis]);
  const archetypeNames = useMemo(
    () =>
      [analysis?.archetypeReport.primary?.archetype, analysis?.archetypeReport.secondary?.archetype].filter(
        Boolean
      ) as string[],
    [analysis]
  );
  const needs = useMemo(() => extractNeeds(analysis?.deckHealth.rows ?? []), [analysis]);
  const commanderStaples = useMemo(
    () =>
      selectedCommander
        ? buildCommanderStapleSuggestionNames(allowedColorIdentity, archetypeNames).filter(
            (name) => !deckCards.some((card) => normalizeName(card.name) === normalizeName(name))
          )
        : [],
    [allowedColorIdentity, archetypeNames, deckCards, selectedCommander]
  );
  const manaBaseSuggestions = useMemo(
    () =>
      selectedCommander
        ? buildManaBaseSuggestionNames(allowedColorIdentity).filter(
            (name) => !deckCards.some((card) => normalizeName(card.name) === normalizeName(name))
          )
        : [],
    [allowedColorIdentity, deckCards, selectedCommander]
  );
  const suggestionGroups = useMemo(
    () => buildSuggestionGroups(analysis, commanderStaples, manaBaseSuggestions),
    [analysis, commanderStaples, manaBaseSuggestions]
  );
  const totalDeckCount = currentMainDeckCount + (selectedCommander ? 1 : 0) + (selectedPairOption ? 1 : 0);
  const metadataNames = useMemo(() => {
    const names = [
      ...deckCards.map((card) => card.name),
      selectedCommander?.name ?? "",
      selectedPairOption?.name ?? "",
      ...commanderStaples,
      ...manaBaseSuggestions,
      ...suggestionGroups.roleGroups.flatMap((group) => group.items.map((item) => item.name)),
      ...suggestionGroups.comboGroups.flatMap((group) => group.items.map((item) => item.name))
    ];

    const seen = new Set<string>();
    const output: string[] = [];
    for (const name of names) {
      const normalized = normalizeName(name);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      output.push(name);
    }

    return output;
  }, [commanderStaples, deckCards, manaBaseSuggestions, selectedCommander, selectedPairOption, suggestionGroups]);
  const deckSections = useMemo(
    () => categorizeBuilderDeckCards(deckCards, roleBreakdown, toCardMetaMap(resolvedCardsByName)),
    [deckCards, resolvedCardsByName, roleBreakdown]
  );
  const archetypeLabel = useMemo(() => buildArchetypeLabel(analysis?.archetypeReport), [analysis]);
  const heroCommander = useMemo(() => {
    if (!selectedCommander) {
      return null;
    }

    const analyzedPrimaryCommanderName =
      analysis?.commander?.selectedNames?.[0] ?? selectedCommander.name;
    const analyzedCommander = analysis?.commander?.selectedName
      ? {
          name: analyzedPrimaryCommanderName,
          colorIdentity: analysis.commander.selectedColorIdentity,
          cmc: analysis.commander.selectedCmc,
          artUrl: analysis.commander.selectedArtUrl,
          cardImageUrl: analysis.commander.selectedCardImageUrl,
          setCode: analysis.commander.selectedSetCode,
          collectorNumber: analysis.commander.selectedCollectorNumber,
          printingId: analysis.commander.selectedPrintingId
        }
      : null;

    return analyzedCommander ?? {
      name: selectedCommander.name,
      colorIdentity: allowedColorIdentity,
      cmc: selectedCommander.cmc,
      artUrl: selectedCommander.artUrl,
      cardImageUrl: selectedCommander.previewImageUrl,
      setCode: null,
      collectorNumber: null,
      printingId: null
    };
  }, [allowedColorIdentity, analysis, selectedCommander]);
  const maxCurveCount = useMemo(() => {
    if (!analysis) {
      return 1;
    }

    return Math.max(
      1,
      ...Object.values(analysis.summary.manaCurve).map((value) =>
        typeof value === "number" && Number.isFinite(value) ? value : 0
      )
    );
  }, [analysis]);

  function resolveCardRecord(name: string): CardSearchRecord {
    const normalized = normalizeName(name);
    const basicLand = isBasicLandName(name);
    return (
      resolvedCardsByName[normalized] ??
      basicCardTemplate(name, basicLand, basicLand ? Number.POSITIVE_INFINITY : null)
    );
  }

  function addNamedCard(name: string) {
    setDeckCards((current) => addCardToDeck(current, resolveCardRecord(name)));
  }

  function removeNamedCard(name: string) {
    setDeckCards((current) =>
      current.filter((entry) => normalizeName(entry.name) !== normalizeName(name))
    );
  }

  useEffect(() => {
    if (metadataNames.length === 0) {
      setResolvedCardsByName({});
      return;
    }

    let cancelled = false;

    async function resolveCards() {
      try {
        const response = await fetch("/api/card-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            names: metadataNames
          })
        });
        const payload = (await response.json()) as CardSearchResponse | { error: string };
        if (cancelled || !response.ok) {
          return;
        }

        const items = (payload as CardSearchResponse).items ?? [];
        setResolvedCardsByName((current) => {
          const next = { ...current };
          for (const item of items) {
            next[normalizeName(item.name)] = item;
          }
          return next;
        });
      } catch {
        // Builder suggestions degrade to name-only rows if local lookup fails.
      }
    }

    void resolveCards();

    return () => {
      cancelled = true;
    };
  }, [metadataNames]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const pageArtUrl = heroCommander?.artUrl ?? heroCommander?.cardImageUrl ?? null;

    if (!pageArtUrl) {
      root.classList.remove("has-commander-page-art");
      body.classList.remove("has-commander-page-art");
      root.style.removeProperty("--commander-page-art");
      return;
    }

    root.style.setProperty("--commander-page-art", `url("${pageArtUrl}")`);
    root.classList.add("has-commander-page-art");
    body.classList.add("has-commander-page-art");

    return () => {
      root.classList.remove("has-commander-page-art");
      body.classList.remove("has-commander-page-art");
      root.style.removeProperty("--commander-page-art");
    };
  }, [heroCommander?.artUrl, heroCommander?.cardImageUrl]);

  function startBuild(commander: CardSearchRecord) {
    setSelectedCommander(commander);
    setSelectedPartnerName("");
    setDeckCards([]);
    setDeckName(`${commander.name} Builder`);
    setShowReportView(false);
    setAnalysis(null);
    setAnalysisError("");
    setSaveMessage("");
  }

  function saveCurrentDeck() {
    if (!selectedCommander) {
      return;
    }

    const nextEntry: SavedBuilderDeck = {
      id: createSavedDeckId(),
      name: deckName.trim() || `${selectedCommander.name} Builder`,
      commander: selectedCommander,
      partnerName: selectedPairOption?.name ?? null,
      cards: deckCards,
      updatedAt: new Date().toISOString()
    };

    const next = [nextEntry, ...savedDecks].slice(0, MAX_SAVED_BUILDS);
    persistSavedDecks(next);
    setSaveMessage(`Saved "${nextEntry.name}" locally.`);
  }

  function loadSavedDeck(saved: SavedBuilderDeck) {
    setSelectedCommander(saved.commander);
    setSelectedPartnerName(saved.partnerName ?? "");
    setDeckCards(saved.cards);
    setDeckName(saved.name);
    setSaveMessage(`Loaded "${saved.name}".`);
  }

  function removeSavedDeck(id: string) {
    const next = savedDecks.filter((saved) => saved.id !== id);
    persistSavedDecks(next);
  }

  async function copyDecklist() {
    if (!commanderSelection || typeof navigator === "undefined" || !navigator.clipboard) {
      setDecklistActionMessage("Copy to clipboard is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildBuilderDecklist(commanderSelection, deckCards));
      setDecklistActionMessage("Decklist copied.");
    } catch {
      setDecklistActionMessage("Could not copy the decklist.");
    }
  }

  function downloadDecklist() {
    if (!commanderSelection || typeof document === "undefined") {
      return;
    }

    const blob = new Blob([buildBuilderDecklist(commanderSelection, deckCards)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(deckName.trim() || selectedCommander?.name || "commander-deck").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setDecklistActionMessage("Decklist exported.");
  }

  return (
    <main className="page builder-page">
      <div className="hero builder-hero">
        <h1>Commander-First Deck Builder</h1>
        <p>Pick a commander, build the 99, and keep live Commander legality and analysis visible while you tune.</p>
        <div className="hero-actions">
          <Link href="/" className="btn-secondary">
            Open Analyzer
          </Link>
        </div>
      </div>

      <section className="builder-commander-picker panel">
        <div className="builder-commander-picker-head">
          <div>
            <h2>Commander Picker</h2>
            <p className="muted">Search commanders by name and color identity, then start a fresh build.</p>
          </div>
          {selectedCommander ? (
            <div className="builder-selected-identity">
              <span className="muted">Allowed colors</span>
              <ColorIdentityIcons identity={allowedColorIdentity} size={18} />
            </div>
          ) : null}
        </div>

        <div className="builder-commander-picker-controls">
          <input type="search" value={commanderQuery} onChange={(event) => setCommanderQuery(event.target.value)} placeholder="Search commanders" />
          <div className="builder-color-filter">
            {["W", "U", "B", "R", "G"].map((color) => (
              <button key={color} type="button" className={`builder-color-chip${commanderColors.includes(color) ? " builder-color-chip-active" : ""}`} onClick={() => toggleCommanderColor(color)}>
                {color}
              </button>
            ))}
          </div>
        </div>

        {commanderLoading ? <p className="muted">Searching commanders...</p> : null}
        {commanderError ? <p className="error">{commanderError}</p> : null}

        <div className="builder-commander-results">
          {commanderResults.map((commander) => (
            <article key={commander.name} className="builder-search-card">
              <div>
                <strong><CardLink name={commander.name} /></strong>
                <div className="builder-search-meta">
                  <ManaCost manaCost={commander.manaCost} size={16} />
                  <span>{commander.typeLine}</span>
                  <ColorIdentityIcons identity={commander.colorIdentity} size={16} />
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => startBuild(commander)}>Start Build</button>
            </article>
          ))}
          {!commanderLoading && commanderResults.length === 0 ? <p className="muted">No commanders match the current search.</p> : null}
        </div>
      </section>

      {heroCommander ? (
        <CommanderHeroHeader
          commander={heroCommander}
          archetypeLabel={archetypeLabel}
          bracketLabel={analysis?.bracketReport?.estimatedLabel ?? null}
        />
      ) : null}

      <section className="builder-grid">
        <aside className="panel builder-panel builder-panel-left">
          <div className="builder-panel-head">
            <h2>Deck Status</h2>
            {selectedCommander ? <button type="button" className="btn-tertiary" onClick={saveCurrentDeck}>Save Build</button> : null}
          </div>

          {!selectedCommander ? (
            <p className="muted">Choose a commander to initialize an empty 99-card Commander build.</p>
          ) : (
            <>
              <div className="builder-commander-summary">
                <div>
                  <p className="builder-kicker">Commander</p>
                  <strong><CardLink name={selectedCommander.name} /></strong>
                </div>
                <div className="builder-search-meta">
                  <ManaCost manaCost={selectedCommander.manaCost} size={16} />
                  <ColorIdentityIcons identity={allowedColorIdentity} size={18} />
                </div>
              </div>

              {selectedCommander.pairOptions && selectedCommander.pairOptions.length > 0 ? (
                <div className="builder-pair-picker">
                  <label htmlFor="builder-partner">Partner / Background</label>
                  <select id="builder-partner" value={selectedPartnerName} onChange={(event) => setSelectedPartnerName(event.target.value)}>
                    <option value="">No paired commander</option>
                    {selectedCommander.pairOptions.map((option) => (
                      <option key={option.name} value={option.name}>{option.name} ({option.pairType})</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="builder-stat-grid">
                <div className="summary-card"><span>Main Deck</span><strong>{currentMainDeckCount}/{expectedMainDeckSize}</strong></div>
                <div className="summary-card"><span>Total Cards</span><strong>{totalDeckCount}</strong></div>
                <div className="summary-card"><span>Legality</span><strong>{analysis?.rulesEngine?.status ?? "Pending"}</strong></div>
                <div className="summary-card"><span>Bracket</span><strong>{analysis?.bracketReport?.estimatedLabel ?? "Pending"}</strong></div>
              </div>

              {analysisLoading ? <p className="muted">Refreshing live analysis...</p> : null}
              {analysisError ? <p className="error">{analysisError}</p> : null}

              {analysis ? (
                <>
                  <div className="builder-stat-list">
                    <p>Color identity violations: <strong>{analysis.checks.colorIdentity.offColorCount}</strong></p>
                    <p>Live combos detected: <strong>{analysis.comboReport.detected.length}</strong></p>
                    <p>Avg mana value: <strong>{typeof analysis.summary.averageManaValue === "number" ? analysis.summary.averageManaValue.toFixed(2) : "N/A"}</strong></p>
                    <p>Price coverage: <strong>{formatPercent(analysis.deckPrice?.coverage.usd ? analysis.deckPrice.coverage.usd * 100 : 0)}</strong></p>
                  </div>

                  <div className="builder-role-list">
                    {Object.entries(analysis.roles).map(([role, count]) => (<span key={role} className="chip">{role}: {count}</span>))}
                  </div>

                  <div className="builder-curve">
                    {Object.entries(analysis.summary.manaCurve).map(([bucket, count]) => (
                      <div key={bucket} className="curve-row">
                        <span className="curve-label">{bucket}</span>
                        <div className="curve-bar-wrap">
                          <div className="curve-bar" style={{ width: `${Math.min(100, ((count as number) / maxCurveCount) * 100)}%` }} />
                        </div>
                        <span className="curve-value">{count}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              <section className="builder-needs-panel">
                <h3>Needs</h3>
                {needs.length === 0 ? <p className="muted">No low-count buckets detected yet.</p> : <ul className="builder-bullets">{needs.map((need) => (<li key={need.key}>{need.label}: needs {need.deficit} more to reach {need.recommendedMin}</li>))}</ul>}
              </section>

              <section className="builder-needs-panel">
                <h3>Precon Similarity</h3>
                {preconLoading ? <p className="muted">Checking synced precons...</p> : null}
                {preconError ? <p className="error-inline">{preconError}</p> : null}
                {!preconLoading && !preconError && preconSimilarity ? <p>Closest stock match: <strong>{preconSimilarity.name}</strong> ({preconSimilarity.releaseDate}) with <strong>{preconSimilarity.overlapPct}%</strong> overlap ({preconSimilarity.overlapCount} shared cards).</p> : null}
                {!preconLoading && !preconError && !preconSimilarity ? <p className="muted">No synced stock precon match for this commander yet.</p> : null}
              </section>
            </>
          )}

          <section className="saved-decks-panel">
            <h3>Saved Builds</h3>
            {saveMessage ? <p className="muted">{saveMessage}</p> : null}
            {savedDecks.length === 0 ? <p className="muted">No saved builder decks yet.</p> : <ul className="saved-decks-list">{savedDecks.map((saved) => (<li key={saved.id} className="saved-decks-item"><button type="button" className="saved-deck-load" onClick={() => loadSavedDeck(saved)}>{saved.name}</button><button type="button" className="saved-deck-remove" onClick={() => removeSavedDeck(saved.id)}>Remove</button></li>))}</ul>}
          </section>
        </aside>

        <section className="panel builder-panel builder-panel-center">
            <div className="builder-panel-head">
            <div>
              <h2>Current Deck</h2>
              <p className="muted">Commander plus live 99-card build.</p>
            </div>
            <div className="builder-deck-actions">
              <input type="text" value={deckName} onChange={(event) => setDeckName(event.target.value)} placeholder="Deck name" />
              <button type="button" className="btn-tertiary" onClick={() => void copyDecklist()} disabled={!commanderSelection}>Copy Decklist</button>
              <button type="button" className="btn-tertiary" onClick={downloadDecklist} disabled={!commanderSelection}>Export Decklist</button>
            </div>
          </div>
          {decklistActionMessage ? <p className="muted">{decklistActionMessage}</p> : null}

          {!selectedCommander ? (
            <p className="muted">Start with a commander. The builder initializes an empty shell and keeps analysis live.</p>
          ) : (
            <>
              <div className="builder-deck-section">
                <h3>Commander Zone</h3>
                <ul className="builder-card-list">
                  <li className="builder-card-row"><span className="builder-card-qty">1</span><CardLink name={selectedCommander.name} /></li>
                  {selectedPairOption ? <li className="builder-card-row"><span className="builder-card-qty">1</span><CardLink name={selectedPairOption.name} /></li> : null}
                </ul>
              </div>

              {deckCards.length === 0 ? (
                <div className="builder-deck-section">
                  <h3>Main Deck</h3>
                  <p className="muted">No cards added yet. Use the search panel to add cards to the 99.</p>
                </div>
              ) : (
                deckSections.map((section) => (
                  <div key={section.key} className="builder-deck-section">
                    <div className="builder-section-head">
                      <h3>{section.label}</h3>
                      <span className="muted">
                        {section.cards.reduce((sum, card) => sum + card.qty, 0)} card
                        {section.cards.reduce((sum, card) => sum + card.qty, 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul className="builder-card-list">
                      {section.cards.map((card) => {
                        const record = resolveCardRecord(card.name);
                        return (
                          <li key={`${section.key}-${card.name}`} className="builder-card-row">
                            <span className="builder-card-qty">{card.qty}</span>
                            <div className="builder-card-main">
                              <div className="builder-card-main-head">
                                <strong><CardLink name={card.name} /></strong>
                                <div className="builder-search-meta">
                                  {record.manaCost ? <ManaCost manaCost={record.manaCost} size={16} /> : null}
                                  {record.colorIdentity.length > 0 ? (
                                    <ColorIdentityIcons identity={record.colorIdentity} size={15} />
                                  ) : null}
                                </div>
                              </div>
                              <p className="muted builder-card-subline">
                                {record.typeLine || "Card data pending"}
                              </p>
                            </div>
                            <div className="builder-card-actions">
                              <button
                                type="button"
                                className="btn-tertiary"
                                onClick={() => setDeckCards((current) => updateCardQty(current, card.name, -1))}
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className="btn-tertiary"
                                onClick={() => setDeckCards((current) => updateCardQty(current, card.name, 1))}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className="btn-tertiary"
                                onClick={() => removeNamedCard(card.name)}
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}

              {analysis ? <div className="builder-inline-report-toggle"><button type="button" className="btn-secondary" onClick={() => setShowReportView((current) => !current)}>{showReportView ? "Hide Full Report" : "Open Full Report"}</button></div> : null}
            </>
          )}
        </section>

        <aside className="panel builder-panel builder-panel-right">
          <div className="builder-panel-head">
            <div>
              <h2>Card Search</h2>
              <p className="muted">Search the local Commander card library and add cards directly into the deck.</p>
            </div>
          </div>

          <input type="search" value={cardQuery} onChange={(event) => setCardQuery(event.target.value)} placeholder={selectedCommander ? "Search cards to add" : "Select a commander first"} disabled={!selectedCommander} />

          {cardSearchLoading ? <p className="muted">Searching cards...</p> : null}
          {cardSearchError ? <p className="error">{cardSearchError}</p> : null}

          <div className="builder-search-results">
            {cardResults.map((card) => {
              const existingQty = deckCards.find((entry) => normalizeName(entry.name) === normalizeName(card.name))?.qty ?? 0;
              const duplicateLimit = card.duplicateLimit;
              const canAddMore = existingQty === 0 || card.isBasicLand || duplicateLimit === Number.POSITIVE_INFINITY || (typeof duplicateLimit === "number" && existingQty < duplicateLimit);

              return (
                <article key={card.name} className="builder-search-card">
                  <div>
                    <strong><CardLink name={card.name} /></strong>
                    <div className="builder-search-meta">
                      <ManaCost manaCost={card.manaCost} size={16} />
                      <span>{card.typeLine}</span>
                      <ColorIdentityIcons identity={card.colorIdentity} size={16} />
                    </div>
                    {existingQty > 0 ? <p className="muted">In deck: {existingQty}</p> : null}
                  </div>
                  <button type="button" className="btn-secondary" disabled={!canAddMore} onClick={() => setDeckCards((current) => addCardToDeck(current, card))}>{canAddMore ? "Add" : "At Limit"}</button>
                </article>
              );
            })}
            {!cardSearchLoading && selectedCommander && cardQuery.trim() && cardResults.length === 0 ? <p className="muted">No legal cards match the current search.</p> : null}
          </div>

          <section className="builder-needs-panel">
            <h3>Commander Staples</h3>
            {!suggestionGroups.stapleGroup ? (
              <p className="muted">Select a commander to seed staple suggestions.</p>
            ) : (
              <div className="builder-suggestion-groups">
                <div className="builder-suggestion-group">
                  <p className="muted builder-suggestion-description">
                    {suggestionGroups.stapleGroup.description}
                  </p>
                  <div className="builder-suggestion-list">
                    {suggestionGroups.stapleGroup.items.map((item) => {
                      const record = resolveCardRecord(item.name);
                      const existingQty =
                        deckCards.find((entry) => normalizeName(entry.name) === normalizeName(item.name))?.qty ?? 0;
                      const duplicateLimit = record.duplicateLimit;
                      const canAddMore =
                        existingQty === 0 ||
                        record.isBasicLand ||
                        duplicateLimit === Number.POSITIVE_INFINITY ||
                        (typeof duplicateLimit === "number" && existingQty < duplicateLimit);

                      return (
                        <article key={`staple-${item.name}`} className="builder-search-card builder-suggestion-card">
                          <div>
                            <strong><CardLink name={item.name} /></strong>
                            <div className="builder-search-meta">
                              {record.manaCost ? <ManaCost manaCost={record.manaCost} size={16} /> : null}
                              {record.typeLine ? <span>{record.typeLine}</span> : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={!canAddMore}
                            onClick={() => addNamedCard(item.name)}
                          >
                            {canAddMore ? "Add" : "In Deck"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="builder-needs-panel">
            <h3>Smart Suggestions</h3>
            {suggestionGroups.roleGroups.length === 0 ? (
              <p className="muted">Start adding cards to unlock role and archetype suggestions.</p>
            ) : (
              <div className="builder-suggestion-groups">
                {suggestionGroups.roleGroups.map((group) => (
                  <div key={group.key} className="builder-suggestion-group">
                    <div className="builder-section-head">
                      <strong>{group.label}</strong>
                    </div>
                    {group.description ? (
                      <p className="muted builder-suggestion-description">{group.description}</p>
                    ) : null}
                    <div className="builder-suggestion-list">
                      {group.items.map((item) => {
                        const record = resolveCardRecord(item.name);
                        const existingQty =
                          deckCards.find((entry) => normalizeName(entry.name) === normalizeName(item.name))?.qty ?? 0;
                        const duplicateLimit = record.duplicateLimit;
                        const canAddMore =
                          existingQty === 0 ||
                          record.isBasicLand ||
                          duplicateLimit === Number.POSITIVE_INFINITY ||
                          (typeof duplicateLimit === "number" && existingQty < duplicateLimit);

                        return (
                          <article key={`${group.key}-${item.name}`} className="builder-search-card builder-suggestion-card">
                            <div>
                              <strong><CardLink name={item.name} /></strong>
                              <div className="builder-search-meta">
                                {record.manaCost ? <ManaCost manaCost={record.manaCost} size={16} /> : null}
                                {record.typeLine ? <span>{record.typeLine}</span> : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={!canAddMore}
                              onClick={() => addNamedCard(item.name)}
                            >
                              {canAddMore ? "Add" : "In Deck"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="builder-needs-panel">
            <h3>Combo Suggestions</h3>
            {suggestionGroups.comboGroups.length === 0 ? (
              <p className="muted">No near-miss combo packages detected yet.</p>
            ) : (
              <div className="builder-suggestion-groups">
                {suggestionGroups.comboGroups.map((group) => (
                  <div key={group.key} className="builder-suggestion-group">
                    <div className="builder-section-head">
                      <strong>{group.label}</strong>
                    </div>
                    {group.description ? (
                      <p className="muted builder-suggestion-description">{group.description}</p>
                    ) : null}
                    <div className="builder-suggestion-list">
                      {group.items.map((item) => {
                        const record = resolveCardRecord(item.name);
                        const existingQty =
                          deckCards.find((entry) => normalizeName(entry.name) === normalizeName(item.name))?.qty ?? 0;
                        const duplicateLimit = record.duplicateLimit;
                        const canAddMore =
                          existingQty === 0 ||
                          record.isBasicLand ||
                          duplicateLimit === Number.POSITIVE_INFINITY ||
                          (typeof duplicateLimit === "number" && existingQty < duplicateLimit);

                        return (
                          <article key={`${group.key}-${item.name}`} className="builder-search-card builder-suggestion-card">
                            <div>
                              <strong><CardLink name={item.name} /></strong>
                              <div className="builder-search-meta">
                                {record.manaCost ? <ManaCost manaCost={record.manaCost} size={16} /> : null}
                                {record.typeLine ? <span>{record.typeLine}</span> : null}
                              </div>
                              {item.note ? <p className="muted builder-suggestion-note">{item.note}</p> : null}
                            </div>
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={!canAddMore}
                              onClick={() => addNamedCard(item.name)}
                            >
                              {canAddMore ? "Add" : "In Deck"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="builder-needs-panel">
            <h3>Mana Base Suggestions</h3>
            {!suggestionGroups.manaBaseGroup ? (
              <p className="muted">Select a commander to generate land suggestions.</p>
            ) : (
              <div className="builder-suggestion-groups">
                <div className="builder-suggestion-group">
                  <p className="muted builder-suggestion-description">
                    {suggestionGroups.manaBaseGroup.description}
                  </p>
                  <div className="builder-suggestion-list">
                    {suggestionGroups.manaBaseGroup.items.map((item) => {
                      const record = resolveCardRecord(item.name);
                      const existingQty =
                        deckCards.find((entry) => normalizeName(entry.name) === normalizeName(item.name))?.qty ?? 0;
                      const duplicateLimit = record.duplicateLimit;
                      const canAddMore =
                        existingQty === 0 ||
                        record.isBasicLand ||
                        duplicateLimit === Number.POSITIVE_INFINITY ||
                        (typeof duplicateLimit === "number" && existingQty < duplicateLimit);

                      return (
                        <article key={`land-${item.name}`} className="builder-search-card builder-suggestion-card">
                          <div>
                            <strong><CardLink name={item.name} /></strong>
                            <div className="builder-search-meta">
                              {record.manaCost ? <ManaCost manaCost={record.manaCost} size={16} /> : null}
                              {record.typeLine ? <span>{record.typeLine}</span> : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={!canAddMore}
                            onClick={() => addNamedCard(item.name)}
                          >
                            {canAddMore ? "Add" : "In Deck"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </aside>
      </section>

      {showReportView && analysis ? <section className="panel builder-report-panel"><AnalysisReport result={analysis} /></section> : null}
    </main>
  );
}
