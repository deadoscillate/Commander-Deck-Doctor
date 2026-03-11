import { CardDatabase } from "@/engine/cards/CardDatabase";
import curatedProfiles from "@/data/commander-profiles/curated.json";
import generatedProfiles from "@/data/commander-profiles/generated.json";
import type { CommanderProfile, CommanderProfileGroup } from "@/lib/commanderProfiles";
import {
  buildCommanderSignalPattern,
  COMMANDER_SIGNAL_SUGGESTION_GROUPS,
  type CommanderSignalSuggestionGroup
} from "@/lib/commanderSignals";
import { getLocalDefaultCardByName } from "@/lib/scryfallLocalDefaultStore";

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const curated = curatedProfiles as CommanderProfile[];
const generated = generatedProfiles as CommanderProfile[];

const curatedIndex = new Map<string, CommanderProfile>();
const generatedIndex = new Map<string, CommanderProfile>();

function populateIndex(index: Map<string, CommanderProfile>, profiles: CommanderProfile[]) {
  for (const profile of profiles) {
    index.set(normalizeName(profile.commanderName), profile);
    for (const alias of profile.aliases ?? []) {
      index.set(normalizeName(alias), profile);
    }
  }
}

populateIndex(curatedIndex, curated);
populateIndex(generatedIndex, generated);

type CandidateCard = {
  name: string;
  normalizedName: string;
  mv: number;
  power: string | null;
  typeLine: string;
  oracleText: string;
  colorIdentity: string[];
  commanderLegal: boolean;
};

let candidateCards: CandidateCard[] | null = null;
const expandedProfileCache = new Map<string, CommanderProfile>();

const TRIBAL_TAGS = new Set([
  "angel",
  "artificer",
  "assassin",
  "bear",
  "cleric",
  "demon",
  "dinosaur",
  "dragon",
  "drake",
  "druid",
  "elf",
  "faerie",
  "frog",
  "goblin",
  "human",
  "knight",
  "merfolk",
  "pirate",
  "rogue",
  "samurai",
  "sliver",
  "soldier",
  "spirit",
  "treefolk",
  "vampire",
  "warrior",
  "wizard",
  "zombie"
]);

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function isCommanderLegal(legalities: Record<string, string> | undefined): boolean {
  if (!legalities) {
    return true;
  }

  const commander = legalities.commander;
  return !commander || commander === "legal" || commander === "restricted";
}

function isBuilderExcludedCard(name: string, typeLine: string): boolean {
  const lowerName = name.trim().toLowerCase();
  const lowerType = typeLine.toLowerCase();
  return lowerName.startsWith("a-") || lowerType.includes("sticker") || lowerType.includes("attraction");
}

function getCandidateCards(): CandidateCard[] {
  if (candidateCards) {
    return candidateCards;
  }

  candidateCards = CardDatabase.loadFromCompiledFile()
    .allCards()
    .filter((card) => isCommanderLegal(card.legalities) && !isBuilderExcludedCard(card.name, card.typeLine))
    .map((card) => ({
      name: card.name,
      normalizedName: normalizeName(card.name),
      mv: card.mv,
      power: card.power ?? null,
      typeLine: card.typeLine,
      oracleText: card.oracleText ?? "",
      colorIdentity: Array.isArray(card.colorIdentity) ? card.colorIdentity.map((color) => color.toUpperCase()) : [],
      commanderLegal: isCommanderLegal(card.legalities)
    }));

  return candidateCards;
}

function isColorSubset(identity: string[], allowed: Set<string>): boolean {
  return identity.every((color) => allowed.has(color));
}

function deriveTribalTags(tags: string[]): string[] {
  const tribes = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.endsWith("s") ? tag.slice(0, -1) : tag;
    if (TRIBAL_TAGS.has(normalized)) {
      tribes.add(normalized);
    }
  }

  return [...tribes];
}

function deriveGroupFamilies(
  commanderName: string,
  commanderText: string,
  profileTags: string[],
  group: CommanderProfileGroup,
  matchedSignal: CommanderSignalSuggestionGroup | null
): string[] {
  const families = new Set<string>();
  const haystack = `${group.key} ${group.label} ${group.description} ${commanderText} ${profileTags.join(" ")}`
    .toLowerCase();

  const add = (family: string) => families.add(family);

  if (
    /evasion|can't be blocked|combat damage|attack|attacker|ninja|pirate|rogue|unblockable|flying/.test(haystack)
  ) {
    add("evasion");
    add("combat");
  }
  if (/tempo|counter target spell|return target .* to (its owner'?s )?hand|tap target/.test(haystack)) {
    add("tempo");
  }
  if (/token|populate|amass|go wide|swarm/.test(haystack)) {
    add("tokens");
  }
  if (/\+1\/\+1|counter|proliferate/.test(haystack)) {
    add("counters");
  }
  if (/sacrifice|dies|aristocrat|blood artist|lifedrain/.test(haystack)) {
    add("aristocrats");
  }
  if (/blink|flicker|enters the battlefield|etb/.test(haystack)) {
    add("blink");
  }
  if (/graveyard|reanimate|self-mill|recursion/.test(haystack)) {
    add("graveyard");
  }
  if (/artifact|thopter|construct|historic/.test(haystack)) {
    add("artifacts");
  }
  if (/enchantment|aura|constellation/.test(haystack)) {
    add("enchantments");
  }
  if (/equipment|voltron|double strike|aura attached|commander damage/.test(haystack)) {
    add("voltron");
  }
  if (/discard|wheel|hand-size/.test(haystack)) {
    add("discard");
  }
  if (/treasure/.test(haystack)) {
    add("treasure");
  }
  if (/landfall|additional land|land enters|lands matter/.test(haystack)) {
    add("lands");
  }
  if (/legend|historic/.test(haystack)) {
    add("legends");
  }
  if (/instant|sorcery|spellslinger|storm|magecraft|prowess|copy spell/.test(haystack)) {
    add("spellslinger");
  }
  if (/gain life|lifelink|opponent loses life|drain/.test(haystack)) {
    add("lifegain");
  }
  if (/from exile|cast .* from exile|cascade|discover|impulsive draw/.test(haystack)) {
    add("exile");
  }

  if (matchedSignal) {
    if (matchedSignal.key === "combat-damage-support") {
      add("evasion");
      add("combat");
    }
    if (matchedSignal.key === "spell-payoffs") {
      add("spellslinger");
    }
    if (matchedSignal.key === "token-payoffs") {
      add("tokens");
    }
    if (matchedSignal.key === "graveyard-payoffs" || matchedSignal.key === "reanimation-support") {
      add("graveyard");
    }
    if (matchedSignal.key === "artifact-payoffs") {
      add("artifacts");
    }
    if (matchedSignal.key === "enchantment-payoffs") {
      add("enchantments");
    }
    if (matchedSignal.key === "treasure-support") {
      add("treasure");
    }
    if (matchedSignal.key === "land-payoffs") {
      add("lands");
    }
    if (matchedSignal.key === "legend-payoffs") {
      add("legends");
    }
    if (matchedSignal.key === "lifegain-support") {
      add("lifegain");
    }
    if (matchedSignal.key === "exile-cast-support") {
      add("exile");
    }
  }

  for (const tribe of deriveTribalTags(profileTags)) {
    add(`tribal:${tribe}`);
  }

  if (families.size === 0) {
    add("general");
  }

  if (normalizeName(commanderName) === normalizeName("Edric, Spymaster of Trest")) {
    add("evasion");
    add("combat");
    add("tempo");
  }

  return [...families];
}

function scoreCardForFamilies(card: CandidateCard, families: string[]): number {
  const text = `${card.typeLine} ${card.oracleText}`.toLowerCase();
  const isCreature = /\bcreature\b/i.test(card.typeLine);
  const hasDefender = /\bdefender\b/i.test(text) || /\bwall\b/i.test(card.typeLine);
  const power = typeof card.power === "string" && /^-?\d+$/.test(card.power) ? Number.parseInt(card.power, 10) : null;
  let score = 0;

  for (const family of families) {
    if (family === "general") {
      if (card.mv <= 3) {
        score += 1;
      }
      continue;
    }

    if (family.startsWith("tribal:")) {
      const tribe = family.slice("tribal:".length);
      if (new RegExp(`\\b${tribe}\\b`, "i").test(card.typeLine) || new RegExp(`\\b${tribe}\\b`, "i").test(card.oracleText)) {
        score += 8;
      }
      continue;
    }

    switch (family) {
      case "evasion":
        if (isCreature && card.mv <= 3) {
          score += 4;
        }
        if (/(flying|can't be blocked|unblockable|menace|skulk|shadow|islandwalk|forestwalk|swampwalk|mountainwalk|landwalk|horsemanship)/i.test(text)) {
          score += 8;
        }
        if (/combat damage to a player.*draw|whenever .* deals combat damage to a player.*draw/i.test(text)) {
          score += 6;
        }
        if (/(flash|ward|hexproof)/i.test(text) && isCreature && card.mv <= 3) {
          score += 2;
        }
        if (hasDefender || /can't attack/i.test(text) || power === 0) {
          score -= 10;
        }
        break;
      case "combat":
        if (/combat damage|whenever .* attacks|whenever you attack|attacking creature|attack each combat/i.test(text)) {
          score += 6;
        }
        if (/extra combat/i.test(text)) {
          score += 3;
        }
        if (hasDefender || /can't attack/i.test(text) || power === 0) {
          score -= 10;
        }
        break;
      case "tempo":
        if (card.mv <= 2) {
          score += 2;
        }
        if (/counter target spell|return target .* to (its owner'?s )?hand|tap target|can't attack|can't block/i.test(text)) {
          score += 7;
        }
        if (hasDefender || power === 0) {
          score -= 4;
        }
        break;
      case "tokens":
        if (/create [^.]{0,120}\btoken\b|populate|amass/i.test(text)) {
          score += 8;
        }
        if (/anthem|creatures you control get \+\d+\/\+\d+|for each creature you control/i.test(text)) {
          score += 4;
        }
        break;
      case "counters":
        if (/\+1\/\+1 counter|proliferate|counter on/i.test(text)) {
          score += 8;
        }
        break;
      case "aristocrats":
        if (/sacrifice [^.]{0,100}creature|whenever .* dies|opponent loses life|blood artist|creature dies/i.test(text)) {
          score += 8;
        }
        break;
      case "blink":
        if (/enters the battlefield|exile .* return it to the battlefield|blink|flicker/i.test(text)) {
          score += 8;
        }
        break;
      case "graveyard":
        if (/\bgraveyard\b|mill|return .* from your graveyard|reanimate/i.test(text)) {
          score += 8;
        }
        break;
      case "artifacts":
        if (/\bartifact\b|thopter|construct|historic/i.test(text)) {
          score += 8;
        }
        break;
      case "enchantments":
        if (/\benchantment\b|aura|constellation/i.test(text)) {
          score += 8;
        }
        break;
      case "voltron":
        if (/equipment|aura attached|double strike|commander damage|equipped creature/i.test(text)) {
          score += 8;
        }
        break;
      case "discard":
        if (/discard|each player draws .* cards|wheel|hand size/i.test(text)) {
          score += 8;
        }
        break;
      case "treasure":
        if (/\btreasure\b|create .* treasure token/i.test(text)) {
          score += 8;
        }
        break;
      case "lands":
        if (/\blandfall\b|play an additional land|whenever a land enters|land enters the battlefield/i.test(text)) {
          score += 8;
        }
        break;
      case "legends":
        if (/\blegendary\b|historic/i.test(text)) {
          score += 8;
        }
        break;
      case "spellslinger":
        if (/instant or sorcery|noncreature spell|magecraft|prowess|copy target instant or sorcery|storm/i.test(text)) {
          score += 8;
        }
        if (!isCreature && card.mv <= 2) {
          score += 2;
        }
        break;
      case "lifegain":
        if (/gain life|lifelink|opponent loses life|drain/i.test(text)) {
          score += 8;
        }
        break;
      case "exile":
        if (/from exile|cast .* from exile|cascade|discover|impulsive draw/i.test(text)) {
          score += 8;
        }
        break;
    }
  }

  if (card.mv <= 2) {
    score += 1;
  } else if (card.mv >= 6) {
    score -= 1;
  }

  if (isCreature && power !== null && power >= 1 && card.mv <= 2) {
    score += 1;
  }

  return score;
}

function buildExpandedGroupCards(
  commanderName: string,
  commanderColorIdentity: string[],
  commanderText: string,
  profileTags: string[],
  group: CommanderProfileGroup,
  matchedSignal: CommanderSignalSuggestionGroup | null
): string[] {
  const seeds = group.cards.filter(Boolean);
  const seedNames = new Set(seeds.map((name) => normalizeName(name)));
  const allowedColors = new Set((commanderColorIdentity ?? []).map((color) => color.toUpperCase()));
  const families = deriveGroupFamilies(commanderName, commanderText, profileTags, group, matchedSignal);

  const candidates = getCandidateCards()
    .filter((card) => {
      if (!card.commanderLegal || card.normalizedName === normalizeName(commanderName) || seedNames.has(card.normalizedName)) {
        return false;
      }

      return isColorSubset(card.colorIdentity, allowedColors);
    })
    .map((card) => ({
      name: card.name,
      score: scoreCardForFamilies(card, families),
      mv: card.mv
    }))
    .filter((card) => card.score >= 5)
    .sort((left, right) => right.score - left.score || left.mv - right.mv || left.name.localeCompare(right.name))
    .slice(0, 18)
    .map((card) => card.name);

  return [...seeds, ...candidates].filter((name, index, names) => index === names.findIndex((entry) => normalizeName(entry) === normalizeName(name)));
}

function buildSignalGroups(
  commanderName: string,
  commanderText: string
): CommanderProfileGroup[] {
  const groups: CommanderProfileGroup[] = [];

  for (const signal of COMMANDER_SIGNAL_SUGGESTION_GROUPS) {
    if (!buildCommanderSignalPattern(signal.patternSource).test(commanderText)) {
      continue;
    }

    groups.push({
      key: signal.key,
      label: signal.label,
      description: signal.description,
      cards: signal.names
    });
  }

  return groups;
}

function expandCommanderProfile(name: string, profile: CommanderProfile | null): CommanderProfile | null {
  const normalizedCommanderName = normalizeName(name);
  const commanderCard =
    getLocalDefaultCardByName(name) ??
    getCandidateCards().find((card) => card.normalizedName === normalizedCommanderName);

  const commanderText =
    commanderCard && "oracle_text" in commanderCard
      ? commanderCard.oracle_text ?? ""
      : commanderCard && "oracleText" in commanderCard
        ? commanderCard.oracleText ?? ""
        : "";
  const commanderColorIdentity =
    commanderCard && "color_identity" in commanderCard
      ? commanderCard.color_identity ?? []
      : commanderCard && "colorIdentity" in commanderCard
        ? commanderCard.colorIdentity ?? []
        : [];

  if (!profile && !commanderText) {
    return null;
  }

  const signalGroups = buildSignalGroups(name, commanderText);
  const baseProfile: CommanderProfile = profile ?? {
    commanderName: name,
    tags: [],
    groups: []
  };
  const mergedGroups: CommanderProfileGroup[] = [];
  const seenKeys = new Set<string>();

  for (const group of [...baseProfile.groups, ...signalGroups]) {
    if (seenKeys.has(group.key)) {
      continue;
    }
    seenKeys.add(group.key);

    const matchedSignal = COMMANDER_SIGNAL_SUGGESTION_GROUPS.find((signal) => signal.key === group.key) ?? null;
    mergedGroups.push({
      ...group,
      cards: buildExpandedGroupCards(
        name,
        commanderColorIdentity,
        commanderText,
        normalizeTags(baseProfile.tags),
        group,
        matchedSignal
      )
    });
  }

  if (mergedGroups.length === 0) {
    return null;
  }

  return {
    commanderName: baseProfile.commanderName || name,
    aliases: baseProfile.aliases,
    tags: baseProfile.tags,
    groups: mergedGroups
  };
}

export function getCuratedCommanderProfile(name: string): CommanderProfile | null {
  return curatedIndex.get(normalizeName(name)) ?? null;
}

export function getGeneratedCommanderProfile(name: string): CommanderProfile | null {
  return generatedIndex.get(normalizeName(name)) ?? null;
}

export function getMergedCommanderProfile(name: string): {
  profile: CommanderProfile | null;
  source: "curated" | "generated" | "none";
} {
  const normalized = normalizeName(name);
  const cached = expandedProfileCache.get(normalized);
  if (cached) {
    const source = curatedIndex.has(normalized) ? "curated" : generatedIndex.has(normalized) ? "generated" : "none";
    return {
      profile: cached,
      source
    };
  }

  const curatedProfile = getCuratedCommanderProfile(name);
  if (curatedProfile) {
    const expanded = expandCommanderProfile(name, curatedProfile);
    if (expanded) {
      expandedProfileCache.set(normalized, expanded);
    }
    return { profile: expanded, source: "curated" };
  }

  const generatedProfile = getGeneratedCommanderProfile(name);
  if (generatedProfile) {
    const expanded = expandCommanderProfile(name, generatedProfile);
    if (expanded) {
      expandedProfileCache.set(normalized, expanded);
    }
    return { profile: expanded, source: "generated" };
  }

  const expanded = expandCommanderProfile(name, null);
  if (expanded) {
    expandedProfileCache.set(normalized, expanded);
  }
  return { profile: expanded, source: "none" };
}
