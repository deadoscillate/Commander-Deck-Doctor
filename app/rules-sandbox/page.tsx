"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActionPanel } from "@/components/sandbox/ActionPanel";
import { BattlefieldPanel } from "@/components/sandbox/BattlefieldPanel";
import { ChoiceModal } from "@/components/sandbox/ChoiceModal";
import { CommanderZonePanel } from "@/components/sandbox/CommanderZonePanel";
import { GameLogPanel } from "@/components/sandbox/GameLogPanel";
import { PlayersPanel } from "@/components/sandbox/PlayersPanel";
import { StackPanel } from "@/components/sandbox/StackPanel";
import { TimelineControls } from "@/components/sandbox/TimelineControls";
import { TurnPhasePanel } from "@/components/sandbox/TurnPhasePanel";
import {
  engineClient,
  type ActionDescriptor,
  type GameState,
  type LegalAction,
  type TargetOption
} from "@/lib/engineClient";
import {
  createReplayController,
  displayedState,
  goLive,
  replayCurrentIndex,
  replayEventCount,
  setReplayIndex as setControllerReplayIndex,
  syncReplayLiveState,
  toggleLive,
  type ReplayControllerState
} from "@/lib/replayController";

type PendingTargetSelection = {
  descriptor: ActionDescriptor;
  selectedIds: string[];
};

function createInitialController(seed?: string): ReplayControllerState {
  return createReplayController(engineClient.createSandboxGame(seed));
}

function toggleTarget(
  options: TargetOption[],
  selected: string[],
  targetId: string,
  requiredCount: number
): string[] {
  if (requiredCount <= 1) {
    return [targetId];
  }

  if (selected.includes(targetId)) {
    return selected.filter((id) => id !== targetId);
  }

  if (selected.length >= requiredCount) {
    return selected;
  }

  if (!options.some((option) => option.id === targetId)) {
    return selected;
  }

  return [...selected, targetId];
}

export default function RulesSandboxPage() {
  const [seed, setSeed] = useState("rules-sandbox");
  const [replay, setReplay] = useState<ReplayControllerState>(() => createInitialController(seed));
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targetSelection, setTargetSelection] = useState<PendingTargetSelection | null>(null);
  const [replacementChoiceOption, setReplacementChoiceOption] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(false);

  const state = useMemo(() => displayedState(replay), [replay]);
  const currentIndex = replayCurrentIndex(replay);
  const totalEvents = replayEventCount(replay);

  const legalActions = useMemo(() => engineClient.describeLegalActions(state), [state]);
  const visibleActions = useMemo(
    () => legalActions.filter((row) => row.action.type !== "CHOOSE_REPLACEMENT"),
    [legalActions]
  );
  const activationActions = useMemo(
    () => legalActions.filter((row) => row.action.type === "ACTIVATE_ABILITY"),
    [legalActions]
  );

  const replacementChoice = replay.isLive ? state.pendingChoices[0] ?? null : null;

  useEffect(() => {
    if (!replacementChoice) {
      setReplacementChoiceOption(null);
      return;
    }

    setReplacementChoiceOption(replacementChoice.options[0]?.id ?? null);
  }, [replacementChoice]);

  useEffect(() => {
    if (!autoplay || replay.isLive) {
      return;
    }

    const interval = setInterval(() => {
      setReplay((previous) => {
        if (previous.isLive) {
          return previous;
        }

        const index = replayCurrentIndex(previous);
        if (index >= previous.events.length) {
          return previous;
        }

        return setControllerReplayIndex(previous, index + 1);
      });
    }, 300);

    return () => clearInterval(interval);
  }, [autoplay, replay.isLive]);

  useEffect(() => {
    if (!autoplay || replay.isLive) {
      return;
    }

    if (replayCurrentIndex(replay) >= replay.events.length) {
      setAutoplay(false);
    }
  }, [autoplay, replay]);

  function commitLiveState(nextState: GameState) {
    setReplay((previous) => syncReplayLiveState(previous, nextState));
  }

  function applyLiveAction(action: LegalAction, targetIds: string[] = []) {
    if (!replay.isLive) {
      return;
    }

    const next = engineClient.applyAction(replay.liveState, action, targetIds);
    commitLiveState(next);
  }

  function handleAction(action: ActionDescriptor) {
    if (!replay.isLive) {
      return;
    }

    if (action.requiresTargets) {
      setTargetSelection({
        descriptor: action,
        selectedIds: []
      });
      return;
    }

    applyLiveAction(action.action);
  }

  function handleNextStep() {
    if (!replay.isLive) {
      return;
    }

    commitLiveState(engineClient.runNextStep(replay.liveState));
  }

  function handleNextTurn() {
    if (!replay.isLive) {
      return;
    }

    commitLiveState(engineClient.runNextTurn(replay.liveState));
  }

  function handleAutoResolveStack() {
    if (!replay.isLive) {
      return;
    }

    commitLiveState(engineClient.autoResolveStack(replay.liveState));
  }

  function handleTimelineIndex(index: number) {
    setAutoplay(false);
    setReplay((previous) => setControllerReplayIndex(previous, index));
  }

  function handleToggleLive(enabled: boolean) {
    setAutoplay(false);
    setReplay((previous) => toggleLive(previous, enabled));
  }

  function handleResetGame() {
    setAutoplay(false);
    setSelectedCardId(null);
    setTargetSelection(null);
    setReplacementChoiceOption(null);
    setReplay(createInitialController(seed.trim() || "rules-sandbox"));
  }

  function handleSubmitTargets() {
    if (!targetSelection || !replay.isLive) {
      return;
    }

    applyLiveAction(targetSelection.descriptor.action, targetSelection.selectedIds);
    setTargetSelection(null);
  }

  function handleReplacementChoice() {
    if (!replacementChoice || !replacementChoiceOption || !replay.isLive) {
      return;
    }

    const optionId = replacementChoiceOption as "APPLY_REPLACEMENT" | "KEEP_EVENT";
    const next = engineClient.chooseReplacement(replay.liveState, replacementChoice.id, optionId);
    commitLiveState(next);
  }

  return (
    <main className="page">
      <div className="hero">
        <h1>Rules Sandbox</h1>
        <p>
          Interactive engine state viewer with stack, priority, choices, and deterministic rewind/replay timeline.
        </p>
        <p>
          <Link href="/" className="inline-link">
            Back to analyzer
          </Link>
        </p>
      </div>

      <section className="sandbox-toolbar panel">
        <div className="sandbox-toolbar-row">
          <label htmlFor="sandbox-seed">Seed</label>
          <input
            id="sandbox-seed"
            type="text"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="rules-sandbox"
          />
          <button type="button" onClick={handleResetGame}>
            New Game
          </button>
        </div>
        <p className="muted">Current RNG seed: {replay.initialState.rng.seed}</p>
      </section>

      <section className="sandbox-grid">
        <div className="sandbox-state-column">
          <TurnPhasePanel state={state} />
          <PlayersPanel state={state} />
          <CommanderZonePanel state={state} />
          <BattlefieldPanel
            state={state}
            selectedCardId={selectedCardId}
            onSelectCard={setSelectedCardId}
            activationActions={activationActions}
            onActivateAction={handleAction}
            actionsDisabled={!replay.isLive}
          />
          <StackPanel state={state} />
          <GameLogPanel events={replay.events} selectedIndex={currentIndex} onSelectIndex={handleTimelineIndex} />
        </div>

        <div className="sandbox-control-column">
          <TimelineControls
            currentIndex={currentIndex}
            totalEvents={totalEvents}
            turnNumber={state.turnNumber}
            step={state.step}
            isLive={replay.isLive}
            autoplay={autoplay}
            onChangeIndex={handleTimelineIndex}
            onStart={() => handleTimelineIndex(0)}
            onPrev={() => handleTimelineIndex(Math.max(0, currentIndex - 1))}
            onNext={() => handleTimelineIndex(Math.min(totalEvents, currentIndex + 1))}
            onEnd={() => handleTimelineIndex(totalEvents)}
            onToggleAutoplay={() => setAutoplay((previous) => !previous)}
            onToggleLive={handleToggleLive}
          />

          <ActionPanel
            actions={visibleActions}
            replayMode={!replay.isLive}
            onAction={handleAction}
            onNextStep={handleNextStep}
            onNextTurn={handleNextTurn}
            onAutoResolveStack={handleAutoResolveStack}
            onReturnToLive={() => {
              setAutoplay(false);
              setReplay((previous) => goLive(previous));
            }}
          />

          <section className="sandbox-panel">
            <h2>Debug</h2>
            <p className="muted">Mode: {replay.isLive ? "LIVE" : "REPLAY"}</p>
            <p className="muted">
              Displayed index: {currentIndex} / {totalEvents}
            </p>
            <details>
              <summary>Raw state JSON</summary>
              <pre className="sandbox-json">{JSON.stringify(state, null, 2)}</pre>
            </details>
          </section>
        </div>
      </section>

      <ChoiceModal
        open={Boolean(targetSelection) && replay.isLive}
        title="Choose Targets"
        prompt={
          targetSelection
            ? `Pick ${targetSelection.descriptor.requiredTargetCount} target(s) for ${targetSelection.descriptor.label}.`
            : ""
        }
        options={targetSelection?.descriptor.targetOptions ?? []}
        selectedIds={targetSelection?.selectedIds ?? []}
        requiredCount={targetSelection?.descriptor.requiredTargetCount ?? 1}
        multiSelect={(targetSelection?.descriptor.requiredTargetCount ?? 1) > 1}
        submitLabel="Submit Targets"
        onToggleOption={(targetId) => {
          if (!targetSelection) {
            return;
          }

          setTargetSelection((previous) => {
            if (!previous) {
              return previous;
            }

            return {
              ...previous,
              selectedIds: toggleTarget(
                previous.descriptor.targetOptions,
                previous.selectedIds,
                targetId,
                previous.descriptor.requiredTargetCount
              )
            };
          });
        }}
        onSubmit={handleSubmitTargets}
        onCancel={() => setTargetSelection(null)}
      />

      <ChoiceModal
        open={Boolean(replacementChoice) && replay.isLive}
        title="Replacement Choice"
        prompt={replacementChoice?.prompt ?? "Choose replacement option."}
        options={(replacementChoice?.options ?? []).map((option) => ({
          id: option.id,
          label: option.label
        }))}
        selectedIds={replacementChoiceOption ? [replacementChoiceOption] : []}
        requiredCount={1}
        submitLabel="Resolve Choice"
        onToggleOption={(id) => setReplacementChoiceOption(id)}
        onSubmit={handleReplacementChoice}
      />
    </main>
  );
}
