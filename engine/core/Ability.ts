import type {
  AbilityDefinition,
  GameState,
  TargetKind,
  TriggerDefinition,
  TriggerEvent,
  ZoneChangeEvent
} from "./types";

export type BehaviorContext = {
  state: GameState;
  sourceCardId: string;
  controllerId: string;
  targetIds: string[];
  event?: TriggerEvent | ZoneChangeEvent;
};

export type BehaviorResult = {
  state: GameState;
};

export type SpellResolveHandler = (context: BehaviorContext) => BehaviorResult;
export type TriggerResolveHandler = (context: BehaviorContext) => BehaviorResult;
export type StaticAbilityRegistration = (state: GameState, sourceCardId: string) => GameState;

export type CardBehavior = {
  id: string;
  description: string;
  targetKind: TargetKind;
  activatedAbilities: AbilityDefinition[];
  triggeredAbilities: TriggerDefinition[];
  onResolveSpell?: SpellResolveHandler;
  onResolveTriggeredAbility?: Record<string, TriggerResolveHandler>;
  registerStaticEffects?: StaticAbilityRegistration;
  unregisterStaticEffects?: StaticAbilityRegistration;
};

export type BehaviorRegistry = Record<string, CardBehavior>;

export function createAbility(definition: {
  id: string;
  text: string;
  effectId: string;
  targetKind?: TargetKind;
  tapCost?: boolean;
  costMana?: string;
}): AbilityDefinition {
  return {
    id: definition.id,
    text: definition.text,
    effectId: definition.effectId,
    targetKind: definition.targetKind ?? "NONE",
    tapCost: definition.tapCost,
    costMana: definition.costMana
  };
}

export function createTrigger(definition: {
  id: string;
  event: TriggerDefinition["event"];
  text: string;
  optional?: boolean;
}): TriggerDefinition {
  return {
    id: definition.id,
    event: definition.event,
    text: definition.text,
    optional: Boolean(definition.optional)
  };
}
