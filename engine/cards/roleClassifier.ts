export type RoleKey = "ramp" | "draw" | "removal" | "wipes" | "tutors" | "protection" | "finishers";

export type RoleFlags = Record<RoleKey, boolean>;

export type TypeBucketFlags = {
  creature: boolean;
  instant: boolean;
  sorcery: boolean;
  artifact: boolean;
  enchantment: boolean;
  planeswalker: boolean;
  land: boolean;
  battle: boolean;
};

export type RoleClassifierCardInput = {
  typeLine: string;
  oracleText: string;
  keywords?: string[];
  behaviorId?: string | null;
};

const ROLE_HINTS_BY_BEHAVIOR_ID: Record<string, Array<RoleKey>> = {
  TAP_ADD_W: ["ramp"],
  TAP_ADD_U: ["ramp"],
  TAP_ADD_B: ["ramp"],
  TAP_ADD_R: ["ramp"],
  TAP_ADD_G: ["ramp"],
  TAP_ADD_C2: ["ramp"],
  TAP_ADD_ANY: ["ramp"],
  ETB_DRAW_1: ["draw"],
  DRAW_1: ["draw"],
  DRAW_2: ["draw"],
  DAMAGE_2: ["removal"],
  DAMAGE_3: ["removal"],
  DAMAGE_5: ["removal"],
  DESTROY_TARGET_CREATURE: ["removal"],
  SORCERY_DESTROY_TARGET_CREATURE: ["removal"],
  COUNTER_TARGET_SPELL: ["removal"]
};

const TYPE_NAMES = new Set([
  "artifact",
  "battle",
  "creature",
  "enchantment",
  "instant",
  "kindred",
  "land",
  "planeswalker",
  "sorcery",
  "tribal"
]);

const LAND_WORDS = "(?:plains|island|swamp|mountain|forest|wastes|desert)";
const NONLAND_CARD_WORDS = "(?:artifact|battle|creature|enchantment|instant|kindred|planeswalker|sorcery|nonland)";

function emptyRoleFlags(): RoleFlags {
  return {
    ramp: false,
    draw: false,
    removal: false,
    wipes: false,
    tutors: false,
    protection: false,
    finishers: false
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[\u2013\u2014]/g, "-");
}

function normalizeKeywords(keywords: string[] | undefined): string[] {
  return Array.isArray(keywords)
    ? keywords.filter((value): value is string => typeof value === "string").map((value) => value.toLowerCase())
    : [];
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function typeTokenSet(typeLine: string): Set<string> {
  const tokens = normalizeText(typeLine)
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return new Set(tokens.filter((token) => TYPE_NAMES.has(token)));
}

function hasType(typeLine: string, typeName: string): boolean {
  return typeTokenSet(typeLine).has(typeName.toLowerCase());
}

function searchClauses(text: string): string[] {
  const clauses: string[] = [];
  const pattern = /search your library for ([^.]+)/g;
  for (const match of text.matchAll(pattern)) {
    const clause = match[1]?.trim();
    if (clause) {
      clauses.push(clause);
    }
  }

  return clauses;
}

function isLandOnlySearchClause(clause: string): boolean {
  if (/\bnonland\b/.test(clause)) {
    return false;
  }

  return matchesAny(clause, [
    /\bbasic land\b/,
    /\bland cards?\b/,
    new RegExp(`\\b${LAND_WORDS}\\s+cards?\\b`)
  ]);
}

function hasTutorSignal(text: string): boolean {
  return /\bsearch your library\b/.test(text) || /\blook at the top \d+ cards? of your library\b/.test(text);
}

function isTrueTutor(text: string): boolean {
  const clauses = searchClauses(text);
  if (clauses.length === 0) {
    return false;
  }

  return clauses.some((clause) => {
    if (/\b(?:a|any)\s+card\b/.test(clause)) {
      return true;
    }

    if (isLandOnlySearchClause(clause)) {
      return false;
    }

    return new RegExp(`\\b${NONLAND_CARD_WORDS}\\s+card\\b`).test(clause);
  });
}

function isBoardWipe(text: string): boolean {
  return matchesAny(text, [
    /\b(?:destroy|exile)\s+(?:all|each)\s+[^.]{0,100}\b(?:creatures?|artifacts?|enchantments?|planeswalkers?|nonland permanents?|permanents?|graveyards?)\b/,
    /\breturn\s+(?:all|each)\s+[^.]{0,100}\b(?:creatures?|artifacts?|enchantments?|planeswalkers?|nonland permanents?|permanents?)\b[^.]{0,100}\bto\s+(?:its|their)\s+owner'?s\s+hand\b/,
    /\b(?:all|each)\s+creatures?\s+get\s*-\d+\/-\d+/,
    /\bdeals?\s+(?:x|\d+)\s+damage\s+to\s+each\s+creature\b/,
    /\beach\s+player\s+sacrifices\s+(?:all\s+)?(?:creatures?|artifacts?|enchantments?|planeswalkers?)\b/
  ]);
}

function isRamp(typeLine: string, text: string): boolean {
  const landCard = hasType(typeLine, "land");

  if (landCard) {
    return matchesAny(text, [
      /\{t\}:\s*add\s+\{[wubrgc]\}\{[wubrgc]\}/,
      /\badd two mana\b/,
      /\badd an additional\b[\s\S]{0,20}\bmana\b/
    ]);
  }

  return matchesAny(text, [
    /search your library for (?:up to )?(?:\d+|one|two|three)?\s*(?:basic )?land(?: card)?s?/,
    new RegExp(`search your library for [^.]{0,100}\\b${LAND_WORDS}\\b`),
    /\bput (?:that|those|a|an|up to two|two)\b[^.]{0,100}\bland cards?\b[^.]{0,100}\bonto the battlefield\b/,
    /\{t\}:\s*add\s+\{[wubrgc]/,
    /\badd\b[\s\S]{0,60}\bmana\b/,
    /\bcreate\b[\s\S]{0,40}\btreasure\b/,
    /for each land you control, add/
  ]);
}

function isDraw(text: string): boolean {
  return matchesAny(text, [
    /\bdraw\b[\s\S]{0,25}\bcard/,
    /whenever you draw/,
    /\binvestigate\b/,
    /\bconnive\b/,
    /\bsurveil\b/
  ]);
}

function isRemoval(text: string): boolean {
  return matchesAny(text, [
    /\bdestroy target\b/,
    /\bexile target\b/,
    /\bcounter target\b/,
    /\bdeals? (?:x|\d+) damage to target\b/,
    /\btarget [^.]{0,70} gets -\d+\/-\d+/,
    /\breturn target [^.]{0,80}\bto (?:its|their) owner'?s hand\b/,
    /\btarget player sacrifices\b[\s\S]{0,40}\b(?:creature|artifact|enchantment|planeswalker)\b/,
    /\bfight target\b/
  ]);
}

function isProtection(text: string, keywords: string[]): boolean {
  if (keywords.includes("hexproof") || keywords.includes("ward") || keywords.includes("indestructible")) {
    return true;
  }

  return matchesAny(text, [
    /\bindestructible\b/,
    /\bhexproof\b/,
    /\bward\b/,
    /\bphases? out\b/,
    /\bprotection from\b/,
    /\b(?:can'?t|cannot) be countered\b/,
    /\bprevent all\b[\s\S]{0,40}\bdamage\b/,
    /\bcounter target spell that targets\b/
  ]);
}

function isFinisher(text: string): boolean {
  return matchesAny(text, [
    /\byou win the game\b/,
    /\beach opponent loses (?:x|[2-9]|\d{2,}) life\b/,
    /\beach opponent loses life equal to\b/,
    /\bdouble damage\b/,
    /\bextra combat phase\b/,
    /\bcreatures you control (?:gain [^.]{0,30} and )?get \+[x\d]+\/\+[x\d]+(?: and gain [^.]{0,30})?\b/
  ]);
}

function applyBehaviorHints(flags: RoleFlags, behaviorId: string | null | undefined): void {
  if (!behaviorId) {
    return;
  }

  const hints = ROLE_HINTS_BY_BEHAVIOR_ID[behaviorId] ?? [];
  for (const hint of hints) {
    flags[hint] = true;
  }
}

export function classifyTypeBuckets(typeLine: string): TypeBucketFlags {
  return {
    creature: hasType(typeLine, "creature"),
    instant: hasType(typeLine, "instant"),
    sorcery: hasType(typeLine, "sorcery"),
    artifact: hasType(typeLine, "artifact"),
    enchantment: hasType(typeLine, "enchantment"),
    planeswalker: hasType(typeLine, "planeswalker"),
    land: hasType(typeLine, "land"),
    battle: hasType(typeLine, "battle")
  };
}

export function classifyCardRoles(input: RoleClassifierCardInput): RoleFlags {
  const typeLine = normalizeText(input.typeLine ?? "");
  const text = normalizeText(input.oracleText ?? "");
  const keywords = normalizeKeywords(input.keywords);
  const flags = emptyRoleFlags();

  applyBehaviorHints(flags, input.behaviorId);

  flags.ramp = flags.ramp || isRamp(typeLine, text);
  flags.draw = flags.draw || isDraw(text);
  flags.wipes = flags.wipes || isBoardWipe(text);
  flags.removal = flags.removal || isRemoval(text);
  flags.tutors = flags.tutors || isTrueTutor(text);
  flags.protection = flags.protection || isProtection(text, keywords);
  flags.finishers = flags.finishers || isFinisher(text);

  return flags;
}

export function classifyTutorSignals(input: RoleClassifierCardInput): {
  trueTutor: boolean;
  tutorSignal: boolean;
} {
  const text = normalizeText(input.oracleText ?? "");
  const trueTutor = isTrueTutor(text);
  return {
    trueTutor,
    tutorSignal: trueTutor || hasTutorSignal(text)
  };
}
