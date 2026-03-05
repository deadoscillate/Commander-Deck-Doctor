import type { CardBehavior } from "./Ability";
import { isCreature, isInstant, isLand, isPermanent, isSorcery } from "./Card";
import { parseManaCost, canPayManaCost, payManaCost, withCommanderTax } from "./CostPayment";
import { createZoneChangeEvent, createTriggerEvent } from "./Event";
import {
  activePlayerId,
  adjustPlayerLife,
  drawCard,
  findPlayerIndex,
  getPlayer,
  markDamageOnCard,
  moveCardBetweenZones,
  removeCardFromAllZones,
  updateCard,
  updatePlayer
} from "./GameState";
import { appendLog } from "./Logger";
import { addManaToPlayer, clearManaPool } from "./ManaSystem";
import { untapAllControlledPermanents } from "./Permanent";
import { allPlayersPassed, markPriorityPassed, nextPriorityHolder, resetPriorityToActivePlayer } from "./Priority";
import { removePendingChoice } from "./ReplacementEffects";
import { computeCharacteristics } from "./LayerSystem";
import { popStack, pushToStackTop } from "./Stack";
import { collectStateBasedActions } from "./StateBasedActions";
import { targetsAreLegal } from "./Targeting";
import { hasPriorityInStep, nextTurnStep } from "./TurnStructure";
import { flushTriggerQueueToStack, queueTriggersForEvent } from "./TriggerSystem";
import type { CardDatabase } from "../cards/CardDatabase";
import { addCommanderCombatDamage } from "../formats/commander/CommanderDamage";
import { canCastCommanderFromCommandZone } from "../formats/commander/CommandZone";
import { commanderTaxForCard, markCommanderCastFromCommandZone } from "../formats/commander/CommanderTax";
import type {
  ActivateAbilityAction,
  CastSpellAction,
  ChooseReplacementAction,
  EngineAction,
  GameState,
  LegalAction,
  PayCostAction,
  PlayLandAction,
  StackAbility,
  StackSpell,
  TurnStep
} from "./types";

function stackId(state: GameState): string {
  return `stack-${state.log.length + state.stack.length + 1}`;
}

function behaviorForCard(state: GameState, db: CardDatabase, cardId: string): CardBehavior | null {
  const card = state.cardInstances[cardId];
  if (!card) {
    return null;
  }

  return db.getBehavior(card.definition.behaviorId);
}

function playerOrderFrom(state: GameState, startPlayerId: string): string[] {
  const alive = state.players.filter((player) => !player.lost).map((player) => player.id);
  const idx = alive.indexOf(startPlayerId);
  if (idx === -1) {
    return alive;
  }

  return [...alive.slice(idx), ...alive.slice(0, idx)];
}

function canCastAtSorcerySpeed(state: GameState, playerId: string): boolean {
  const active = activePlayerId(state);
  if (active !== playerId) {
    return false;
  }

  if (state.stack.length > 0) {
    return false;
  }

  return state.step === "MAIN1" || state.step === "MAIN2";
}

function canCastCardNow(state: GameState, cardId: string, sourceZone: "hand" | "command"): boolean {
  const card = state.cardInstances[cardId];
  if (!card) {
    return false;
  }

  if (sourceZone !== card.currentZone) {
    return false;
  }

  if (isLand(card.definition)) {
    return false;
  }

  if (isInstant(card.definition)) {
    return true;
  }

  return canCastAtSorcerySpeed(state, card.controllerId);
}

function resolveActivatedEffect(state: GameState, effectId: string, playerId: string, targetIds: string[]): GameState {
  if (effectId.startsWith("ADD_MANA_")) {
    const parts = effectId.split("_");
    const color = (parts[2] ?? "C") as "W" | "U" | "B" | "R" | "G" | "C" | "ANY";
    const amount = Number(parts[3] ?? 1);
    if (color === "ANY") {
      // Deterministic fallback for MVP; caller can add richer mana-choice action later.
      return updatePlayer(state, playerId, (player) => addManaToPlayer(player, "C", amount));
    }

    return updatePlayer(state, playerId, (player) => addManaToPlayer(player, color, amount));
  }

  if (effectId === "EQUIP_ATTACH") {
    const targetId = targetIds[0] ?? null;
    if (!targetId) {
      return state;
    }

    return state;
  }

  return state;
}

function processStateBasedActions(state: GameState): GameState {
  let next = state;

  for (let guard = 0; guard < 20; guard += 1) {
    const commands = collectStateBasedActions(next);
    if (commands.length === 0) {
      break;
    }

    for (const command of commands) {
      if (command.kind === "MOVE_CARD") {
        const card = next.cardInstances[command.cardId];
        if (!card || card.currentZone === command.toZone) {
          continue;
        }

        next = moveCardBetweenZones(
          next,
          createZoneChangeEvent({
            cardId: command.cardId,
            from: card.currentZone,
            to: command.toZone,
            reason: command.reason,
            controllerId: card.controllerId,
            ownerId: card.ownerId
          })
        );

        continue;
      }

      if (command.kind === "PLAYER_LOSES") {
        next = updatePlayer(next, command.playerId, (player) => ({
          ...player,
          lost: true
        }));
        next = appendLog(next, "PLAYER_LOSES", {
          playerId: command.playerId,
          message: command.message
        });
        continue;
      }

      if (command.kind === "REMOVE_TOKEN") {
        const existing = next.cardInstances[command.cardId];
        if (!existing) {
          continue;
        }

        next = removeCardFromAllZones(next, command.cardId);
        const cardInstances = { ...next.cardInstances };
        delete cardInstances[command.cardId];
        next = {
          ...next,
          cardInstances
        };
        next = appendLog(next, "TOKEN_REMOVED", {
          cardId: command.cardId,
          message: command.message
        });
      }
    }
  }

  return next;
}

function resolveCombatDamageStep(state: GameState): GameState {
  let next = state;

  for (const assignment of state.combat.assignments) {
    const attacker = next.cardInstances[assignment.attackerId];
    if (!attacker || attacker.currentZone !== "battlefield") {
      continue;
    }

    if (assignment.blockedByIds.length > 0) {
      continue;
    }

    const power = computeCharacteristics(next, attacker).power;
    if (power <= 0) {
      continue;
    }

    next = adjustPlayerLife(next, assignment.defenderPlayerId, -power, `Combat damage by ${attacker.definition.name}`);

    if (Object.values(next.commander.commanderIdsByPlayer).some((ids) => ids.includes(attacker.id))) {
      next = addCommanderCombatDamage(next, attacker.id, assignment.defenderPlayerId, power);
    }

    next = appendLog(next, "COMBAT_DAMAGE", {
      attackerId: attacker.id,
      defenderPlayerId: assignment.defenderPlayerId,
      amount: power
    });
  }

  return processStateBasedActions(next);
}

function lookupBehavior(state: GameState, db: CardDatabase, cardId: string): CardBehavior | null {
  const card = state.cardInstances[cardId];
  if (!card) {
    return null;
  }

  return db.getBehavior(card.definition.behaviorId);
}

function queueCreatureEnterTrigger(state: GameState, db: CardDatabase, cardId: string): GameState {
  const card = state.cardInstances[cardId];
  if (!card || !isCreature(card.definition) || card.currentZone !== "battlefield") {
    return state;
  }

  return queueTriggersForEvent(
    state,
    createTriggerEvent("CREATURE_ENTERS_BATTLEFIELD", {
      sourceCardId: cardId,
      subjectCardId: cardId,
      playerId: card.controllerId
    }),
    (sourceCardId) => lookupBehavior(state, db, sourceCardId)
  );
}

function resolveTopOfStack(state: GameState, db: CardDatabase): GameState {
  const popped = popStack(state);
  let next = popped.state;
  const item = popped.item;
  if (!item) {
    return next;
  }

  if (item.kind === "SPELL") {
    const card = next.cardInstances[item.cardId];
    if (!card) {
      return next;
    }

    const behavior = behaviorForCard(next, db, item.cardId);
    next = appendLog(next, "RESOLVE_SPELL", {
      stackItemId: item.id,
      cardId: item.cardId,
      cardName: card.definition.name
    });

    if (isPermanent(card.definition)) {
      next = moveCardBetweenZones(
        next,
        createZoneChangeEvent({
          cardId: item.cardId,
          from: "stack",
          to: "battlefield",
          reason: "CAST_RESOLVE",
          controllerId: card.controllerId,
          ownerId: card.ownerId
        })
      );

      if (behavior?.onResolveSpell) {
        next = behavior.onResolveSpell({
          state: next,
          sourceCardId: item.cardId,
          controllerId: item.controllerId,
          targetIds: item.targetIds
        }).state;
      }

      if (behavior?.registerStaticEffects) {
        next = behavior.registerStaticEffects(next, item.cardId);
      }

      next = queueCreatureEnterTrigger(next, db, item.cardId);
    } else {
      if (behavior?.onResolveSpell) {
        next = behavior.onResolveSpell({
          state: next,
          sourceCardId: item.cardId,
          controllerId: item.controllerId,
          targetIds: item.targetIds
        }).state;
      }

      const resolvedCard = next.cardInstances[item.cardId];
      if (resolvedCard) {
        next = moveCardBetweenZones(
          next,
          createZoneChangeEvent({
            cardId: resolvedCard.id,
            from: "stack",
            to: "graveyard",
            reason: "SPELL_RESOLVE",
            controllerId: resolvedCard.controllerId,
            ownerId: resolvedCard.ownerId
          })
        );
      }
    }
  }

  if (item.kind === "ABILITY") {
    next = appendLog(next, "RESOLVE_ABILITY", {
      stackItemId: item.id,
      sourceCardId: item.sourceCardId,
      abilityId: item.abilityId
    });

    const behavior = behaviorForCard(next, db, item.sourceCardId);
    if (behavior?.onResolveTriggeredAbility?.[item.abilityId]) {
      next = behavior.onResolveTriggeredAbility[item.abilityId]({
        state: next,
        sourceCardId: item.sourceCardId,
        controllerId: item.controllerId,
        targetIds: item.targetIds
      }).state;
    }
  }

  next = processStateBasedActions(next);
  next = flushTriggerQueueToStack(next);
  next = resetPriorityToActivePlayer(next);

  return next;
}

function resetTurnFlagsForNewTurn(state: GameState): GameState {
  const activeId = activePlayerId(state);
  return updatePlayer(state, activeId, (player) => ({
    ...player,
    hasPlayedLandThisTurn: false
  }));
}

function advanceToNextStep(state: GameState, db: CardDatabase): GameState {
  let next = state;

  for (let guard = 0; guard < 20; guard += 1) {
    const progressed = nextTurnStep(next.step);
    let activePlayerIndex = next.activePlayerIndex;
    let turnNumber = next.turnNumber;

    if (progressed.wrapped) {
      const alive = next.players.filter((player) => !player.lost);
      if (alive.length > 0) {
        const activeId = activePlayerId(next);
        const ordered = playerOrderFrom(next, activeId);
        const nextId = ordered[1 % ordered.length] ?? activeId;
        const idx = findPlayerIndex(next, nextId);
        if (idx >= 0) {
          activePlayerIndex = idx;
        }
      }

      turnNumber += 1;
    }

    next = {
      ...next,
      activePlayerIndex,
      turnNumber,
      step: progressed.step,
      priorityHolderPlayerId: null,
      passedPriorityPlayerIds: []
    };

    if (progressed.wrapped) {
      next = resetTurnFlagsForNewTurn(next);
    }

    if (next.step === "UNTAP") {
      const active = activePlayerId(next);
      next = untapAllControlledPermanents(next, active);
      next = updatePlayer(next, active, (player) => ({
        ...player,
        hasPlayedLandThisTurn: false
      }));
      next = appendLog(next, "STEP_UNTAP", { playerId: active });
      continue;
    }

    if (next.step === "DRAW") {
      next = drawCard(next, activePlayerId(next), 1);
    }

    if (next.step === "COMBAT_DAMAGE") {
      next = resolveCombatDamageStep(next);
    }

    if (next.step === "CLEANUP") {
      next = {
        ...next,
        combat: {
          assignments: [],
          declared: false
        }
      };
      next = {
        ...next,
        players: next.players.map((player) => clearManaPool(player))
      };
      continue;
    }

    if (hasPriorityInStep(next.step)) {
      next = resetPriorityToActivePlayer(next);
      break;
    }
  }

  return next;
}

function validateCastTargets(state: GameState, db: CardDatabase, action: CastSpellAction): boolean {
  const behavior = behaviorForCard(state, db, action.cardId);
  if (!behavior) {
    return true;
  }

  return targetsAreLegal(state, action.playerId, behavior.targetKind, action.targetIds ?? []);
}

function applyCastSpell(state: GameState, action: CastSpellAction, db: CardDatabase): GameState {
  let next = state;
  const card = next.cardInstances[action.cardId];
  if (!card || card.controllerId !== action.playerId) {
    return next;
  }

  if (next.priorityHolderPlayerId !== action.playerId) {
    return next;
  }

  if (!canCastCardNow(next, card.id, action.sourceZone)) {
    return next;
  }

  if (!validateCastTargets(next, db, action)) {
    return next;
  }

  const baseCost = parseManaCost(card.definition.manaCost);
  const finalCost =
    action.sourceZone === "command"
      ? withCommanderTax(baseCost, commanderTaxForCard(next, card.id) / 2)
      : baseCost;

  const caster = getPlayer(next, action.playerId);
  if (!caster) {
    return next;
  }

  if (!canPayManaCost(caster.manaPool, finalCost)) {
    return next;
  }

  next = updatePlayer(next, action.playerId, (player) => payManaCost(player, finalCost));

  const castFromCommandZone = action.sourceZone === "command" && canCastCommanderFromCommandZone(next, action.playerId, card.id);

  next = moveCardBetweenZones(
    next,
    createZoneChangeEvent({
      cardId: card.id,
      from: card.currentZone,
      to: "stack",
      reason: "CAST_RESOLVE",
      controllerId: card.controllerId,
      ownerId: card.ownerId
    }),
    { skipReplacement: true }
  );

  if (castFromCommandZone) {
    next = markCommanderCastFromCommandZone(next, card.id);
  }

  const stackSpell: StackSpell = {
    kind: "SPELL",
    id: stackId(next),
    cardId: card.id,
    controllerId: action.playerId,
    sourceZone: action.sourceZone,
    targetIds: action.targetIds ?? [],
    chosenValueX: 0
  };

  next = pushToStackTop(next, stackSpell);
  next = appendLog(next, "CAST_SPELL", {
    playerId: action.playerId,
    cardId: card.id,
    cardName: card.definition.name,
    sourceZone: action.sourceZone,
    targets: action.targetIds ?? []
  });

  next = {
    ...next,
    priorityHolderPlayerId: action.playerId,
    passedPriorityPlayerIds: []
  };

  return next;
}

function applyPlayLand(state: GameState, action: PlayLandAction, db: CardDatabase): GameState {
  const card = state.cardInstances[action.cardId];
  if (!card || card.controllerId !== action.playerId) {
    return state;
  }

  if (state.priorityHolderPlayerId !== action.playerId) {
    return state;
  }

  if (card.currentZone !== "hand" || !isLand(card.definition)) {
    return state;
  }

  if (activePlayerId(state) !== action.playerId || !(state.step === "MAIN1" || state.step === "MAIN2")) {
    return state;
  }

  const player = getPlayer(state, action.playerId);
  if (!player || player.hasPlayedLandThisTurn) {
    return state;
  }

  let next = moveCardBetweenZones(
    state,
    createZoneChangeEvent({
      cardId: card.id,
      from: "hand",
      to: "battlefield",
      reason: "PLAY_LAND",
      controllerId: card.controllerId,
      ownerId: card.ownerId
    })
  );

  next = updatePlayer(next, action.playerId, (current) => ({
    ...current,
    hasPlayedLandThisTurn: true
  }));

  const behavior = behaviorForCard(next, db, card.id);
  if (behavior?.registerStaticEffects) {
    next = behavior.registerStaticEffects(next, card.id);
  }

  return appendLog(next, "PLAY_LAND", {
    playerId: action.playerId,
    cardId: card.id,
    cardName: card.definition.name
  });
}

function applyActivateAbility(state: GameState, action: ActivateAbilityAction, db: CardDatabase): GameState {
  const source = state.cardInstances[action.sourceCardId];
  if (!source || source.currentZone !== "battlefield") {
    return state;
  }

  if (source.controllerId !== action.playerId || state.priorityHolderPlayerId !== action.playerId) {
    return state;
  }

  const behavior = behaviorForCard(state, db, source.id);
  if (!behavior) {
    return state;
  }

  const ability = behavior.activatedAbilities.find((item) => item.id === action.abilityId);
  if (!ability) {
    return state;
  }

  if (ability.tapCost && source.tapped) {
    return state;
  }

  if (!targetsAreLegal(state, action.playerId, ability.targetKind, action.targetIds ?? [])) {
    return state;
  }

  let next = state;

  if (ability.costMana) {
    const player = getPlayer(next, action.playerId);
    if (!player) {
      return state;
    }

    const parsed = parseManaCost(ability.costMana);
    if (!canPayManaCost(player.manaPool, parsed)) {
      return state;
    }

    next = updatePlayer(next, action.playerId, (current) => payManaCost(current, parsed));
  }

  if (ability.tapCost) {
    next = updateCard(next, source.id, (card) => ({
      ...card,
      tapped: true
    }));
  }

  if (ability.effectId.startsWith("ADD_MANA_")) {
    next = resolveActivatedEffect(next, ability.effectId, action.playerId, action.targetIds ?? []);
    next = appendLog(next, "ACTIVATE_MANA_ABILITY", {
      playerId: action.playerId,
      sourceCardId: source.id,
      effectId: ability.effectId
    });
    return next;
  }

  const stackAbility: StackAbility = {
    kind: "ABILITY",
    id: stackId(next),
    sourceCardId: source.id,
    controllerId: action.playerId,
    abilityId: ability.id,
    targetIds: action.targetIds ?? []
  };

  next = pushToStackTop(next, stackAbility);
  next = appendLog(next, "ACTIVATE_ABILITY", {
    playerId: action.playerId,
    sourceCardId: source.id,
    abilityId: ability.id
  });

  return next;
}

function applyChooseReplacement(state: GameState, action: ChooseReplacementAction): GameState {
  const choice = state.pendingChoices.find((item) => item.id === action.choiceId && item.playerId === action.playerId);
  if (!choice) {
    return state;
  }

  const card = state.cardInstances[choice.pendingEvent.cardId];
  if (!card) {
    return removePendingChoice(state, choice.id);
  }

  let event = choice.pendingEvent;
  if (action.optionId === "APPLY_REPLACEMENT") {
    event = {
      ...event,
      to: "command",
      reason: "COMMANDER_REPLACEMENT"
    };
  }

  let next = removePendingChoice(state, choice.id);
  next = moveCardBetweenZones(next, event, { skipReplacement: true });
  next = appendLog(next, "CHOICE_RESOLVED", {
    choiceId: choice.id,
    optionId: action.optionId,
    cardId: card.id,
    resultingZone: event.to
  });

  return next;
}

function applyPassPriority(state: GameState, actionPlayerId: string, db: CardDatabase): GameState {
  let next = markPriorityPassed(state, actionPlayerId);

  if (!allPlayersPassed(next)) {
    next = {
      ...next,
      priorityHolderPlayerId: nextPriorityHolder(next)
    };
    return appendLog(next, "PASS_PRIORITY", {
      playerId: actionPlayerId,
      allPassed: false,
      passedPlayers: next.passedPriorityPlayerIds
    });
  }

  next = appendLog(next, "PASS_PRIORITY", {
    playerId: actionPlayerId,
    allPassed: true,
    passedPlayers: next.passedPriorityPlayerIds
  });

  if (next.stack.length > 0) {
    next = resolveTopOfStack(next, db);
    return next;
  }

  next = advanceToNextStep(next, db);
  return next;
}

export function getLegalActions(state: GameState, playerId: string, db: CardDatabase): LegalAction[] {
  const player = getPlayer(state, playerId);
  if (!player || player.lost) {
    return [];
  }

  if (state.pendingChoices.length > 0) {
    return state.pendingChoices
      .filter((choice) => choice.playerId === playerId)
      .flatMap((choice) =>
        choice.options.map((option) => ({
          type: "CHOOSE_REPLACEMENT" as const,
          playerId,
          choiceId: choice.id,
          optionId: option.id
        }))
      );
  }

  if (state.priorityHolderPlayerId !== playerId) {
    return [];
  }

  const actions: LegalAction[] = [
    {
      type: "PASS_PRIORITY",
      playerId
    }
  ];

  if (activePlayerId(state) === playerId && (state.step === "MAIN1" || state.step === "MAIN2") && !player.hasPlayedLandThisTurn) {
    for (const cardId of player.zones.hand.cardIds) {
      const card = state.cardInstances[cardId];
      if (!card || !isLand(card.definition)) {
        continue;
      }

      actions.push({
        type: "PLAY_LAND",
        playerId,
        cardId
      });
    }
  }

  const spellSources: Array<{ cardId: string; sourceZone: "hand" | "command" }> = [
    ...player.zones.hand.cardIds.map((cardId) => ({ cardId, sourceZone: "hand" as const })),
    ...player.zones.command.cardIds.map((cardId) => ({ cardId, sourceZone: "command" as const }))
  ];

  for (const source of spellSources) {
    const card = state.cardInstances[source.cardId];
    if (!card || !canCastCardNow(state, source.cardId, source.sourceZone)) {
      continue;
    }

    const parsed = parseManaCost(card.definition.manaCost);
    const cost = source.sourceZone === "command" ? withCommanderTax(parsed, commanderTaxForCard(state, source.cardId) / 2) : parsed;
    if (!canPayManaCost(player.manaPool, cost)) {
      continue;
    }

    actions.push({
      type: "CAST_SPELL",
      playerId,
      cardId: source.cardId,
      sourceZone: source.sourceZone,
      targetIds: []
    });
  }

  for (const permanentId of player.zones.battlefield.cardIds) {
    const behavior = behaviorForCard(state, db, permanentId);
    if (!behavior) {
      continue;
    }

    for (const ability of behavior.activatedAbilities) {
      actions.push({
        type: "ACTIVATE_ABILITY",
        playerId,
        sourceCardId: permanentId,
        abilityId: ability.id,
        targetIds: []
      });
    }
  }

  if (state.step === "DECLARE_ATTACKERS" && activePlayerId(state) === playerId) {
    actions.push({
      type: "ATTACK_DECLARE",
      playerId,
      assignments: []
    });
  }

  if (state.step === "DECLARE_BLOCKERS" && activePlayerId(state) !== playerId) {
    actions.push({
      type: "BLOCK_DECLARE",
      playerId,
      assignments: []
    });
  }

  return actions;
}

function applyAttackDeclare(state: GameState, action: Extract<EngineAction, { type: "ATTACK_DECLARE" }>): GameState {
  if (state.step !== "DECLARE_ATTACKERS" || activePlayerId(state) !== action.playerId) {
    return state;
  }

  const assignments = action.assignments
    .filter((assignment) => {
      const attacker = state.cardInstances[assignment.attackerId];
      return (
        attacker &&
        attacker.currentZone === "battlefield" &&
        attacker.controllerId === action.playerId &&
        !attacker.tapped
      );
    })
    .map((assignment) => ({
      attackerId: assignment.attackerId,
      defenderPlayerId: assignment.defenderPlayerId,
      blockedByIds: [] as string[]
    }));

  let next = state;
  for (const assignment of assignments) {
    next = updateCard(next, assignment.attackerId, (card) => ({
      ...card,
      tapped: true
    }));
  }

  return appendLog(
    {
      ...next,
      combat: {
        assignments,
        declared: true
      }
    },
    "DECLARE_ATTACKERS",
    {
      playerId: action.playerId,
      assignments
    }
  );
}

function applyBlockDeclare(state: GameState, action: Extract<EngineAction, { type: "BLOCK_DECLARE" }>): GameState {
  if (state.step !== "DECLARE_BLOCKERS") {
    return state;
  }

  const assignments = state.combat.assignments.map((assignment) => ({ ...assignment, blockedByIds: [...assignment.blockedByIds] }));
  for (const block of action.assignments) {
    const attacker = assignments.find((item) => item.attackerId === block.attackerId);
    const blocker = state.cardInstances[block.blockerId];
    if (!attacker || !blocker || blocker.currentZone !== "battlefield") {
      continue;
    }

    if (!attacker.blockedByIds.includes(block.blockerId)) {
      attacker.blockedByIds.push(block.blockerId);
    }
  }

  return appendLog(
    {
      ...state,
      combat: {
        ...state.combat,
        assignments
      }
    },
    "DECLARE_BLOCKERS",
    {
      playerId: action.playerId,
      assignments: action.assignments
    }
  );
}

export function applyAction(state: GameState, action: EngineAction, db: CardDatabase): GameState {
  if (action.type === "CAST_SPELL") {
    return applyCastSpell(state, action, db);
  }

  if (action.type === "PLAY_LAND") {
    return applyPlayLand(state, action, db);
  }

  if (action.type === "ACTIVATE_ABILITY") {
    return applyActivateAbility(state, action, db);
  }

  if (action.type === "PASS_PRIORITY") {
    return applyPassPriority(state, action.playerId, db);
  }

  if (action.type === "CHOOSE_REPLACEMENT") {
    return applyChooseReplacement(state, action);
  }

  if (action.type === "ATTACK_DECLARE") {
    return applyAttackDeclare(state, action);
  }

  if (action.type === "BLOCK_DECLARE") {
    return applyBlockDeclare(state, action);
  }

  if (action.type === "PAY_COST") {
    const _noop: PayCostAction = action;
    return state;
  }

  return state;
}

export function step(state: GameState, db: CardDatabase): GameState {
  if (state.pendingChoices.length > 0) {
    return state;
  }

  if (state.stack.length > 0 && allPlayersPassed(state)) {
    return resolveTopOfStack(state, db);
  }

  if (!state.priorityHolderPlayerId) {
    return advanceToNextStep(state, db);
  }

  return state;
}

export function getSummary(state: GameState): import("./types").GameSummary {
  return {
    turnNumber: state.turnNumber,
    step: state.step,
    activePlayerId: activePlayerId(state),
    priorityHolderPlayerId: state.priorityHolderPlayerId,
    stackDepth: state.stack.length,
    players: state.players.map((player) => ({
      id: player.id,
      life: player.life,
      lost: player.lost,
      handSize: player.zones.hand.cardIds.length,
      battlefieldCount: player.zones.battlefield.cardIds.length,
      graveyardCount: player.zones.graveyard.cardIds.length,
      commandZoneCount: player.zones.command.cardIds.length
    })),
    pendingChoices: state.pendingChoices.length,
    logLength: state.log.length
  };
}
