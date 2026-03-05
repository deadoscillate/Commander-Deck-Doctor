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
      /\bamass\b/,
      /\bfor each token you control\b/,
      /\btoken creature\b/
    ]
  },
  {
    label: "Aristocrats",
    patterns: [
      /\bsacrifice (?:a|another|one or more)?\s*creature\b/,
      /\bwhenever [^.]{0,50}\bdies\b/,
      /\bwhenever you sacrifice\b/,
      /\bwhen(?:ever)? [^.]{0,50}\bis put into a graveyard from the battlefield\b/
    ]
  },
  {
    label: "Counters",
    patterns: [
      /\+1\/\+1 counter/,
      /\bproliferate\b/,
      /\bput (?:a|an|one|two|three) [^.]{0,30}\bcounter\b/,
      /\bremove [^.]{0,30}\bcounter\b/,
      /\bdouble the number of [^.]{0,30}\bcounters\b/
    ]
  },
  {
    label: "Graveyard",
    patterns: [
      /\breturn [^.]{0,60}\bfrom your graveyard\b/,
      /\bfrom your graveyard to (?:the battlefield|your hand)\b/,
      /\breanimate\b/,
      /\bmill\b/,
      /\bdelirium\b/,
      /\bescape\b/
    ]
  },
  {
    label: "Reanimator",
    patterns: [
      /\breturn target creature card from your graveyard to the battlefield\b/,
      /\bput target creature card from a graveyard onto the battlefield\b/,
      /\beach player returns [^.]{0,40}\bcreature card\b/,
      /\banimate dead\b/
    ]
  },
  {
    label: "Spellslinger",
    patterns: [
      /\bwhenever you cast an instant or sorcery\b/,
      /\binstant or sorcery spell\b/,
      /\bcopy target instant or sorcery\b/,
      /\bmagecraft\b/,
      /\bprowess\b/,
      /\bwhenever you cast your second spell each turn\b/
    ]
  },
  {
    label: "Storm",
    patterns: [
      /\bstorm\b/,
      /\bcopy this spell for each spell cast before it this turn\b/,
      /\bcast [^.]{0,40}from your graveyard this turn\b/
    ]
  },
  {
    label: "Voltron",
    patterns: [
      /\bequip\b/,
      /\bequipped creature\b/,
      /\baura [^.]{0,30}\battached\b/,
      /\bcommander creatures? you control\b/,
      /\bwhenever enchanted creature\b/
    ]
  },
  {
    label: "Artifacts",
    patterns: [
      /\bartifact enters the battlefield\b/,
      /\bwhenever an artifact enters the battlefield\b/,
      /\bartifact spell\b/,
      /\bfor each artifact you control\b/,
      /\baffinity for artifacts\b/,
      /\bmetalcraft\b/
    ]
  },
  {
    label: "Enchantress",
    patterns: [
      /\benchantment enters the battlefield\b/,
      /\bwhenever an enchantment enters the battlefield\b/,
      /\bwhenever you cast an enchantment spell\b/,
      /\bconstellation\b/,
      /\baura\b/
    ]
  },
  {
    label: "Landfall",
    patterns: [
      /\blandfall\b/,
      /\bwhenever a land enters the battlefield under your control\b/,
      /\bplay an additional land\b/,
      /\blands you control\b/
    ]
  },
  {
    label: "Treasure",
    patterns: [
      /\btreasure token\b/,
      /\bcreate [^.]{0,20}\btreasure\b/,
      /\bsacrifice a treasure\b/
    ]
  },
  {
    label: "Blink",
    patterns: [
      /\bexile [^.]{0,80} then return (it|that card) to the battlefield\b/,
      /\bexile target [^.]{0,80} return it to the battlefield\b/,
      /\bflicker\b/,
      /\bblinks?\b/
    ]
  },
  {
    label: "Lifegain",
    patterns: [
      /\byou gain \d+ life\b/,
      /\bwhenever you gain life\b/,
      /\blifelink\b/,
      /\beach opponent loses [^.]{0,20}you gain\b/
    ]
  },
  {
    label: "Mill",
    patterns: [
      /\bmill\b/,
      /\bput the top [^.]{0,60}cards? of [^.]{0,30}library into\b/,
      /\bwhenever [^.]{0,50}draws a card\b[\s\S]{0,50}\bmill\b/
    ]
  },
  {
    label: "Discard",
    patterns: [
      /\btarget player discards\b/,
      /\beach opponent discards\b/,
      /\bwhenever an opponent discards\b/,
      /\bmadness\b/
    ]
  },
  {
    label: "Wheels",
    patterns: [
      /\beach player discards (their|his or her) hand\b/,
      /\bthen draws seven cards\b/,
      /\bthen draw that many cards\b/,
      /\bwheel\b/
    ]
  },
  {
    label: "Stax",
    patterns: [
      /\bopponents can't\b/,
      /\bplayers can't\b/,
      /\bcan't cast more than\b/,
      /\bdon't untap\b/,
      /\bspells your opponents cast cost\b/
    ]
  },
  {
    label: "Extra Turns",
    patterns: [
      /\btake an extra turn after this one\b/,
      /\bif this spell was cast from your hand, take an extra turn\b/
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
    const oracleTextBlocks = [
      entry.card.oracle_text,
      ...entry.card.card_faces.map((face) => face.oracle_text ?? "")
    ];
    const oracleText = oracleTextBlocks.join("\n").toLowerCase();

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
