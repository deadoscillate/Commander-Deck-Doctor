import { createCardDefinition } from "./CardDefinition";
import { parseTypeLine } from "../core/Card";
import type { BehaviorRegistry, CardBehavior } from "../core/Ability";
import type { CardDefinition as EngineCardDefinition, CardFaceDefinition } from "../core/types";
import { etbDrawTemplate, vanillaCreatureTemplate } from "./templates/creature";
import { damageSpellTemplate, destroyCreatureTemplate, drawSpellTemplate, counterSpellTemplate } from "./templates/instant";
import { sorceryDamageTemplate, sorceryDestroyTemplate, sorceryDrawTemplate } from "./templates/sorcery";
import { manaRockTemplate, colorIdentityManaRockTemplate } from "./templates/artifact";
import { anthemTemplate, replacementDiesExileTemplate } from "./templates/enchantment";
import { auraBuffTemplate } from "./templates/aura";
import { equipmentBuffTemplate } from "./templates/equipment";
import { simplePlaneswalkerTemplate } from "./templates/planeswalker";

type ScryfallFace = {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
};

type ScryfallCard = {
  oracle_id?: string;
  id?: string;
  name?: string;
  mana_cost?: string;
  mana_value?: number;
  cmc?: number;
  type_line?: string;
  colors?: string[];
  color_identity?: string[];
  oracle_text?: string;
  keywords?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  layout?: string;
  legalities?: Record<string, string>;
  card_faces?: ScryfallFace[] | null;
};

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toFaces(card: ScryfallCard): CardFaceDefinition[] {
  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
  return faces
    .filter((face) => typeof face.name === "string" && face.name.trim().length > 0)
    .map((face) => ({
      name: face.name ?? "",
      manaCost: face.mana_cost ?? null,
      typeLine: face.type_line ?? "",
      oracleText: face.oracle_text ?? "",
      colors: Array.isArray(face.colors) ? face.colors.filter((value) => typeof value === "string") : [],
      power: face.power ?? null,
      toughness: face.toughness ?? null,
      loyalty: face.loyalty ?? null
    }));
}

function normalizeScryfallCard(record: ScryfallCard): EngineCardDefinition | null {
  const name = record.name?.trim() ?? "";
  if (!name) {
    return null;
  }

  const typeLine = record.type_line?.trim() ?? "";
  const oracleId = record.oracle_id ?? record.id ?? normalizeName(name);
  const mv =
    typeof record.mana_value === "number" && Number.isFinite(record.mana_value)
      ? record.mana_value
      : typeof record.cmc === "number" && Number.isFinite(record.cmc)
        ? record.cmc
        : 0;

  return {
    oracleId,
    name,
    faces: toFaces(record),
    manaCost: record.mana_cost ?? "",
    mv,
    typeLine,
    parsedTypeLine: parseTypeLine(typeLine),
    colors: Array.isArray(record.colors) ? record.colors.filter((value) => typeof value === "string") : [],
    colorIdentity: Array.isArray(record.color_identity)
      ? record.color_identity.filter((value) => typeof value === "string")
      : [],
    oracleText: record.oracle_text ?? "",
    keywords: Array.isArray(record.keywords) ? record.keywords.filter((value) => typeof value === "string") : [],
    power: record.power ?? null,
    toughness: record.toughness ?? null,
    loyalty: record.loyalty ?? null,
    legalities: record.legalities ?? { commander: "legal" },
    behaviorId: behaviorIdForCardName(name)
  };
}

function cardRecord(behaviorId: string, values: Parameters<typeof createCardDefinition>[0]): EngineCardDefinition {
  return createCardDefinition({
    ...values,
    behaviorId
  });
}

function buildTemplateRegistry(): BehaviorRegistry {
  const registry: BehaviorRegistry = {
    VANILLA_CREATURE: vanillaCreatureTemplate("VANILLA_CREATURE"),
    ETB_DRAW_1: etbDrawTemplate("ETB_DRAW_1", 1),
    DAMAGE_2: damageSpellTemplate("DAMAGE_2", 2),
    DAMAGE_3: damageSpellTemplate("DAMAGE_3", 3),
    DAMAGE_5: sorceryDamageTemplate("DAMAGE_5", 5),
    DESTROY_TARGET_CREATURE: destroyCreatureTemplate("DESTROY_TARGET_CREATURE"),
    DRAW_1: drawSpellTemplate("DRAW_1", 1),
    DRAW_2: sorceryDrawTemplate("DRAW_2", 2),
    COUNTER_TARGET_SPELL: counterSpellTemplate("COUNTER_TARGET_SPELL"),
    TAP_ADD_W: manaRockTemplate("TAP_ADD_W", "W", 1),
    TAP_ADD_U: manaRockTemplate("TAP_ADD_U", "U", 1),
    TAP_ADD_B: manaRockTemplate("TAP_ADD_B", "B", 1),
    TAP_ADD_R: manaRockTemplate("TAP_ADD_R", "R", 1),
    TAP_ADD_G: manaRockTemplate("TAP_ADD_G", "G", 1),
    TAP_ADD_C2: manaRockTemplate("TAP_ADD_C2", "C", 2),
    TAP_ADD_ANY: colorIdentityManaRockTemplate("TAP_ADD_ANY"),
    ANTHEM_1_1: anthemTemplate("ANTHEM_1_1", 1, 1),
    REPLACEMENT_DIES_EXILE: replacementDiesExileTemplate("REPLACEMENT_DIES_EXILE"),
    AURA_BUFF_1_2: auraBuffTemplate("AURA_BUFF_1_2", 1, 2),
    EQUIPMENT_BUFF_2_0: equipmentBuffTemplate("EQUIPMENT_BUFF_2_0", 2, 0),
    PLANESWALKER_SIMPLE: simplePlaneswalkerTemplate("PLANESWALKER_SIMPLE"),
    SORCERY_DESTROY_TARGET_CREATURE: sorceryDestroyTemplate("SORCERY_DESTROY_TARGET_CREATURE")
  };

  return registry;
}

function buildEngineSet(): EngineCardDefinition[] {
  return [
    cardRecord("TAP_ADD_W", {
      oracleId: "eng-plains",
      name: "Plains",
      typeLine: "Basic Land - Plains"
    }),
    cardRecord("TAP_ADD_U", {
      oracleId: "eng-island",
      name: "Island",
      typeLine: "Basic Land - Island"
    }),
    cardRecord("TAP_ADD_B", {
      oracleId: "eng-swamp",
      name: "Swamp",
      typeLine: "Basic Land - Swamp"
    }),
    cardRecord("TAP_ADD_R", {
      oracleId: "eng-mountain",
      name: "Mountain",
      typeLine: "Basic Land - Mountain"
    }),
    cardRecord("TAP_ADD_G", {
      oracleId: "eng-forest",
      name: "Forest",
      typeLine: "Basic Land - Forest"
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-grizzly-bears",
      name: "Grizzly Bears",
      manaCost: "{1}{G}",
      mv: 2,
      typeLine: "Creature - Bear",
      power: "2",
      toughness: "2",
      colors: ["G"]
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-silvercoat-lion",
      name: "Silvercoat Lion",
      manaCost: "{1}{W}",
      mv: 2,
      typeLine: "Creature - Cat",
      power: "2",
      toughness: "2",
      colors: ["W"]
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-walking-corpse",
      name: "Walking Corpse",
      manaCost: "{1}{B}",
      mv: 2,
      typeLine: "Creature - Zombie",
      power: "2",
      toughness: "2",
      colors: ["B"]
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-hill-giant",
      name: "Hill Giant",
      manaCost: "{3}{R}",
      mv: 4,
      typeLine: "Creature - Giant",
      power: "3",
      toughness: "3",
      colors: ["R"]
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-wind-drake",
      name: "Wind Drake",
      manaCost: "{2}{U}",
      mv: 3,
      typeLine: "Creature - Drake",
      power: "2",
      toughness: "2",
      colors: ["U"]
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-fragile-hatchling",
      name: "Fragile Hatchling",
      manaCost: "{0}",
      mv: 0,
      typeLine: "Creature - Illusion",
      power: "0",
      toughness: "0",
      colors: []
    }),
    cardRecord("ETB_DRAW_1", {
      oracleId: "eng-elvish-visionary",
      name: "Elvish Visionary",
      manaCost: "{G}",
      mv: 1,
      typeLine: "Creature - Elf Shaman",
      power: "1",
      toughness: "1",
      colors: ["G"]
    }),
    cardRecord("ETB_DRAW_1", {
      oracleId: "eng-wall-of-omens",
      name: "Wall of Omens",
      manaCost: "{1}{W}",
      mv: 2,
      typeLine: "Creature - Wall",
      power: "0",
      toughness: "4",
      colors: ["W"]
    }),
    cardRecord("ETB_DRAW_1", {
      oracleId: "eng-spirited-companion",
      name: "Spirited Companion",
      manaCost: "{1}{W}",
      mv: 2,
      typeLine: "Enchantment Creature - Dog",
      power: "1",
      toughness: "1",
      colors: ["W"]
    }),
    cardRecord("TAP_ADD_G", {
      oracleId: "eng-llanowar-elves",
      name: "Llanowar Elves",
      manaCost: "{G}",
      mv: 1,
      typeLine: "Creature - Elf Druid",
      power: "1",
      toughness: "1",
      colors: ["G"]
    }),
    cardRecord("TAP_ADD_C2", {
      oracleId: "eng-sol-ring",
      name: "Sol Ring",
      manaCost: "{1}",
      mv: 1,
      typeLine: "Artifact"
    }),
    cardRecord("TAP_ADD_ANY", {
      oracleId: "eng-arcane-signet",
      name: "Arcane Signet",
      manaCost: "{2}",
      mv: 2,
      typeLine: "Artifact"
    }),
    cardRecord("DAMAGE_2", {
      oracleId: "eng-shock",
      name: "Shock",
      manaCost: "{R}",
      mv: 1,
      typeLine: "Instant",
      colors: ["R"]
    }),
    cardRecord("DAMAGE_3", {
      oracleId: "eng-lightning-bolt",
      name: "Lightning Bolt",
      manaCost: "{R}",
      mv: 1,
      typeLine: "Instant",
      colors: ["R"]
    }),
    cardRecord("DAMAGE_2", {
      oracleId: "eng-play-with-fire",
      name: "Play with Fire",
      manaCost: "{R}",
      mv: 1,
      typeLine: "Instant",
      colors: ["R"]
    }),
    cardRecord("DAMAGE_2", {
      oracleId: "eng-burst-lightning",
      name: "Burst Lightning",
      manaCost: "{R}",
      mv: 1,
      typeLine: "Instant",
      colors: ["R"]
    }),
    cardRecord("DAMAGE_5", {
      oracleId: "eng-lava-axe",
      name: "Lava Axe",
      manaCost: "{4}{R}",
      mv: 5,
      typeLine: "Sorcery",
      colors: ["R"]
    }),
    cardRecord("DESTROY_TARGET_CREATURE", {
      oracleId: "eng-murder",
      name: "Murder",
      manaCost: "{1}{B}{B}",
      mv: 3,
      typeLine: "Instant",
      colors: ["B"]
    }),
    cardRecord("DESTROY_TARGET_CREATURE", {
      oracleId: "eng-doom-blade",
      name: "Doom Blade",
      manaCost: "{1}{B}",
      mv: 2,
      typeLine: "Instant",
      colors: ["B"]
    }),
    cardRecord("DESTROY_TARGET_CREATURE", {
      oracleId: "eng-go-for-the-throat",
      name: "Go for the Throat",
      manaCost: "{1}{B}",
      mv: 2,
      typeLine: "Instant",
      colors: ["B"]
    }),
    cardRecord("DRAW_2", {
      oracleId: "eng-divination",
      name: "Divination",
      manaCost: "{2}{U}",
      mv: 3,
      typeLine: "Sorcery",
      colors: ["U"]
    }),
    cardRecord("DRAW_2", {
      oracleId: "eng-nights-whisper",
      name: "Night's Whisper",
      manaCost: "{1}{B}",
      mv: 2,
      typeLine: "Sorcery",
      colors: ["B"]
    }),
    cardRecord("DRAW_1", {
      oracleId: "eng-opt",
      name: "Opt",
      manaCost: "{U}",
      mv: 1,
      typeLine: "Instant",
      colors: ["U"]
    }),
    cardRecord("COUNTER_TARGET_SPELL", {
      oracleId: "eng-counterspell",
      name: "Counterspell",
      manaCost: "{U}{U}",
      mv: 2,
      typeLine: "Instant",
      colors: ["U"]
    }),
    cardRecord("COUNTER_TARGET_SPELL", {
      oracleId: "eng-negate",
      name: "Negate",
      manaCost: "{1}{U}",
      mv: 2,
      typeLine: "Instant",
      colors: ["U"]
    }),
    cardRecord("COUNTER_TARGET_SPELL", {
      oracleId: "eng-cancel",
      name: "Cancel",
      manaCost: "{1}{U}{U}",
      mv: 3,
      typeLine: "Instant",
      colors: ["U"]
    }),
    cardRecord("ANTHEM_1_1", {
      oracleId: "eng-glorious-anthem",
      name: "Glorious Anthem",
      manaCost: "{1}{W}{W}",
      mv: 3,
      typeLine: "Enchantment",
      colors: ["W"]
    }),
    cardRecord("REPLACEMENT_DIES_EXILE", {
      oracleId: "eng-rest-in-peace",
      name: "Rest in Peace",
      manaCost: "{1}",
      mv: 1,
      typeLine: "Enchantment",
      colors: ["W"]
    }),
    cardRecord("AURA_BUFF_1_2", {
      oracleId: "eng-holy-strength",
      name: "Holy Strength",
      manaCost: "{W}",
      mv: 1,
      typeLine: "Enchantment - Aura",
      colors: ["W"]
    }),
    cardRecord("EQUIPMENT_BUFF_2_0", {
      oracleId: "eng-bonesplitter",
      name: "Bonesplitter",
      manaCost: "{1}",
      mv: 1,
      typeLine: "Artifact - Equipment"
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-isamaru",
      name: "Isamaru, Hound of Konda",
      manaCost: "{W}",
      mv: 1,
      typeLine: "Legendary Creature - Dog",
      power: "2",
      toughness: "2",
      colors: ["W"],
      colorIdentity: ["W"]
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-krenko",
      name: "Krenko, Tin Street Kingpin",
      manaCost: "{2}{R}",
      mv: 3,
      typeLine: "Legendary Creature - Goblin",
      power: "1",
      toughness: "2",
      colors: ["R"],
      colorIdentity: ["R"]
    }),
    cardRecord("PLANESWALKER_SIMPLE", {
      oracleId: "eng-jace",
      name: "Jace, Placeholder Adept",
      manaCost: "{3}{U}{U}",
      mv: 5,
      typeLine: "Planeswalker - Jace",
      loyalty: "4",
      colors: ["U"]
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-commander-test-a",
      name: "Captain Verity",
      manaCost: "{2}{W}{U}",
      mv: 4,
      typeLine: "Legendary Creature - Human Soldier",
      power: "3",
      toughness: "4",
      colors: ["W", "U"],
      colorIdentity: ["W", "U"]
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-commander-test-b",
      name: "Ravager of Embers",
      manaCost: "{3}{R}{R}",
      mv: 5,
      typeLine: "Legendary Creature - Dragon",
      power: "5",
      toughness: "4",
      colors: ["R"],
      colorIdentity: ["R"]
    }),
    cardRecord("VANILLA_CREATURE", {
      oracleId: "eng-commander-test-colossus",
      name: "Colossus Commander",
      manaCost: "{0}",
      mv: 0,
      typeLine: "Legendary Creature - Construct",
      power: "21",
      toughness: "21",
      colors: [],
      colorIdentity: []
    })
  ];
}

const EMBEDDED_ENGINE_SET = buildEngineSet();
const CUSTOM_ENGINE_CARD_NAMES = new Set(
  ["Fragile Hatchling", "Jace, Placeholder Adept", "Captain Verity", "Ravager of Embers", "Colossus Commander"].map(
    (name) => normalizeName(name)
  )
);
const CUSTOM_ENGINE_CARDS = EMBEDDED_ENGINE_SET.filter((card) =>
  CUSTOM_ENGINE_CARD_NAMES.has(normalizeName(card.name))
);
const BEHAVIOR_ID_BY_NAME = new Map<string, string>();
for (const card of EMBEDDED_ENGINE_SET) {
  if (typeof card.behaviorId === "string" && card.behaviorId.length > 0) {
    BEHAVIOR_ID_BY_NAME.set(normalizeName(card.name), card.behaviorId);
  }
}

const DEFAULT_COMPILED_FILE = "data/scryfall/oracle-cards.compiled.json";
const MISSING_COMPILED_HELP = `Run: npm run scryfall:update`;

type FsModule = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
};

type PathModule = {
  resolve: (...paths: string[]) => string;
};

function behaviorIdForCardName(name: string): string | undefined {
  return BEHAVIOR_ID_BY_NAME.get(normalizeName(name));
}

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

function getNodeBuiltin<T>(moduleName: string): T {
  const builtinLoader = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (typeof builtinLoader !== "function") {
    throw new Error(`Node builtin loader unavailable for module: ${moduleName}`);
  }

  return builtinLoader(moduleName) as T;
}

function resolveCompiledPath(filePath?: string): string {
  if (!isNodeRuntime()) {
    return filePath ?? DEFAULT_COMPILED_FILE;
  }

  const path = getNodeBuiltin<PathModule>("node:path");
  return path.resolve(filePath ?? DEFAULT_COMPILED_FILE);
}

export class CardDatabase {
  private static readonly compiledCache = new Map<string, CardDatabase>();
  private readonly byOracleId: Map<string, EngineCardDefinition>;
  private readonly byNameLower: Map<string, EngineCardDefinition>;
  private readonly behaviorRegistry: BehaviorRegistry;

  constructor(cards: EngineCardDefinition[] = [], behaviorRegistry: BehaviorRegistry = buildTemplateRegistry()) {
    this.byOracleId = new Map();
    this.byNameLower = new Map();
    this.behaviorRegistry = { ...behaviorRegistry };

    this.registerCards(cards);
  }

  static createWithEngineSet(): CardDatabase {
    return new CardDatabase(EMBEDDED_ENGINE_SET, buildTemplateRegistry());
  }

  static loadFromCompiledFile(filePath?: string): CardDatabase {
    if (!isNodeRuntime()) {
      return CardDatabase.createWithEngineSet();
    }

    const compiledPath = resolveCompiledPath(filePath);
    const cached = CardDatabase.compiledCache.get(compiledPath);
    if (cached) {
      return cached;
    }

    const fs = getNodeBuiltin<FsModule>("node:fs");
    if (!fs.existsSync(compiledPath)) {
      throw new Error(
        `Missing compiled Scryfall Oracle file: ${compiledPath}. ${MISSING_COMPILED_HELP}`
      );
    }

    const raw = fs.readFileSync(compiledPath, "utf8");
    const records = JSON.parse(raw) as ScryfallCard[];
    if (!Array.isArray(records)) {
      throw new Error(`Invalid compiled Oracle file format at ${compiledPath}: expected an array.`);
    }

    const db = new CardDatabase([], buildTemplateRegistry());
    const normalized = records
      .map((record) => normalizeScryfallCard(record))
      .filter((card): card is EngineCardDefinition => Boolean(card));
    db.registerCards(normalized);
    db.registerCards(CUSTOM_ENGINE_CARDS);
    CardDatabase.compiledCache.set(compiledPath, db);
    return db;
  }

  registerCards(cards: EngineCardDefinition[]): void {
    for (const card of cards) {
      this.byOracleId.set(card.oracleId, card);
      this.byNameLower.set(normalizeName(card.name), card);
    }
  }

  registerBehavior(behavior: CardBehavior): void {
    this.behaviorRegistry[behavior.id] = behavior;
  }

  behaviorCount(): number {
    return Object.keys(this.behaviorRegistry).length;
  }

  cardCount(): number {
    return this.byOracleId.size;
  }

  getCardByName(name: string): EngineCardDefinition | null {
    return this.byNameLower.get(normalizeName(name)) ?? null;
  }

  getCardByOracleId(oracleId: string): EngineCardDefinition | null {
    return this.byOracleId.get(oracleId) ?? null;
  }

  getBehavior(behaviorId: string | undefined): CardBehavior | null {
    if (!behaviorId) {
      return null;
    }

    return this.behaviorRegistry[behaviorId] ?? null;
  }

  behaviorIdForCardName(name: string): string | undefined {
    return behaviorIdForCardName(name);
  }

  allCards(): EngineCardDefinition[] {
    return [...this.byOracleId.values()];
  }
}
