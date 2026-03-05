export type ManaColor = "W" | "U" | "B" | "R" | "G" | "C";

export type ParsedTypeLine = {
  supertypes: string[];
  types: string[];
  subtypes: string[];
};

export type CardFaceDefinition = {
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string;
  colors: string[];
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
};

export type CardDefinition = {
  oracleId: string;
  name: string;
  faces: CardFaceDefinition[];
  manaCost: string;
  mv: number;
  typeLine: string;
  parsedTypeLine: ParsedTypeLine;
  colors: string[];
  colorIdentity: string[];
  oracleText: string;
  keywords: string[];
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  legalities: Record<string, string>;
  behaviorId?: string;
};

export type ZoneName =
  | "library"
  | "hand"
  | "battlefield"
  | "graveyard"
  | "exile"
  | "stack"
  | "command";

export type CardInstance = {
  id: string;
  definition: CardDefinition;
  ownerId: string;
  controllerId: string;
  currentZone: ZoneName;
  tapped: boolean;
  damageMarked: number;
  counters: Record<string, number>;
  isToken: boolean;
  summoningSick: boolean;
  attachedToId: string | null;
  castFromCommandZoneCount: number;
};

export type ZoneState = {
  name: ZoneName;
  cardIds: string[];
  ordered: boolean;
};

export type ManaPool = Record<ManaColor, number>;

export type PlayerState = {
  id: string;
  name: string;
  life: number;
  lost: boolean;
  manaPool: ManaPool;
  zones: Record<ZoneName, ZoneState>;
  hasPlayedLandThisTurn: boolean;
};

export type TriggerEventType =
  | "CREATURE_ENTERS_BATTLEFIELD"
  | "SELF_ENTERS_BATTLEFIELD"
  | "CARD_MOVES_ZONE"
  | "COMBAT_DAMAGE_TO_PLAYER";

export type TriggerDefinition = {
  id: string;
  event: TriggerEventType;
  text: string;
  optional: boolean;
};

export type AbilityDefinition = {
  id: string;
  text: string;
  costMana?: string;
  tapCost?: boolean;
  effectId: string;
  targetKind: TargetKind;
};

export type TargetKind =
  | "NONE"
  | "TARGET_CREATURE"
  | "TARGET_PLAYER"
  | "TARGET_CREATURE_OR_PLAYER"
  | "TARGET_SPELL";

export type StackSpell = {
  kind: "SPELL";
  id: string;
  cardId: string;
  controllerId: string;
  sourceZone: ZoneName;
  targetIds: string[];
  chosenValueX: number;
};

export type StackAbility = {
  kind: "ABILITY";
  id: string;
  sourceCardId: string;
  controllerId: string;
  abilityId: string;
  targetIds: string[];
};

export type StackItem = StackSpell | StackAbility;

export type ReplacementEffectKind =
  | "COMMANDER_MOVE_TO_COMMAND_ZONE"
  | "ZONE_CHANGE_DESTINATION_OVERRIDE";

export type ReplacementEffect = {
  id: string;
  sourceCardId: string | null;
  controllerId: string;
  kind: ReplacementEffectKind;
  active: boolean;
  params: Record<string, string | number | boolean | string[]>;
};

export type ZoneChangeReason =
  | "CAST_RESOLVE"
  | "SPELL_RESOLVE"
  | "SBA"
  | "COMBAT"
  | "DESTROY"
  | "DISCARD"
  | "DRAW"
  | "PLAY_LAND"
  | "COMMANDER_REPLACEMENT"
  | "UNKNOWN";

export type ZoneChangeEvent = {
  kind: "ZONE_CHANGE";
  cardId: string;
  from: ZoneName;
  to: ZoneName;
  reason: ZoneChangeReason;
  controllerId: string;
  ownerId: string;
};

export type ReplacementResult =
  | {
      outcome: "UNCHANGED";
      event: ZoneChangeEvent;
    }
  | {
      outcome: "REPLACED";
      event: ZoneChangeEvent;
      replacementEffectId: string;
    }
  | {
      outcome: "CHOICE_REQUIRED";
      choice: PendingChoice;
    };

export type ContinuousEffectLayer =
  | "COPY"
  | "CONTROL"
  | "TEXT"
  | "TYPE"
  | "COLOR"
  | "ABILITY"
  | "PT_BASE"
  | "PT_MODIFY"
  | "PT_SWITCH";

export type ContinuousEffect = {
  id: string;
  sourceCardId: string;
  controllerId: string;
  active: boolean;
  layer: ContinuousEffectLayer;
  appliesTo: "SELF" | "CREATURES_YOU_CONTROL" | "ENCHANTED_OR_EQUIPPED";
  powerDelta: number;
  toughnessDelta: number;
  expiresAtTurn: number | null;
};

export type QueuedTrigger = {
  id: string;
  sourceCardId: string;
  controllerId: string;
  triggerId: string;
  eventSnapshot: TriggerEvent;
};

export type TriggerEvent = {
  type: TriggerEventType;
  sourceCardId: string | null;
  subjectCardId: string | null;
  playerId: string | null;
  amount: number | null;
  details: Record<string, string | number | boolean | null>;
};

export type TurnStep =
  | "UNTAP"
  | "UPKEEP"
  | "DRAW"
  | "MAIN1"
  | "COMBAT_BEGIN"
  | "DECLARE_ATTACKERS"
  | "DECLARE_BLOCKERS"
  | "COMBAT_DAMAGE"
  | "COMBAT_END"
  | "MAIN2"
  | "END"
  | "CLEANUP";

export type CombatAttackAssignment = {
  attackerId: string;
  defenderPlayerId: string;
  blockedByIds: string[];
};

export type CombatState = {
  assignments: CombatAttackAssignment[];
  declared: boolean;
};

export type PendingChoice = {
  id: string;
  playerId: string;
  kind: "REPLACEMENT";
  prompt: string;
  replacementEffectId: string;
  pendingEvent: ZoneChangeEvent;
  options: Array<{
    id: "APPLY_REPLACEMENT" | "KEEP_EVENT";
    label: string;
  }>;
};

export type CommanderDamageTracker = Record<string, Record<string, number>>;

export type CommanderState = {
  commanderIdsByPlayer: Record<string, string[]>;
  castCountByCommanderId: Record<string, number>;
  damageByCommanderToPlayer: CommanderDamageTracker;
};

export type RulesVersionMetadata = {
  comprehensiveRules: {
    source: string;
    versionTag: string;
  };
  commanderRules: {
    source: string;
    versionTag: string;
  };
  scryfallSchema: {
    source: string;
    versionTag: string;
  };
};

export type GameLogEvent = {
  seq: number;
  turn: number;
  step: TurnStep;
  type: string;
  payload: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
};

export type RNGState = {
  seed: string;
  state: number;
};

export type GameState = {
  id: string;
  format: "commander";
  players: PlayerState[];
  cardInstances: Record<string, CardInstance>;
  activePlayerIndex: number;
  turnNumber: number;
  step: TurnStep;
  priorityHolderPlayerId: string | null;
  passedPriorityPlayerIds: string[];
  stack: StackItem[];
  replacementEffects: ReplacementEffect[];
  triggerQueue: QueuedTrigger[];
  continuousEffects: ContinuousEffect[];
  pendingChoices: PendingChoice[];
  combat: CombatState;
  commander: CommanderState;
  rulesVersion: RulesVersionMetadata;
  rng: RNGState;
  log: GameLogEvent[];
};

export type DeckCardInput = {
  card: CardDefinition;
  qty: number;
};

export type PlayerInput = {
  id: string;
  name: string;
};

export type CreateGameInput = {
  format: "commander";
  players: PlayerInput[];
  decks: Record<string, DeckCardInput[]>;
  commanders: Record<string, string[]>;
  seed: string | number;
  rulesVersion?: Partial<RulesVersionMetadata>;
};

export type CastSpellAction = {
  type: "CAST_SPELL";
  playerId: string;
  cardId: string;
  sourceZone: "hand" | "command";
  targetIds?: string[];
};

export type ActivateAbilityAction = {
  type: "ACTIVATE_ABILITY";
  playerId: string;
  sourceCardId: string;
  abilityId: string;
  targetIds?: string[];
};

export type PlayLandAction = {
  type: "PLAY_LAND";
  playerId: string;
  cardId: string;
};

export type AttackDeclareAction = {
  type: "ATTACK_DECLARE";
  playerId: string;
  assignments: Array<{
    attackerId: string;
    defenderPlayerId: string;
  }>;
};

export type BlockDeclareAction = {
  type: "BLOCK_DECLARE";
  playerId: string;
  assignments: Array<{
    attackerId: string;
    blockerId: string;
  }>;
};

export type PassPriorityAction = {
  type: "PASS_PRIORITY";
  playerId: string;
};

export type ChooseReplacementAction = {
  type: "CHOOSE_REPLACEMENT";
  playerId: string;
  choiceId: string;
  optionId: "APPLY_REPLACEMENT" | "KEEP_EVENT";
};

export type ChooseTargetsAction = {
  type: "CHOOSE_TARGETS";
  playerId: string;
  stackItemId: string;
  targetIds: string[];
};

export type PayCostAction = {
  type: "PAY_COST";
  playerId: string;
  stackItemId: string;
};

export type EngineAction =
  | CastSpellAction
  | ActivateAbilityAction
  | PlayLandAction
  | AttackDeclareAction
  | BlockDeclareAction
  | PassPriorityAction
  | ChooseReplacementAction
  | ChooseTargetsAction
  | PayCostAction;

export type LegalAction =
  | CastSpellAction
  | ActivateAbilityAction
  | PlayLandAction
  | AttackDeclareAction
  | BlockDeclareAction
  | PassPriorityAction
  | ChooseReplacementAction;

export type GameSummary = {
  turnNumber: number;
  step: TurnStep;
  activePlayerId: string;
  priorityHolderPlayerId: string | null;
  stackDepth: number;
  players: Array<{
    id: string;
    life: number;
    lost: boolean;
    handSize: number;
    battlefieldCount: number;
    graveyardCount: number;
    commandZoneCount: number;
  }>;
  pendingChoices: number;
  logLength: number;
};
