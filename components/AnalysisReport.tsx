"use client";

import { useEffect, useRef, useState } from "react";
import { Checks } from "@/components/Checks";
import { CardNameHover } from "@/components/CardNameHover";
import { ColorIdentityIcons } from "@/components/ColorIdentityIcons";
import { ComboCardTile } from "@/components/ComboCardTile";
import { CommanderHeroHeader } from "@/components/CommanderHeroHeader";
import { DeckHealth } from "@/components/DeckHealth";
import { ImprovementSuggestions } from "@/components/ImprovementSuggestions";
import { ManaCost } from "@/components/ManaCost";
import { RecommendedCounts } from "@/components/RecommendedCounts";
import { SimulationsSection } from "@/components/report/SimulationsSection";
import { RoleBars } from "@/components/RoleBars";
import type { AnalyzeResponse, RoleBreakdown, TutorSummary } from "@/lib/contracts";
import { getStatusMeta } from "@/lib/ui/statusStyles";

const CURVE_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7+"];
const FALLBACK_RULE_ZERO = {
  winStyle: {
    primary: "COMBAT",
    secondary: null,
    evidence: []
  },
  speedBand: {
    value: "MID",
    turnBand: "7-9",
    explanation: "No speed signals available."
  },
  consistency: {
    score: 0,
    bucket: "LOW",
    commanderEngine: false,
    explanation: "No consistency signals available."
  },
  tableImpact: {
    flags: [],
    extraTurnsCount: 0,
    massLandDenialCount: 0,
    staxPiecesCount: 0,
    freeInteractionCount: 0,
    fastManaCount: 0
  },
  disclaimer: "Rule 0 Snapshot is a conversation layer built from deck signals."
} as const;

const TABLE_TALK_META: Record<string, { icon: string; label: string }> = {
  fastMana: { icon: "\u26A1", label: "Fast Mana" },
  tutors: { icon: "\uD83C\uDF93", label: "Tutors" },
  extraTurns: { icon: "\uD83C\uDF00", label: "Extra Turns" },
  staxPieces: { icon: "\uD83E\uDDEA", label: "Stax / Tax" },
  massLandDenial: { icon: "\uD83E\uDDE8", label: "Mass Land Denial" },
  freeInteraction: { icon: "\uD83D\uDEE1", label: "Free Interaction" }
};

type TableTalkRow = {
  key: string;
  severity: "WARN" | "INFO";
  label: string;
  icon: string;
  count: number;
  message: string;
  cards: string[];
};

function cardLabel(entry: AnalyzeResponse["parsedDeck"][number]): string {
  return entry.resolvedName ?? entry.name;
}

function labelForWinStyle(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  if (value === "COMMANDER_DAMAGE") {
    return "Commander Damage";
  }

  const lower = value.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function labelForSpeedBand(value: string | null | undefined): string {
  if (!value) return "Unknown";
  if (value === "VERY_FAST") return "Very Fast";
  if (value === "FAST") return "Fast";
  if (value === "MID") return "Mid";
  return "Slow";
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatUsd(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `$${value.toFixed(2)}`;
}

function formatTix(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)} tix`;
}

function cardKingdomSearchUrl(cardName: string): string | null {
  const trimmed = cardName.trim();
  if (!trimmed) {
    return null;
  }

  return `https://www.cardkingdom.com/catalog/search?search=header&filter[name]=${encodeURIComponent(trimmed)}`;
}

function toRatio(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function normalizeComboText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeDeckPrice(result: AnalyzeResponse): {
  totals: {
    usd: number | null;
    usdFoil: number | null;
    usdEtched: number | null;
    tix: number | null;
  };
  pricedCardQty: {
    usd: number;
    usdFoil: number;
    usdEtched: number;
    tix: number;
  };
  totalKnownCardQty: number;
  coverage: {
    usd: number;
    usdFoil: number;
    usdEtched: number;
    tix: number;
  };
  pricingMode: "oracle-default" | "decklist-set";
  setTaggedCardQty: number;
  setMatchedCardQty: number;
  disclaimer: string;
} | null {
  const rawDeckPrice = (result as { deckPrice?: unknown }).deckPrice;
  if (!rawDeckPrice || typeof rawDeckPrice !== "object") {
    return null;
  }

  const record = rawDeckPrice as Record<string, unknown>;
  const totalsRecord =
    record.totals && typeof record.totals === "object"
      ? (record.totals as Record<string, unknown>)
      : {};
  const pricedCardQtyRecord =
    record.pricedCardQty && typeof record.pricedCardQty === "object"
      ? (record.pricedCardQty as Record<string, unknown>)
      : {};
  const coverageRecord =
    record.coverage && typeof record.coverage === "object"
      ? (record.coverage as Record<string, unknown>)
      : {};

  return {
    totals: {
      usd: typeof totalsRecord.usd === "number" && Number.isFinite(totalsRecord.usd) ? totalsRecord.usd : null,
      usdFoil:
        typeof totalsRecord.usdFoil === "number" && Number.isFinite(totalsRecord.usdFoil)
          ? totalsRecord.usdFoil
          : null,
      usdEtched:
        typeof totalsRecord.usdEtched === "number" && Number.isFinite(totalsRecord.usdEtched)
          ? totalsRecord.usdEtched
          : null,
      tix: typeof totalsRecord.tix === "number" && Number.isFinite(totalsRecord.tix) ? totalsRecord.tix : null
    },
    pricedCardQty: {
      usd: toFiniteNumber(pricedCardQtyRecord.usd, 0),
      usdFoil: toFiniteNumber(pricedCardQtyRecord.usdFoil, 0),
      usdEtched: toFiniteNumber(pricedCardQtyRecord.usdEtched, 0),
      tix: toFiniteNumber(pricedCardQtyRecord.tix, 0)
    },
    totalKnownCardQty: toFiniteNumber(record.totalKnownCardQty, 0),
    coverage: {
      usd: toRatio(coverageRecord.usd),
      usdFoil: toRatio(coverageRecord.usdFoil),
      usdEtched: toRatio(coverageRecord.usdEtched),
      tix: toRatio(coverageRecord.tix)
    },
    pricingMode: record.pricingMode === "decklist-set" ? "decklist-set" : "oracle-default",
    setTaggedCardQty: Math.max(0, Math.floor(toFiniteNumber(record.setTaggedCardQty, 0))),
    setMatchedCardQty: Math.max(0, Math.floor(toFiniteNumber(record.setMatchedCardQty, 0))),
    disclaimer:
      typeof record.disclaimer === "string" && record.disclaimer
        ? record.disclaimer
        : "Totals are quantity-weighted Scryfall prices for resolved cards only."
  };
}

function normalizeCommanderInfo(result: AnalyzeResponse): {
  name: string | null;
  colorIdentity: string[];
  manaCost: string | null;
  cmc: number | null;
  artUrl: string | null;
  cardImageUrl: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  printingId: string | null;
} {
  const rawCommander = (result as { commander?: unknown }).commander;
  const commanderRecord =
    rawCommander && typeof rawCommander === "object" ? (rawCommander as Record<string, unknown>) : {};
  const cmc = toFiniteNumber(commanderRecord.selectedCmc, NaN);

  return {
    name:
      typeof commanderRecord.selectedName === "string" && commanderRecord.selectedName
        ? commanderRecord.selectedName
        : null,
    colorIdentity: toStringArray(commanderRecord.selectedColorIdentity),
    manaCost:
      typeof commanderRecord.selectedManaCost === "string" && commanderRecord.selectedManaCost
        ? commanderRecord.selectedManaCost
        : null,
    cmc: Number.isFinite(cmc) ? cmc : null,
    artUrl:
      typeof commanderRecord.selectedArtUrl === "string" && commanderRecord.selectedArtUrl
        ? commanderRecord.selectedArtUrl
        : null,
    cardImageUrl:
      typeof commanderRecord.selectedCardImageUrl === "string" && commanderRecord.selectedCardImageUrl
        ? commanderRecord.selectedCardImageUrl
        : null,
    setCode:
      typeof commanderRecord.selectedSetCode === "string" && commanderRecord.selectedSetCode
        ? commanderRecord.selectedSetCode
        : null,
    collectorNumber:
      typeof commanderRecord.selectedCollectorNumber === "string" && commanderRecord.selectedCollectorNumber
        ? commanderRecord.selectedCollectorNumber
        : null,
    printingId:
      typeof commanderRecord.selectedPrintingId === "string" && commanderRecord.selectedPrintingId
        ? commanderRecord.selectedPrintingId
        : null
  };
}

function normalizeRuleZero(result: AnalyzeResponse): {
  winStyle: {
    primary: string;
    secondary: string | null;
    evidence: string[];
  };
  speedBand: {
    value: string;
    turnBand: string;
    explanation: string;
  };
  consistency: {
    score: number;
    bucket: string;
    commanderEngine: boolean;
    explanation: string;
  };
  tableImpact: {
    flags: Array<{
      kind: string;
      severity: "WARN" | "INFO";
      count: number;
      message: string;
      cards: string[];
    }>;
    extraTurnsCount: number;
    massLandDenialCount: number;
    staxPiecesCount: number;
    freeInteractionCount: number;
    fastManaCount: number;
  };
  disclaimer: string;
} {
  const rawRuleZero = (result as { ruleZero?: unknown }).ruleZero;
  const ruleZeroRecord =
    rawRuleZero && typeof rawRuleZero === "object" ? (rawRuleZero as Record<string, unknown>) : {};
  const rawWinStyle =
    ruleZeroRecord.winStyle && typeof ruleZeroRecord.winStyle === "object"
      ? (ruleZeroRecord.winStyle as Record<string, unknown>)
      : {};
  const rawSpeedBand =
    ruleZeroRecord.speedBand && typeof ruleZeroRecord.speedBand === "object"
      ? (ruleZeroRecord.speedBand as Record<string, unknown>)
      : {};
  const rawConsistency =
    ruleZeroRecord.consistency && typeof ruleZeroRecord.consistency === "object"
      ? (ruleZeroRecord.consistency as Record<string, unknown>)
      : {};
  const rawTableImpact =
    ruleZeroRecord.tableImpact && typeof ruleZeroRecord.tableImpact === "object"
      ? (ruleZeroRecord.tableImpact as Record<string, unknown>)
      : {};

  const flags: Array<{
    kind: string;
    severity: "WARN" | "INFO";
    count: number;
    message: string;
    cards: string[];
  }> = Array.isArray(rawTableImpact.flags)
    ? rawTableImpact.flags
        .filter((flag): flag is Record<string, unknown> => Boolean(flag) && typeof flag === "object")
        .map((flag, index) => ({
          kind: typeof flag.kind === "string" && flag.kind ? flag.kind : `impact-${index}`,
          severity: flag.severity === "WARN" ? "WARN" : "INFO",
          count: toFiniteNumber(flag.count, 0),
          message:
            typeof flag.message === "string" && flag.message.trim()
              ? flag.message
              : "Potential table-impact signal detected.",
          cards: toStringArray(flag.cards)
        }))
    : [];

  return {
    winStyle: {
      primary:
        typeof rawWinStyle.primary === "string" && rawWinStyle.primary
          ? rawWinStyle.primary
          : FALLBACK_RULE_ZERO.winStyle.primary,
      secondary:
        typeof rawWinStyle.secondary === "string" && rawWinStyle.secondary ? rawWinStyle.secondary : null,
      evidence: toStringArray(rawWinStyle.evidence).slice(0, 8)
    },
    speedBand: {
      value:
        typeof rawSpeedBand.value === "string" && rawSpeedBand.value
          ? rawSpeedBand.value
          : FALLBACK_RULE_ZERO.speedBand.value,
      turnBand:
        typeof rawSpeedBand.turnBand === "string" && rawSpeedBand.turnBand
          ? rawSpeedBand.turnBand
          : FALLBACK_RULE_ZERO.speedBand.turnBand,
      explanation:
        typeof rawSpeedBand.explanation === "string" && rawSpeedBand.explanation
          ? rawSpeedBand.explanation
          : FALLBACK_RULE_ZERO.speedBand.explanation
    },
    consistency: {
      score: toFiniteNumber(rawConsistency.score, FALLBACK_RULE_ZERO.consistency.score),
      bucket:
        typeof rawConsistency.bucket === "string" && rawConsistency.bucket
          ? rawConsistency.bucket
          : FALLBACK_RULE_ZERO.consistency.bucket,
      commanderEngine:
        typeof rawConsistency.commanderEngine === "boolean"
          ? rawConsistency.commanderEngine
          : FALLBACK_RULE_ZERO.consistency.commanderEngine,
      explanation:
        typeof rawConsistency.explanation === "string" && rawConsistency.explanation
          ? rawConsistency.explanation
          : FALLBACK_RULE_ZERO.consistency.explanation
    },
    tableImpact: {
      flags,
      extraTurnsCount: toFiniteNumber(
        rawTableImpact.extraTurnsCount,
        FALLBACK_RULE_ZERO.tableImpact.extraTurnsCount
      ),
      massLandDenialCount: toFiniteNumber(
        rawTableImpact.massLandDenialCount,
        FALLBACK_RULE_ZERO.tableImpact.massLandDenialCount
      ),
      staxPiecesCount: toFiniteNumber(
        rawTableImpact.staxPiecesCount,
        FALLBACK_RULE_ZERO.tableImpact.staxPiecesCount
      ),
      freeInteractionCount: toFiniteNumber(
        rawTableImpact.freeInteractionCount,
        FALLBACK_RULE_ZERO.tableImpact.freeInteractionCount
      ),
      fastManaCount: toFiniteNumber(rawTableImpact.fastManaCount, FALLBACK_RULE_ZERO.tableImpact.fastManaCount)
    },
    disclaimer:
      typeof ruleZeroRecord.disclaimer === "string" && ruleZeroRecord.disclaimer
        ? ruleZeroRecord.disclaimer
        : FALLBACK_RULE_ZERO.disclaimer
  };
}

function normalizeRoleBreakdown(result: AnalyzeResponse): RoleBreakdown {
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

  const roleBreakdownRecord = rawRoleBreakdown as Record<string, unknown>;
  const roleKeys = Object.keys(empty) as Array<keyof RoleBreakdown>;

  for (const roleKey of roleKeys) {
    const rows = roleBreakdownRecord[roleKey];
    if (!Array.isArray(rows)) {
      continue;
    }

    empty[roleKey] = rows
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      .map((row) => ({
        name: typeof row.name === "string" ? row.name.trim() : "",
        qty: Math.max(0, Math.floor(toFiniteNumber(row.qty, 0)))
      }))
      .filter((row) => row.name.length > 0 && row.qty > 0);
  }

  return empty;
}

function normalizeTutorSummary(result: AnalyzeResponse): TutorSummary | null {
  const rawTutorSummary = (result as { tutorSummary?: unknown }).tutorSummary;
  if (!rawTutorSummary || typeof rawTutorSummary !== "object") {
    return null;
  }

  const record = rawTutorSummary as Record<string, unknown>;
  const trueTutorBreakdown = Array.isArray(record.trueTutorBreakdown)
    ? record.trueTutorBreakdown
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .map((row) => ({
          name: typeof row.name === "string" ? row.name.trim() : "",
          qty: Math.max(0, Math.floor(toFiniteNumber(row.qty, 0)))
        }))
        .filter((row) => row.name.length > 0 && row.qty > 0)
    : [];
  const tutorSignalOnlyBreakdown = Array.isArray(record.tutorSignalOnlyBreakdown)
    ? record.tutorSignalOnlyBreakdown
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .map((row) => ({
          name: typeof row.name === "string" ? row.name.trim() : "",
          qty: Math.max(0, Math.floor(toFiniteNumber(row.qty, 0)))
        }))
        .filter((row) => row.name.length > 0 && row.qty > 0)
    : [];

  return {
    trueTutors: Math.max(0, Math.floor(toFiniteNumber(record.trueTutors, 0))),
    tutorSignals: Math.max(0, Math.floor(toFiniteNumber(record.tutorSignals, 0))),
    trueTutorBreakdown,
    tutorSignalOnlyBreakdown,
    disclaimer:
      typeof record.disclaimer === "string" && record.disclaimer.trim()
        ? record.disclaimer
        : "True tutors require nonland card search; tutor signals include broader library selection effects."
  };
}

type AnalysisReportProps = {
  result: AnalyzeResponse;
  onOpenPrintingPicker?: (cardName: string) => void;
};

type ReportTabKey = "overview" | "composition" | "simulations" | "cards" | "advanced";
type ComboViewKey = "live" | "conditional" | "potential";

const REPORT_TABS: Array<{ key: ReportTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "composition", label: "Composition" },
  { key: "simulations", label: "Simulations" },
  { key: "cards", label: "Cards" },
  { key: "advanced", label: "Combos" }
];

const COMBO_VIEW_TABS: Array<{ key: ComboViewKey; label: string }> = [
  { key: "live", label: "Live Combos" },
  { key: "conditional", label: "Conditional" },
  { key: "potential", label: "Potential" }
];

/**
 * Read-only report renderer shared by the main analysis page and /report/[hash].
 */
export function AnalysisReport({ result, onOpenPrintingPicker }: AnalysisReportProps) {
  const maxCurveCount = Math.max(...Object.values(result.summary.manaCurve), 0);
  const archetypeReport = result.archetypeReport ?? {
    primary: null,
    secondary: null,
    confidence: 0,
    counts: [],
    disclaimer: "Archetype detection is pattern-based and intended as directional signal."
  };
  const comboReport = result.comboReport ?? {
    detected: [],
    conditional: [],
    potential: [],
    databaseSize: 0,
    disclaimer: "Combo detection uses an offline Commander Spellbook-derived combo snapshot."
  };
  const ruleZero = normalizeRuleZero(result);
  const roleBreakdown = normalizeRoleBreakdown(result);
  const tutorSummary = normalizeTutorSummary(result);
  const commanderInfo = normalizeCommanderInfo(result);
  const deckPrice = normalizeDeckPrice(result);
  const simulationDeck = result.parsedDeck.map((entry) => ({
    name: entry.name,
    qty: entry.qty,
    resolvedName: entry.resolvedName
  }));
  const previewImageByName = new Map<string, string>();
  for (const entry of result.parsedDeck) {
    if (!entry.previewImageUrl) {
      continue;
    }

    const lookupKeys = [entry.name, entry.resolvedName ?? ""];
    for (const lookupKey of lookupKeys) {
      const normalized = normalizeComboText(lookupKey);
      if (!normalized || previewImageByName.has(normalized)) {
        continue;
      }

      previewImageByName.set(normalized, entry.previewImageUrl);
    }
  }

  const getCardPreviewImage = (cardName: string): string | null =>
    previewImageByName.get(normalizeComboText(cardName)) ?? null;
  const [activeTab, setActiveTab] = useState<ReportTabKey>("overview");
  const [activeComboView, setActiveComboView] = useState<ComboViewKey>("live");
  const lastComboCountsRef = useRef<string>("");

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const pageArtUrl = commanderInfo.artUrl ?? commanderInfo.cardImageUrl;
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
  }, [commanderInfo.artUrl, commanderInfo.cardImageUrl]);

  useEffect(() => {
    const countsKey = `${comboReport.detected.length}|${comboReport.conditional.length}|${comboReport.potential.length}`;
    if (countsKey === lastComboCountsRef.current) {
      return;
    }

    lastComboCountsRef.current = countsKey;

    const hasLive = comboReport.detected.length > 0;
    const hasConditional = comboReport.conditional.length > 0;
    const hasPotential = comboReport.potential.length > 0;
    const currentHasItems =
      (activeComboView === "live" && hasLive) ||
      (activeComboView === "conditional" && hasConditional) ||
      (activeComboView === "potential" && hasPotential);

    if (currentHasItems) {
      return;
    }

    if (hasLive) {
      setActiveComboView("live");
      return;
    }

    if (hasConditional) {
      setActiveComboView("conditional");
      return;
    }

    if (hasPotential) {
      setActiveComboView("potential");
    }
  }, [
    activeComboView,
    comboReport.detected.length,
    comboReport.conditional.length,
    comboReport.potential.length
  ]);

  const archetypeLabel =
    archetypeReport.primary?.archetype && archetypeReport.secondary?.archetype
      ? `${archetypeReport.primary.archetype} / ${archetypeReport.secondary.archetype}`
      : archetypeReport.primary?.archetype ?? null;

  const speedStatus =
    ruleZero.speedBand.value === "SLOW"
      ? "LOW"
      : ruleZero.speedBand.value === "MID"
        ? "MED"
        : "HIGH";
  const consistencyStatus =
    ruleZero.consistency.bucket === "LOW"
      ? "LOW"
      : ruleZero.consistency.bucket === "MED"
        ? "MED"
        : "HIGH";
  const impactWarnCount = ruleZero.tableImpact.flags.filter((item) => item.severity === "WARN").length;
  const impactInfoCount = ruleZero.tableImpact.flags.filter((item) => item.severity === "INFO").length;
  const impactStatus = impactWarnCount > 0 ? "LOW" : impactInfoCount > 0 ? "MED" : "OK";

  const tableTalkRows: TableTalkRow[] = [];
  for (const flag of ruleZero.tableImpact.flags) {
    const meta = TABLE_TALK_META[flag.kind] ?? {
      icon: "\u2022",
      label: flag.kind
    };

    tableTalkRows.push({
      key: flag.kind,
      severity: flag.severity,
      label: meta.label,
      icon: meta.icon,
      count: flag.count,
      message: flag.message,
      cards: flag.cards
    });
  }

  if (!tableTalkRows.some((row) => row.key === "tutors") && (tutorSummary?.trueTutors ?? 0) > 0) {
    const tutorCards = (tutorSummary?.trueTutorBreakdown ?? []).map((entry) => entry.name);
    const trueTutorCount = tutorSummary?.trueTutors ?? 0;
    tableTalkRows.push({
      key: "tutors",
      severity: "INFO",
      label: TABLE_TALK_META.tutors.label,
      icon: TABLE_TALK_META.tutors.icon,
      count: trueTutorCount,
      message: `${trueTutorCount} true tutor${trueTutorCount === 1 ? "" : "s"} detected.`,
      cards: tutorCards
    });
  }

  const tableTalkOrder = ["fastMana", "tutors", "extraTurns", "staxPieces", "massLandDenial", "freeInteraction"];
  tableTalkRows.sort((a, b) => {
    const aIndex = tableTalkOrder.indexOf(a.key);
    const bIndex = tableTalkOrder.indexOf(b.key);
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    return a.label.localeCompare(b.label);
  });

  return (
    <div className="results">
      {commanderInfo.name ? (
        <CommanderHeroHeader
          commander={{
            name: commanderInfo.name,
            colorIdentity: commanderInfo.colorIdentity,
            cmc: commanderInfo.cmc,
            artUrl: commanderInfo.artUrl,
            cardImageUrl: commanderInfo.cardImageUrl,
            setCode: commanderInfo.setCode,
            collectorNumber: commanderInfo.collectorNumber,
            printingId: commanderInfo.printingId
          }}
          archetypeLabel={archetypeLabel}
          bracketLabel={`Bracket ${result.bracketReport.estimatedBracket} - ${result.bracketReport.estimatedLabel}`}
        />
      ) : null}

      <section id="report-panel-validation">
        <Checks checks={result.checks} rulesEngine={result.rulesEngine} />
      </section>

      <section className="report-tabs-shell">
        <div className="report-tabs" role="tablist" aria-label="Analysis report sections">
          {REPORT_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                id={`report-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`report-panel-${tab.key}`}
                className={`report-tab${isActive ? " report-tab-active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === "overview" ? (
        <>
          <section className="player-snapshot" id="report-panel-overview" role="tabpanel">
            <h2>Player Snapshot</h2>
            <ul>
              <li>
                Primary win: <strong>{labelForWinStyle(ruleZero.winStyle.primary)}</strong>
                {ruleZero.winStyle.secondary ? (
                  <span> (backup: {labelForWinStyle(ruleZero.winStyle.secondary)})</span>
                ) : null}
              </li>
              <li>
                Estimated speed:{" "}
                <strong>
                  {labelForSpeedBand(ruleZero.speedBand.value)} ({ruleZero.speedBand.turnBand})
                </strong>
              </li>
              <li>
                Consistency:{" "}
                <strong>
                  {ruleZero.consistency.bucket} ({ruleZero.consistency.score})
                </strong>
              </li>
            </ul>
            <div className="snapshot-badges">
              <span className={`status-badge ${getStatusMeta(speedStatus).className}`}>
                {getStatusMeta(speedStatus).icon} Speed {getStatusMeta(speedStatus).label}
              </span>
              <span className={`status-badge ${getStatusMeta(consistencyStatus).className}`}>
                {getStatusMeta(consistencyStatus).icon} Consistency {getStatusMeta(consistencyStatus).label}
              </span>
              <span className={`status-badge ${getStatusMeta(impactStatus).className}`}>
                {getStatusMeta(impactStatus).icon} Table Impact {getStatusMeta(impactStatus).label}
              </span>
            </div>
            <p className="snapshot-note">{ruleZero.speedBand.explanation}</p>
            <div className="technical-group">
              <h3>Commander Bracket Detail</h3>
              <p>
                Estimated bracket:{" "}
                <strong>
                  {result.bracketReport.estimatedBracket} ({result.bracketReport.estimatedLabel})
                </strong>
              </p>
              <p className="muted">{result.bracketReport.explanation}</p>
              {result.bracketReport.gameChangersFound.length > 0 ? (
                <ul>
                  {result.bracketReport.gameChangersFound.map((card) => (
                    <li key={card.name}>
                      <CardNameHover name={card.name} />
                      {card.qty > 1 ? ` x${card.qty}` : ""}{" "}
                      <span className="gc-badge">{"\u2B50"} Game Changer</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.bracketReport.warnings.length > 0 ? (
                <ul className="warnings">
                  {result.bracketReport.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              <p className="muted">{result.bracketReport.disclaimer}</p>
            </div>
          </section>

          <section>
            <h2>Table Talk Flags</h2>
            <p className="table-talk-intro muted">
              Rule 0 Snapshot is a quick read of table pressure signals: fast mana, true tutors, free interaction,
              extra turns, and lock pressure.
            </p>

            {tableTalkRows.length === 0 ? (
              <p className="muted">No major table talk flags detected from current signal set.</p>
            ) : (
              <div className="table-talk-grid">
                {tableTalkRows.map((row) => {
                  const status = row.severity === "WARN" ? "LOW" : "MED";
                  const statusMeta = getStatusMeta(status);

                  return (
                    <div className="table-talk-item" key={row.key}>
                      <div className="table-talk-head">
                        <span className="table-talk-icon">{row.icon}</span>
                        <strong>{row.label}</strong>
                        <span className={`status-badge ${statusMeta.className}`}>
                          {statusMeta.icon} {statusMeta.label}
                        </span>
                      </div>
                      <p className="muted">
                        {row.message} {row.count > 0 ? `(x${row.count})` : ""}
                      </p>
                  {row.cards.length > 0 ? (
                    <div className="combo-card-strip table-talk-card-strip">
                      {row.cards.map((cardName, index) => (
                        <ComboCardTile
                          key={`${row.key}-${cardName}-${index}`}
                          name={cardName}
                          imageUrl={getCardPreviewImage(cardName)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
              </div>
            )}
          </section>

          <section>
            <h2>Deck Basics</h2>
            <div className="summary-grid">
              <div className="summary-card">
                <span>Deck Size</span>
                <strong>{result.summary.deckSize}</strong>
              </div>
              <div className="summary-card">
                <span>Unique Cards</span>
                <strong>{result.summary.uniqueCards}</strong>
              </div>
              <div className="summary-card">
                <span>Avg Mana Value</span>
                <strong>{result.summary.averageManaValue.toFixed(2)}</strong>
              </div>
              <div className="summary-card">
                <span>Colors</span>
                <strong className="summary-color-icons">
                  <ColorIdentityIcons identity={result.summary.colors} size={18} />
                </strong>
              </div>
              <div className="summary-card">
                <span>Deck Price (USD)</span>
                <strong>{deckPrice ? formatUsd(deckPrice.totals.usd) : "N/A"}</strong>
              </div>
            </div>
            {deckPrice ? (
              <p className="muted deck-price-meta">
                Foil {formatUsd(deckPrice.totals.usdFoil)} | Etched {formatUsd(deckPrice.totals.usdEtched)} |
                MTGO {formatTix(deckPrice.totals.tix)} | USD coverage{" "}
                {Math.round(deckPrice.coverage.usd * 100)}% ({deckPrice.pricedCardQty.usd}/{deckPrice.totalKnownCardQty}
                {" "}cards priced) | Mode{" "}
                {deckPrice.pricingMode === "decklist-set" ? "Decklist [SET] tags" : "Oracle default"}
                {deckPrice.pricingMode === "decklist-set"
                  ? ` | Set matches ${deckPrice.setMatchedCardQty}/${deckPrice.setTaggedCardQty} tagged cards`
                  : ""}
              </p>
            ) : null}
            {commanderInfo.name ? (
              <p>
                Commander:{" "}
                <strong>
                  <CardNameHover name={commanderInfo.name} />
                </strong>{" "}
                <ManaCost manaCost={commanderInfo.manaCost} size={16} className="commander-inline-mana" />
              </p>
            ) : (
              <p className="muted">
                No commander selected yet. If no Commander section is present in your list, select one in the input
                panel.
              </p>
            )}
          </section>
        </>
      ) : null}

      {activeTab === "composition" ? (
        <section id="report-panel-composition" role="tabpanel">
        <h2>Core Composition</h2>
        <p className="muted">
          Role tags use the shared rules engine classifier (behavior templates + structured oracle patterns).
        </p>
        <RoleBars
          roles={result.roles}
          roleBreakdown={roleBreakdown}
          getCardPreviewImage={getCardPreviewImage}
        />
        {tutorSummary ? (
          <div className="technical-group">
            <h3>Tutor Classification</h3>
            <p>
              True tutors: <strong>{tutorSummary.trueTutors}</strong> | Tutor-signal cards:{" "}
              <strong>{Math.max(0, tutorSummary.tutorSignals - tutorSummary.trueTutors)}</strong>
            </p>
            {tutorSummary.trueTutorBreakdown.length > 0 ? (
              <p>
                True tutor cards:{" "}
                {tutorSummary.trueTutorBreakdown
                  .slice(0, 16)
                  .map((entry) => `${entry.name}${entry.qty > 1 ? ` x${entry.qty}` : ""}`)
                  .join(", ")}
              </p>
            ) : null}
            {tutorSummary.tutorSignalOnlyBreakdown.length > 0 ? (
              <p className="muted">
                Tutor-signal only (not counted as true tutors):{" "}
                {tutorSummary.tutorSignalOnlyBreakdown
                  .slice(0, 16)
                  .map((entry) => `${entry.name}${entry.qty > 1 ? ` x${entry.qty}` : ""}`)
                  .join(", ")}
              </p>
            ) : null}
            <p className="muted">{tutorSummary.disclaimer}</p>
          </div>
        ) : null}

        <div className="technical-group">
          <h3>Mana Curve</h3>
          <div className="curve">
            {CURVE_ORDER.map((bucket) => {
              const value = result.summary.manaCurve[bucket] ?? 0;
              const width = maxCurveCount > 0 ? (value / maxCurveCount) * 100 : 0;
              return (
                <div className="curve-row" key={bucket}>
                  <span className="curve-label">{bucket}</span>
                  <div className="curve-bar-wrap">
                    <div className="curve-bar" style={{ width: `${width}%` }} />
                  </div>
                  <span className="curve-value">{value}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="technical-group">
          <h3>Types</h3>
          <div className="chips">
            {Object.entries(result.summary.types).map(([type, count]) => (
              <span key={type} className="chip">
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
        </section>
      ) : null}

      {activeTab === "composition" ? (
        <>
          <RecommendedCounts rows={result.deckHealth.rows} />
          <DeckHealth report={result.deckHealth} />
          <ImprovementSuggestions
            suggestions={result.improvementSuggestions}
            getCardPreviewImage={getCardPreviewImage}
          />
        </>
      ) : null}
      {activeTab === "simulations" ? (
        <div id="report-panel-simulations" role="tabpanel">
          <SimulationsSection
            deck={simulationDeck}
            commanderName={commanderInfo.name}
            initialSummary={result.openingHandSimulation ?? null}
          />
        </div>
      ) : null}

      {activeTab === "cards" ? (
        <section id="report-panel-cards" role="tabpanel">
        <h2>Detected Cards</h2>
        <p className="muted">
          Full preview tile set for resolved deck cards. TCGplayer numbers come from Scryfall price fields;
          Card Kingdom is linked separately.
        </p>
        <div className="detected-cards-grid">
          {result.parsedDeck.map((entry) => {
            const usdPrice = entry.prices?.usd ?? null;
            const usdFoilPrice = entry.prices?.usdFoil ?? null;
            const usdEtchedPrice = entry.prices?.usdEtched ?? null;
            const tcgplayerLink = entry.sellerLinks?.tcgplayer ?? null;
            const cardName = cardLabel(entry);
            const cardKingdomLink = entry.sellerLinks?.cardKingdom ?? cardKingdomSearchUrl(cardName);

            return (
              <article className="detected-card-tile" key={entry.name.toLowerCase()}>
                {entry.previewImageUrl ? (
                  <div
                    className="detected-card-image"
                    style={{ backgroundImage: `url("${entry.previewImageUrl}")` }}
                  />
                ) : (
                  <div className="detected-card-image-fallback">
                    <span>{cardName}</span>
                  </div>
                )}
                <div className="detected-card-meta">
                  <p className="detected-card-name">
                    <CardNameHover name={cardName} />
                  </p>
                  <p className="detected-card-qty">Qty {entry.qty}</p>
                  <div className="detected-card-badges">
                    {entry.isGameChanger ? <span className="gc-badge">{"\u2B50"} Game Changer</span> : null}
                    {!entry.known ? <span className="unknown-badge">Unknown</span> : null}
                  </div>
                  <div className="detected-card-pricing">
                    <p className="detected-card-price-row">
                      <span>TCGplayer</span>
                      <strong>{formatUsd(usdPrice)}</strong>
                    </p>
                    {(usdFoilPrice !== null || usdEtchedPrice !== null) ? (
                      <p className="muted detected-card-price-note">
                        Foil {formatUsd(usdFoilPrice)} | Etched {formatUsd(usdEtchedPrice)}
                      </p>
                    ) : null}
                    <div className="detected-card-sellers">
                      {tcgplayerLink ? (
                        <a href={tcgplayerLink} target="_blank" rel="noreferrer noopener">
                          TCGplayer
                        </a>
                      ) : (
                        <span className="muted">TCGplayer link unavailable</span>
                      )}
                      {cardKingdomLink ? (
                        <a href={cardKingdomLink} target="_blank" rel="noreferrer noopener">
                          Card Kingdom
                        </a>
                      ) : (
                        <span className="muted">Card Kingdom link unavailable</span>
                      )}
                    </div>
                    {onOpenPrintingPicker ? (
                      <button
                        type="button"
                        className="btn-tertiary detected-card-printings-btn"
                        onClick={() => onOpenPrintingPicker(entry.name)}
                      >
                        Select Printing
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        </section>
      ) : null}

      {activeTab === "advanced" ? (
        <section id="report-panel-advanced" role="tabpanel">
          <h2>Combo Detection</h2>
          <div className="technical-group">
          <div className="combo-view-tabs" role="tablist" aria-label="Combo detection categories">
            {COMBO_VIEW_TABS.map((viewTab) => {
              const count =
                viewTab.key === "live"
                  ? comboReport.detected.length
                  : viewTab.key === "conditional"
                    ? comboReport.conditional.length
                    : comboReport.potential.length;
              const isActive = activeComboView === viewTab.key;

              return (
                <button
                  key={viewTab.key}
                  id={`combo-view-tab-${viewTab.key}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`combo-view-panel-${viewTab.key}`}
                  className={`combo-view-tab${isActive ? " combo-view-tab-active" : ""}`}
                  onClick={() => setActiveComboView(viewTab.key)}
                >
                  <span>{viewTab.label}</span>
                  <span className="combo-view-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          <div
            hidden={activeComboView !== "live"}
            role="tabpanel"
            id="combo-view-panel-live"
            aria-labelledby="combo-view-tab-live"
          >
            {comboReport.detected.length === 0 ? (
              <p className="muted">No live combos detected from the current combo database.</p>
            ) : (
              <ul>
                {comboReport.detected.map((combo) => (
                  <li key={`${combo.comboName}-${combo.commanderSpellbookUrl}`}>
                    <strong>{combo.comboName}</strong>{" "}
                    <a href={combo.commanderSpellbookUrl} target="_blank" rel="noreferrer noopener">
                      [Commander Spellbook]
                    </a>
                    <div className="combo-card-strip">
                      {combo.cards.map((cardName, index) => (
                        <ComboCardTile
                          key={`${combo.comboName}-${combo.commanderSpellbookUrl}-${cardName}-${index}`}
                          name={cardName}
                          imageUrl={getCardPreviewImage(cardName)}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            hidden={activeComboView !== "conditional"}
            role="tabpanel"
            id="combo-view-panel-conditional"
            aria-labelledby="combo-view-tab-conditional"
          >
            {comboReport.conditional.length === 0 ? (
              <p className="muted">No conditional combos currently detected.</p>
            ) : (
              <ul>
                {comboReport.conditional.map((combo) => (
                  <li key={`conditional-${combo.comboName}-${combo.commanderSpellbookUrl}`}>
                    <strong>{combo.comboName}</strong>{" "}
                    <a href={combo.commanderSpellbookUrl} target="_blank" rel="noreferrer noopener">
                      [Commander Spellbook]
                    </a>
                    <div className="combo-card-strip">
                      {combo.cards.map((cardName, index) => (
                        <ComboCardTile
                          key={`conditional-${combo.comboName}-${combo.commanderSpellbookUrl}-${cardName}-${index}`}
                          name={cardName}
                          imageUrl={getCardPreviewImage(cardName)}
                        />
                      ))}
                    </div>
                    {combo.requires.length > 0 ? (
                      <span className="muted"> | Requires: {combo.requires.join("; ")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            hidden={activeComboView !== "potential"}
            role="tabpanel"
            id="combo-view-panel-potential"
            aria-labelledby="combo-view-tab-potential"
          >
            {comboReport.potential.length === 0 ? (
              <p className="muted">No potential combos found for current near-miss thresholds.</p>
            ) : (
              <ul>
                {comboReport.potential.map((combo) => {
                  const missingNames = new Set(combo.missingCards.map((cardName) => normalizeComboText(cardName)));

                  return (
                    <li key={`potential-${combo.comboName}-${combo.commanderSpellbookUrl}`}>
                      <strong>{combo.comboName}</strong>{" "}
                      <a href={combo.commanderSpellbookUrl} target="_blank" rel="noreferrer noopener">
                        [Commander Spellbook]
                      </a>{" "}
                      <span className="muted">
                        | Missing: {combo.missingCards.join(" + ")} | Matched: {combo.matchCount}/{combo.cards.length}
                      </span>
                      <div className="combo-card-strip">
                        {combo.cards.map((cardName, index) => (
                          <ComboCardTile
                            key={`potential-${combo.comboName}-${combo.commanderSpellbookUrl}-${cardName}-${index}`}
                            name={cardName}
                            imageUrl={getCardPreviewImage(cardName)}
                            missing={missingNames.has(normalizeComboText(cardName))}
                          />
                        ))}
                      </div>
                      {combo.isConditional && combo.requires.length > 0 ? (
                        <span className="muted"> | Requires: {combo.requires.join("; ")}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="muted">
            Live combos: {comboReport.detected.length} | Conditional combos: {comboReport.conditional.length} |
            Potential shown: {comboReport.potential.length} / {comboReport.databaseSize} tracked.
          </p>
          <p className="muted">{comboReport.disclaimer}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}


