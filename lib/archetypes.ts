import type { DeckCard } from "./types";

export type ArchetypeMatch = {
  archetype: string;
  tagCount: number;
  confidence: number;
};

export type DeckArchetypeReport = {
  primary: ArchetypeMatch | null;
  secondary: ArchetypeMatch | null;
  confidence: number;
  counts: ArchetypeMatch[];
  disclaimer: string;
};

type ArchetypeRule = {
  label: string;
  patterns: RegExp[];
};

const ARCHETYPE_RULES: ArchetypeRule[] = [
  {
    label: "Tokens",
    patterns: [
      /create [^.]{0,60}\btoken\b/,
      /\bpopulate\b/,
      /\bamass\b/
    ]
  },
  {
    label: "Aristocrats",
    patterns: [
      /\bsacrifice (?:a|another|one or more)?\s*creature\b/,
      /\bwhenever [^.]{0,50}\bdies\b/,
      /\bwhenever you sacrifice\b/
    ]
  },
  {
    label: "Counters",
    patterns: [
      /\+1\/\+1 counter/,
      /\bproliferate\b/,
      /\bput (?:a|an|one|two|three) [^.]{0,30}\bcounter\b/
    ]
  },
  {
    label: "Graveyard",
    patterns: [
      /\breturn [^.]{0,60}\bfrom your graveyard\b/,
      /\bfrom your graveyard to (?:the battlefield|your hand)\b/,
      /\breanimate\b/
    ]
  },
  {
    label: "Spellslinger",
    patterns: [
      /\bwhenever you cast an instant or sorcery\b/,
      /\binstant or sorcery spell\b/,
      /\bcopy target instant or sorcery\b/,
      /\bmagecraft\b/
    ]
  },
  {
    label: "Voltron",
    patterns: [
      /\bequip\b/,
      /\bequipped creature\b/,
      /\baura [^.]{0,30}\battached\b/
    ]
  },
  {
    label: "Artifacts",
    patterns: [
      /\bartifact enters the battlefield\b/,
      /\bwhenever an artifact enters the battlefield\b/,
      /\bartifact spell\b/,
      /\bfor each artifact you control\b/
    ]
  },
  {
    label: "Enchantress",
    patterns: [
      /\benchantment enters the battlefield\b/,
      /\bwhenever an enchantment enters the battlefield\b/,
      /\bwhenever you cast an enchantment spell\b/,
      /\bconstellation\b/
    ]
  }
];

function toConfidence(tagCount: number, deckSize: number): number {
  if (deckSize <= 0 || tagCount <= 0) {
    return 0;
  }

  return Number((tagCount / deckSize).toFixed(4));
}

/**
 * Detects deck archetypes using oracle-text keyword tags and returns top matches.
 */
export function computeDeckArchetypes(deckCards: DeckCard[], deckSize: number): DeckArchetypeReport {
  const counts = new Map<string, number>(ARCHETYPE_RULES.map((rule) => [rule.label, 0]));

  for (const entry of deckCards) {
    const oracleText = entry.card.oracle_text.toLowerCase();

    for (const rule of ARCHETYPE_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(oracleText))) {
        counts.set(rule.label, (counts.get(rule.label) ?? 0) + entry.qty);
      }
    }
  }

  const ranked = [...counts.entries()]
    .filter(([, tagCount]) => tagCount > 0)
    .map(([archetype, tagCount]) => ({
      archetype,
      tagCount,
      confidence: toConfidence(tagCount, deckSize)
    }))
    .sort((a, b) => b.tagCount - a.tagCount || a.archetype.localeCompare(b.archetype));

  const primary = ranked[0] ?? null;
  const secondary = ranked[1] ?? null;

  return {
    primary,
    secondary,
    confidence: primary ? primary.confidence : 0,
    counts: ranked,
    disclaimer: "Archetype detection is keyword-based and heuristic."
  };
}

