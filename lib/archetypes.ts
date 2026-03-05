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
      /create [^.]{0,80}\btoken\b/,
      /\bpopulate\b/,
      /\bamass\b/,
      /\bfor each token you control\b/,
      /\btoken creature\b/
    ]
  },
  {
    label: "Go Wide",
    patterns: [
      /\bcreate\b[^.]{0,80}\b1\/1\b/,
      /\bwhenever one or more creatures you control attack\b/,
      /\battacking creatures?\b/,
      /\bcreatures you control get \+\d+\/\+\d+\b/
    ]
  },
  {
    label: "Aristocrats",
    patterns: [
      /\bsacrifice (?:a|another|one or more)?\s*creature\b/,
      /\bwhenever [^.]{0,60}\bdies\b/,
      /\bwhenever you sacrifice\b/,
      /\bwhen(?:ever)? [^.]{0,60}\bis put into a graveyard from the battlefield\b/
    ]
  },
  {
    label: "Sacrifice Value",
    patterns: [
      /\bas an additional cost to cast\b[^.]{0,80}\bsacrifice\b/,
      /\bsacrifice another\b/,
      /\bwhenever you sacrifice\b/,
      /\bif you sacrificed\b/
    ]
  },
  {
    label: "Counters",
    patterns: [
      /\+1\/\+1 counter/,
      /\bproliferate\b/,
      /\bput (?:a|an|one|two|three|x) [^.]{0,40}\bcounter\b/,
      /\bremove [^.]{0,40}\bcounter\b/,
      /\bdouble the number of [^.]{0,40}\bcounters\b/
    ]
  },
  {
    label: "Graveyard",
    patterns: [
      /\breturn [^.]{0,80}\bfrom your graveyard\b/,
      /\bfrom your graveyard to (?:the battlefield|your hand)\b/,
      /\breanimate\b/,
      /\bdelirium\b/,
      /\bescape\b/
    ]
  },
  {
    label: "Self-Mill",
    patterns: [
      /\bmill\b/,
      /\bput the top\b[^.]{0,80}\bof your library into your graveyard\b/,
      /\bsurveil\b/,
      /\bdredge\b/
    ]
  },
  {
    label: "Reanimator",
    patterns: [
      /\breturn target creature card from your graveyard to the battlefield\b/,
      /\bput target creature card from a graveyard onto the battlefield\b/,
      /\beach player returns [^.]{0,60}\bcreature card\b/,
      /\banimate dead\b/
    ]
  },
  {
    label: "Blink",
    patterns: [
      /\bexile [^.]{0,100} then return (it|that card) to the battlefield\b/,
      /\bexile target [^.]{0,100} return it to the battlefield\b/,
      /\bflicker\b/,
      /\bblinks?\b/
    ]
  },
  {
    label: "Copy/Clone",
    patterns: [
      /\benters? as a copy of\b/,
      /\bcreate\b[^.]{0,80}\btoken that's a copy\b/,
      /\bcopy target (?:permanent|artifact|creature|instant|sorcery|spell)\b/,
      /\bexcept it isn't legendary\b/
    ]
  },
  {
    label: "Theft",
    patterns: [
      /\bgain control of target\b/,
      /\bgain control of\b[^.]{0,100}\bfor as long as\b/,
      /\bexchange control of\b/,
      /\byou may cast\b[^.]{0,100}\bfrom an opponent'?s\b/
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
      /\bwhenever you cast your second spell each turn\b/,
      /\bwhenever you cast a noncreature spell\b/
    ]
  },
  {
    label: "Control",
    patterns: [
      /\bcounter target spell\b/,
      /\breturn target\b[^.]{0,80}\bto (?:its|their) owner'?s hand\b/,
      /\bdestroy target\b/,
      /\bexile target\b/,
      /\bit doesn't untap during\b/
    ]
  },
  {
    label: "Storm",
    patterns: [
      /\bstorm\b/,
      /\bcopy this spell for each spell cast before it this turn\b/,
      /\bcast [^.]{0,80}from your graveyard this turn\b/
    ]
  },
  {
    label: "Extra Turns",
    patterns: [
      /\btake an extra turn after this one\b/,
      /\bif this spell was cast from your hand, take an extra turn\b/
    ]
  },
  {
    label: "Burn",
    patterns: [
      /\bdeals? \d+ damage to any target\b/,
      /\bdeals? \d+ damage to each opponent\b/,
      /\bwhenever an opponent casts a spell\b[^.]{0,80}\bdamage\b/,
      /\bnoncombat damage\b/
    ]
  },
  {
    label: "Voltron",
    patterns: [
      /\bequip\b/,
      /\bequipped creature\b/,
      /\baura [^.]{0,40}\battached\b/,
      /\bwhenever enchanted creature\b/
    ]
  },
  {
    label: "Auras",
    patterns: [
      /\benchant creature\b/,
      /\bwhenever an aura enters the battlefield\b/,
      /\bsearch your library for an aura\b/,
      /\benchanted creature gets\b/
    ]
  },
  {
    label: "Equipment",
    patterns: [
      /\bequip\b/,
      /\bequipped creature\b/,
      /\bsearch your library for an equipment\b/,
      /\bfor each equipment\b/
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
    label: "Lands Matter",
    patterns: [
      /\byou may play an additional land\b/,
      /\byou may play lands from your graveyard\b/,
      /\breturn target land card from your graveyard\b/,
      /\bsacrifice a land\b/,
      /\bfor each land you control\b/
    ]
  },
  {
    label: "Big Mana",
    patterns: [
      /\bwhenever you tap a land for mana, add\b/,
      /\bdouble\b[^.]{0,60}\bmana\b/,
      /\badd \{[wubrgc]\}\{[wubrgc]\}\{[wubrgc]\}/,
      /\bfor each land you control, add\b/
    ]
  },
  {
    label: "Treasure",
    patterns: [
      /\btreasure token\b/,
      /\bcreate [^.]{0,30}\btreasure\b/,
      /\bsacrifice a treasure\b/
    ]
  },
  {
    label: "Lifegain",
    patterns: [
      /\byou gain \d+ life\b/,
      /\bwhenever you gain life\b/,
      /\blifelink\b/,
      /\beach opponent loses [^.]{0,30}you gain\b/
    ]
  },
  {
    label: "Life Drain",
    patterns: [
      /\beach opponent loses\b[^.]{0,40}\blife\b/,
      /\bwhenever an opponent loses life\b/,
      /\bopponents lose\b[^.]{0,40}\byou gain\b/,
      /\bextort\b/
    ]
  },
  {
    label: "Group Slug",
    patterns: [
      /\beach player loses\b/,
      /\bat the beginning of each player'?s upkeep\b[^.]{0,80}\blose\b/,
      /\bwhenever a player casts a spell\b[^.]{0,80}\bdamage to that player\b/,
      /\bwhenever a land enters the battlefield\b[^.]{0,80}\bdamage\b/
    ]
  },
  {
    label: "Group Hug",
    patterns: [
      /\beach player draws\b/,
      /\beach player may\b/,
      /\bwhenever an opponent draws a card\b/,
      /\bat the beginning of each player's draw step\b/
    ]
  },
  {
    label: "Mill",
    patterns: [
      /\bmill\b/,
      /\bput the top [^.]{0,80}cards? of [^.]{0,40}library into\b/,
      /\bwhenever [^.]{0,60}draws a card\b[\s\S]{0,80}\bmill\b/
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
      /\beach player discards (?:their|his or her) hand\b/,
      /\bthen draws seven cards\b/,
      /\bthen draw that many cards\b/,
      /\bwheel\b/
    ]
  },
  {
    label: "Stax",
    patterns: [
      /\bopponents can'?t\b/,
      /\bplayers can'?t\b/,
      /\bcan'?t cast more than\b/,
      /\bdon'?t untap\b/,
      /\bspells your opponents cast cost\b/
    ]
  },
  {
    label: "Pillow Fort",
    patterns: [
      /\bcreatures can'?t attack you unless\b/,
      /\bwhenever a creature attacks you\b/,
      /\bprevent all combat damage that would be dealt to you\b/,
      /\bcreatures can'?t attack planeswalkers you control unless\b/
    ]
  },
  {
    label: "Superfriends",
    patterns: [
      /\bplaneswalker\b/,
      /\bactivate loyalty abilities\b/,
      /\bproliferate\b/
    ]
  },
  {
    label: "Kindred (Tribal)",
    patterns: [
      /\bkindred\b/,
      /\bchoose a creature type\b/,
      /\bcreatures? of the chosen type\b/,
      /\bsliver\b/
    ]
  },
  {
    label: "Infect/Toxic",
    patterns: [
      /\binfect\b/,
      /\btoxic \d+\b/,
      /\bpoison counter\b/
    ]
  },
  {
    label: "Cheat Into Play",
    patterns: [
      /\byou may put\b[^.]{0,100}\bfrom your hand onto the battlefield\b/,
      /\bput target creature card from your hand onto the battlefield\b/,
      /\bput\b[^.]{0,100}\bfrom your graveyard onto the battlefield\b/,
      /\bshow(?:ing)? cards? from the top\b[^.]{0,120}\bput\b[^.]{0,100}\bonto the battlefield\b/
    ]
  },
  {
    label: "Combat Aggro",
    patterns: [
      /\bwhenever [^.]{0,60} attacks\b/,
      /\bdouble strike\b/,
      /\bmenace\b/,
      /\bextra combat phase\b/,
      /\bcombat damage\b/
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
 * Detects deck archetypes using structured oracle-text pattern tags and returns top matches.
 */
export function computeDeckArchetypes(deckCards: DeckCard[], deckSize: number): DeckArchetypeReport {
  const counts = new Map<string, number>(ARCHETYPE_RULES.map((rule) => [rule.label, 0]));

  for (const entry of deckCards) {
    const cardName = entry.card.name ?? "";
    const typeLine = entry.card.type_line ?? "";
    const oracleTextBlocks = [
      entry.card.oracle_text,
      ...entry.card.card_faces.map((face) => face.oracle_text ?? "")
    ];
    const oracleText = [cardName, typeLine, ...oracleTextBlocks].join("\n").toLowerCase();

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
    disclaimer: "Archetype detection uses Commander-parlance categories and remains directional."
  };
}
