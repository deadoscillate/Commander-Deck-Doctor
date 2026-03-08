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

type ArchetypeSignal = {
  pattern: RegExp;
  weight: number;
};

type ArchetypeRule = {
  label: string;
  minimumScore: number;
  minimumMatchedCards: number;
  signals: ArchetypeSignal[];
};

const MAX_ARCHETYPE_SCORE_PER_CARD = 3.5;

function signal(pattern: RegExp, weight: number): ArchetypeSignal {
  return {
    pattern,
    weight
  };
}

const ARCHETYPE_RULES: ArchetypeRule[] = [
  {
    label: "Tokens",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/create [^.]{0,80}\btoken\b/, 2),
      signal(/\bpopulate\b/, 2.5),
      signal(/\bamass\b/, 2),
      signal(/\bfor each token you control\b/, 1.5),
      signal(/\btoken creature\b/, 1.5)
    ]
  },
  {
    label: "Go Wide",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bcreate\b[^.]{0,80}\b1\/1\b/, 1.5),
      signal(/\bwhenever one or more creatures you control attack\b/, 1.5),
      signal(/\battacking creatures?\b/, 1.5),
      signal(/\bcreatures you control get \+\d+\/\+\d+\b/, 1.5)
    ]
  },
  {
    label: "Aristocrats",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bsacrifice (?:a|another|one or more)?\s*creature\b/, 2),
      signal(/\bwhenever [^.]{0,60}\bdies\b/, 1.5),
      signal(/\bwhenever you sacrifice\b/, 2),
      signal(/\bwhen(?:ever)? [^.]{0,60}\bis put into a graveyard from the battlefield\b/, 1.5)
    ]
  },
  {
    label: "Sacrifice Value",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bas an additional cost to cast\b[^.]{0,80}\bsacrifice\b/, 2),
      signal(/\bsacrifice another\b/, 1.5),
      signal(/\bwhenever you sacrifice\b/, 1.5),
      signal(/\bif you sacrificed\b/, 1)
    ]
  },
  {
    label: "Counters",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\+1\/\+1 counter/, 2),
      signal(/\bproliferate\b/, 1.5),
      signal(/\bput (?:a|an|one|two|three|x) [^.]{0,40}\bcounter\b/, 1.5),
      signal(/\bremove [^.]{0,40}\bcounter\b/, 1),
      signal(/\bdouble the number of [^.]{0,40}\bcounters\b/, 2)
    ]
  },
  {
    label: "Graveyard",
    minimumScore: 3,
    minimumMatchedCards: 2,
    signals: [
      signal(/\breturn [^.]{0,80}\bfrom your graveyard\b/, 1.5),
      signal(/\bfrom your graveyard to (?:the battlefield|your hand)\b/, 2),
      signal(/\breanimate\b/, 2),
      signal(/\bdelirium\b/, 1.5),
      signal(/\bescape\b/, 1.5)
    ]
  },
  {
    label: "Self-Mill",
    minimumScore: 3,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bmill\b/, 1.5),
      signal(/\bput the top\b[^.]{0,80}\bof your library into your graveyard\b/, 2),
      signal(/\bsurveil\b/, 1.5),
      signal(/\bdredge\b/, 2)
    ]
  },
  {
    label: "Reanimator",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\breturn target creature card from your graveyard to the battlefield\b/, 2.5),
      signal(/\bput target creature card from a graveyard onto the battlefield\b/, 2.5),
      signal(/\beach player returns [^.]{0,60}\bcreature card\b/, 2),
      signal(/\banimate dead\b/, 2.5),
      signal(/\breturn target creature card from your graveyard to your hand\b/, 1.5)
    ]
  },
  {
    label: "Blink",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bexile [^.]{0,100} then return (it|that card) to the battlefield\b/, 2.5),
      signal(/\bexile target [^.]{0,100} return it to the battlefield\b/, 2.5),
      signal(/\bflicker\b/, 2),
      signal(/\bblinks?\b/, 1.5)
    ]
  },
  {
    label: "Copy/Clone",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\benters? as a copy of\b/, 2),
      signal(/\bcreate\b[^.]{0,80}\btoken that's a copy\b/, 2),
      signal(/\bcopy target (?:permanent|artifact|creature|instant|sorcery|spell)\b/, 1.5),
      signal(/\bexcept it isn't legendary\b/, 1.5)
    ]
  },
  {
    label: "Theft",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bgain control of target\b/, 2),
      signal(/\bgain control of\b[^.]{0,100}\bfor as long as\b/, 2),
      signal(/\bexchange control of\b/, 2),
      signal(/\byou may cast\b[^.]{0,100}\bfrom an opponent'?s\b/, 1.5)
    ]
  },
  {
    label: "Spellslinger",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bwhenever you cast an instant or sorcery\b/, 2),
      signal(/\binstant or sorcery spell\b/, 1.5),
      signal(/\bcopy target instant or sorcery\b/, 1.5),
      signal(/\bmagecraft\b/, 2),
      signal(/\bprowess\b/, 1),
      signal(/\bwhenever you cast your second spell each turn\b/, 1.5),
      signal(/\bwhenever you cast a noncreature spell\b/, 1.5)
    ]
  },
  {
    label: "Control",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bcounter target spell\b/, 2),
      signal(/\breturn target\b[^.]{0,80}\bto (?:its|their) owner'?s hand\b/, 1.5),
      signal(/\bdestroy target\b/, 0.5),
      signal(/\bexile target\b/, 0.5),
      signal(/\bit doesn't untap during\b/, 2)
    ]
  },
  {
    label: "Storm",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bstorm\b/, 3),
      signal(/\bcopy this spell for each spell cast before it this turn\b/, 3),
      signal(/\bcast [^.]{0,80}from your graveyard this turn\b/, 1.5)
    ]
  },
  {
    label: "Cascade",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bcascade\b/, 2.5),
      signal(/\bdiscover \d+\b/, 2.5),
      signal(/\bexile cards from the top of your library until you exile a nonland\b/, 2.5),
      signal(/\bwhen you cast this spell, exile cards from the top of your library until\b/, 2)
    ]
  },
  {
    label: "Extra Turns",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\btake an extra turn after this one\b/, 3),
      signal(/\bif this spell was cast from your hand, take an extra turn\b/, 3)
    ]
  },
  {
    label: "Burn",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bdeals? \d+ damage to any target\b/, 1),
      signal(/\bdeals? \d+ damage to each opponent\b/, 2),
      signal(/\bwhenever an opponent casts a spell\b[^.]{0,80}\bdamage\b/, 1.5),
      signal(/\bnoncombat damage\b/, 1.5)
    ]
  },
  {
    label: "Voltron",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bequip\b/, 1),
      signal(/\bequipped creature\b/, 1),
      signal(/\baura [^.]{0,40}\battached\b/, 1),
      signal(/\bwhenever enchanted creature\b/, 1),
      signal(/\btarget creature gets \+\d+\/\+\d+\b/, 1)
    ]
  },
  {
    label: "Auras",
    minimumScore: 3,
    minimumMatchedCards: 2,
    signals: [
      signal(/\benchant creature\b/, 1),
      signal(/\bwhenever an aura enters the battlefield\b/, 2),
      signal(/\bsearch your library for an aura\b/, 2),
      signal(/\benchanted creature gets\b/, 1)
    ]
  },
  {
    label: "Equipment",
    minimumScore: 3,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bequip\b/, 1.5),
      signal(/\bequipped creature\b/, 1.5),
      signal(/\bsearch your library for an equipment\b/, 2),
      signal(/\bfor each equipment\b/, 1.5)
    ]
  },
  {
    label: "Artifacts",
    minimumScore: 3,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bartifact enters the battlefield\b/, 2),
      signal(/\bwhenever an artifact enters the battlefield\b/, 2),
      signal(/\bartifact spell\b/, 1.5),
      signal(/\bfor each artifact you control\b/, 1),
      signal(/\baffinity for artifacts\b/, 2),
      signal(/\bmetalcraft\b/, 2)
    ]
  },
  {
    label: "Enchantress",
    minimumScore: 3,
    minimumMatchedCards: 2,
    signals: [
      signal(/\benchantment enters the battlefield\b/, 2),
      signal(/\bwhenever an enchantment enters the battlefield\b/, 2),
      signal(/\bwhenever you cast an enchantment spell\b/, 2),
      signal(/\bconstellation\b/, 2),
      signal(/\baura\b/, 0.5)
    ]
  },
  {
    label: "Landfall",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\blandfall\b/, 2.5),
      signal(/\bwhenever a land enters the battlefield under your control\b/, 2),
      signal(/\bplay an additional land\b/, 1.5),
      signal(/\blands you control\b/, 0.5)
    ]
  },
  {
    label: "Lands Matter",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\byou may play an additional land\b/, 1.5),
      signal(/\byou may play lands from your graveyard\b/, 2.5),
      signal(/\breturn target land card from your graveyard\b/, 2),
      signal(/\bsacrifice a land\b/, 1.5),
      signal(/\bfor each land you control\b/, 1)
    ]
  },
  {
    label: "Big Mana",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bwhenever you tap a land for mana, add\b/, 2.5),
      signal(/\bdouble\b[^.]{0,60}\bmana\b/, 2.5),
      signal(/\badd \{[wubrgc]\}\{[wubrgc]\}\{[wubrgc]\}/, 1.5),
      signal(/\bfor each land you control, add\b/, 2)
    ]
  },
  {
    label: "Treasure",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\btreasure token\b/, 2),
      signal(/\bcreate [^.]{0,30}\btreasure\b/, 2),
      signal(/\bsacrifice a treasure\b/, 1)
    ]
  },
  {
    label: "Clues/Food/Blood",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bclue token\b/, 2),
      signal(/\bfood token\b/, 2),
      signal(/\bblood token\b/, 2),
      signal(/\binvestigate\b/, 2),
      signal(/\bcreate [^.]{0,40}\b(?:clue|food|blood)\b/, 2)
    ]
  },
  {
    label: "Lifegain",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\byou gain \d+ life\b/, 1),
      signal(/\bwhenever you gain life\b/, 2),
      signal(/\blifelink\b/, 1),
      signal(/\beach opponent loses [^.]{0,30}you gain\b/, 2)
    ]
  },
  {
    label: "Life Drain",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\beach opponent loses\b[^.]{0,40}\blife\b/, 2),
      signal(/\bwhenever an opponent loses life\b/, 1.5),
      signal(/\bopponents lose\b[^.]{0,40}\byou gain\b/, 2),
      signal(/\bextort\b/, 2)
    ]
  },
  {
    label: "Group Slug",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\beach player loses\b/, 2),
      signal(/\bat the beginning of each player'?s upkeep\b[^.]{0,80}\blose\b/, 2),
      signal(/\bwhenever a player casts a spell\b[^.]{0,80}\bdamage to that player\b/, 2),
      signal(/\bwhenever a land enters the battlefield\b[^.]{0,80}\bdamage\b/, 2)
    ]
  },
  {
    label: "Group Hug",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\beach player draws\b/, 2),
      signal(/\beach player may\b/, 1.5),
      signal(/\bwhenever an opponent draws a card\b/, 1),
      signal(/\bat the beginning of each player's draw step\b/, 1.5)
    ]
  },
  {
    label: "Mill",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bmill\b/, 1.5),
      signal(/\bput the top [^.]{0,80}cards? of [^.]{0,40}library into\b/, 2),
      signal(/\bwhenever [^.]{0,60}draws a card\b[\s\S]{0,80}\bmill\b/, 2)
    ]
  },
  {
    label: "Discard",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\btarget player discards\b/, 1.5),
      signal(/\beach opponent discards\b/, 2),
      signal(/\bwhenever an opponent discards\b/, 2),
      signal(/\bmadness\b/, 1)
    ]
  },
  {
    label: "Wheels",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\beach player discards (?:their|his or her) hand\b/, 2.5),
      signal(/\bthen draws seven cards\b/, 2.5),
      signal(/\bthen draw that many cards\b/, 2),
      signal(/\bwheel\b/, 1.5)
    ]
  },
  {
    label: "Stax",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bopponents can'?t\b/, 2),
      signal(/\bplayers can'?t\b/, 2),
      signal(/\bcan'?t cast more than\b/, 2.5),
      signal(/\bdon'?t untap\b/, 2.5),
      signal(/\bspells your opponents cast cost\b/, 2)
    ]
  },
  {
    label: "Pillow Fort",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bcreatures can'?t attack you unless\b/, 2.5),
      signal(/\bwhenever a creature attacks you\b/, 1.5),
      signal(/\bprevent all combat damage that would be dealt to you\b/, 2),
      signal(/\bcreatures can'?t attack (?:planeswalkers you control|you or planeswalkers you control) unless\b/, 2)
    ]
  },
  {
    label: "Superfriends",
    minimumScore: 4,
    minimumMatchedCards: 3,
    signals: [
      signal(/\bplaneswalker\b/, 1),
      signal(/\bactivate loyalty abilities\b/, 3),
      signal(/\bproliferate\b/, 1.5)
    ]
  },
  {
    label: "Kindred (Tribal)",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bkindred\b/, 2),
      signal(/\bchoose a creature type\b/, 2),
      signal(/\bcreatures? of the chosen type\b/, 1.5),
      signal(/\bsliver\b/, 2)
    ]
  },
  {
    label: "Infect/Toxic",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\binfect\b/, 2.5),
      signal(/\btoxic \d+\b/, 2.5),
      signal(/\bpoison counter\b/, 2)
    ]
  },
  {
    label: "Cheat Into Play",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\byou may put\b[^.]{0,100}\bfrom your hand onto the battlefield\b/, 2.5),
      signal(/\bput target creature card from your hand onto the battlefield\b/, 2.5),
      signal(/\bput\b[^.]{0,100}\bfrom your graveyard onto the battlefield\b/, 2),
      signal(/\bshow(?:ing)? cards? from the top\b[^.]{0,120}\bput\b[^.]{0,100}\bonto the battlefield\b/, 2)
    ]
  },
  {
    label: "Topdeck Matters",
    minimumScore: 3.5,
    minimumMatchedCards: 2,
    signals: [
      signal(/\btop card of your library\b/, 2),
      signal(/\blook at the top card of your library\b/, 2),
      signal(/\breveal the top card of your library\b/, 2),
      signal(/\bplay with the top card of your library revealed\b/, 2)
    ]
  },
  {
    label: "Spells From Exile",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bfrom exile\b/, 1),
      signal(/\buntil end of turn, you may play that card\b/, 1.5),
      signal(/\buntil the end of your next turn, you may play that card\b/, 2),
      signal(/\byou may play cards exiled with\b/, 2),
      signal(/\bcast spells from exile\b/, 2),
      signal(/\bcast a spell from exile\b/, 2)
    ]
  },
  {
    label: "Combat Aggro",
    minimumScore: 4,
    minimumMatchedCards: 2,
    signals: [
      signal(/\bwhenever [^.]{0,60} attacks\b/, 1.5),
      signal(/\bdouble strike\b/, 1),
      signal(/\bmenace\b/, 0.5),
      signal(/\bextra combat phase\b/, 2.5),
      signal(/\bcombat damage\b/, 1)
    ]
  }
];

function toConfidence(score: number, deckSize: number): number {
  if (deckSize <= 0 || score <= 0) {
    return 0;
  }

  return Number(Math.min(1, score / deckSize).toFixed(4));
}

function matchedSignalScore(oracleText: string, rule: ArchetypeRule): number {
  let score = 0;

  for (const currentSignal of rule.signals) {
    if (currentSignal.pattern.test(oracleText)) {
      score += currentSignal.weight;
    }
  }

  return Math.min(score, MAX_ARCHETYPE_SCORE_PER_CARD);
}

/**
 * Detects deck archetypes using weighted oracle-text signals and per-archetype thresholds.
 */
export function computeDeckArchetypes(deckCards: DeckCard[], deckSize: number): DeckArchetypeReport {
  const normalizedCards = deckCards.map((entry) => {
    const cardName = entry.card.name ?? "";
    const typeLine = entry.card.type_line ?? "";
    const oracleTextBlocks = [
      entry.card.oracle_text,
      ...entry.card.card_faces.map((face) => face.oracle_text ?? "")
    ];

    return {
      qty: entry.qty,
      oracleText: [cardName, typeLine, ...oracleTextBlocks].join("\n").toLowerCase()
    };
  });

  const scored = ARCHETYPE_RULES.map((rule) => {
    let matchedCards = 0;
    let score = 0;

    for (const entry of normalizedCards) {
      const cardScore = matchedSignalScore(entry.oracleText, rule);

      if (cardScore <= 0) {
        continue;
      }

      matchedCards += entry.qty;
      score += cardScore * entry.qty;
    }

    return {
      rule,
      matchedCards,
      score
    };
  });

  const ranked = scored
    .filter(
      (entry) =>
        entry.score >= entry.rule.minimumScore &&
        entry.matchedCards >= entry.rule.minimumMatchedCards
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.matchedCards - a.matchedCards ||
        a.rule.label.localeCompare(b.rule.label)
    )
    .map((entry) => ({
      archetype: entry.rule.label,
      tagCount: entry.matchedCards,
      confidence: toConfidence(entry.score, deckSize)
    }));

  const primary = ranked[0] ?? null;
  const secondary = ranked[1] ?? null;

  return {
    primary,
    secondary,
    confidence: primary ? primary.confidence : 0,
    counts: ranked,
    disclaimer:
      "Archetype detection uses weighted Commander-parlance heuristics and remains directional."
  };
}
