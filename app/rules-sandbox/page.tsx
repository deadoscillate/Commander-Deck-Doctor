"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  type SandboxPlayerSetup,
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
import { SANDBOX_DEMO_DECKS } from "@/lib/sandboxDecklists";
import { loadRulesSandboxPreset } from "@/lib/sandboxPreset";

type PendingTargetSelection = {
  descriptor: ActionDescriptor;
  selectedIds: string[];
};

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

function createDemoPlayer(slot: number): SandboxPlayerSetup {
  const useFirstDemo = slot % 2 !== 0;
  return {
    name: `Player ${slot}`,
    decklist: useFirstDemo ? SANDBOX_DEMO_DECKS.playerOne : SANDBOX_DEMO_DECKS.playerTwo,
    commanderName: useFirstDemo ? "Captain Verity" : "Ravager of Embers"
  };
}

function defaultSetupPlayers(): SandboxPlayerSetup[] {
  return [createDemoPlayer(1), createDemoPlayer(2), createDemoPlayer(3)];
}

function sanitizeSetupPlayers(players: SandboxPlayerSetup[]): SandboxPlayerSetup[] {
  const base = players.slice(0, MAX_PLAYERS);

  while (base.length < MIN_PLAYERS) {
    base.push(createDemoPlayer(base.length + 1));
  }

  return base.map((player, index) => ({
    name: player.name.trim() || `Player ${index + 1}`,
    decklist: player.decklist,
    commanderName: player.commanderName?.trim() ? player.commanderName.trim() : null
  }));
}

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
  const [setupPlayers, setSetupPlayers] = useState<SandboxPlayerSetup[]>(() => defaultSetupPlayers());
  const [setupWarnings, setSetupWarnings] = useState<string[]>([]);
  const [setupError, setSetupError] = useState("");
  const [unknownCardsByPlayer, setUnknownCardsByPlayer] = useState<Record<string, string[]>>({});
  const [presetLoaded, setPresetLoaded] = useState(false);

  const [replay, setReplay] = useState<ReplayControllerState>(() => createInitialController(seed));
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targetSelection, setTargetSelection] = useState<PendingTargetSelection | null>(null);
  const [replacementChoiceOption, setReplacementChoiceOption] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(false);

  const applySetup = useCallback((nextPlayers: SandboxPlayerSetup[], nextSeed: string) => {
    const normalizedPlayers = sanitizeSetupPlayers(nextPlayers);
    const normalizedSeed = nextSeed.trim() || "rules-sandbox";

    try {
      const result = engineClient.createSandboxGameFromDecklists({
        players: normalizedPlayers,
        seed: normalizedSeed
      });

      setSeed(normalizedSeed);
      setSetupPlayers(normalizedPlayers);
      setSetupWarnings(result.warnings);
      setUnknownCardsByPlayer(result.unknownCardsByPlayer);
      setSetupError("");

      setAutoplay(false);
      setSelectedCardId(null);
      setTargetSelection(null);
      setReplacementChoiceOption(null);
      setReplay(createReplayController(result.state));
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : "Could not start sandbox game from setup.");
    }
  }, []);

  useEffect(() => {
    const preset = loadRulesSandboxPreset();
    if (!preset || !Array.isArray(preset.players) || preset.players.length === 0) {
      applySetup(defaultSetupPlayers(), "rules-sandbox");
      return;
    }

    const playersFromPreset = sanitizeSetupPlayers(preset.players);
    const presetSeed = preset.seed?.trim() || "rules-sandbox";
    setPresetLoaded(true);
    applySetup(playersFromPreset, presetSeed);
  }, [applySetup]);

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

  const unknownCardsSummary = useMemo(() => {
    const playerNameById = new Map(replay.liveState.players.map((player) => [player.id, player.name]));

    return Object.entries(unknownCardsByPlayer)
      .filter(([, cards]) => cards.length > 0)
      .map(([playerId, cards]) => {
        const label = playerNameById.get(playerId) ?? playerId;
        const visible = cards.slice(0, 8).join(", ");
        const more = cards.length > 8 ? ` (+${cards.length - 8} more)` : "";
        return `${label}: ${visible}${more}`;
      });
  }, [replay.liveState.players, unknownCardsByPlayer]);

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

  function updateSetupPlayer(index: number, patch: Partial<SandboxPlayerSetup>) {
    setSetupPlayers((previous) =>
      previous.map((player, playerIndex) => {
        if (playerIndex !== index) {
          return player;
        }

        return {
          ...player,
          ...patch
        };
      })
    );
  }

  function handleAddPlayer() {
    setSetupPlayers((previous) => {
      if (previous.length >= MAX_PLAYERS) {
        return previous;
      }

      return [...previous, createDemoPlayer(previous.length + 1)];
    });
  }

  function handleRemovePlayer(index: number) {
    setSetupPlayers((previous) => {
      if (previous.length <= MIN_PLAYERS) {
        return previous;
      }

      return previous.filter((_, playerIndex) => playerIndex !== index);
    });
  }

  return (
    <main className="page">
      <div className="hero">
        <h1>Rules Sandbox</h1>
        <p>
          Interactive engine state viewer for stack, priority, and replacement choices. Configure each player deck,
          then start or restart the game from setup.
        </p>
        <p>
          <Link href="/" className="inline-link">
            Back to analyzer
          </Link>
        </p>
      </div>

      <section className="panel sandbox-setup-panel">
        <div className="sandbox-setup-head">
          <h2>Game Setup</h2>
          <div className="sandbox-inline-actions">
            <button type="button" className="btn-tertiary" onClick={handleAddPlayer} disabled={setupPlayers.length >= MAX_PLAYERS}>
              Add Player
            </button>
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => {
                const demos = defaultSetupPlayers();
                setSetupPlayers(demos);
                applySetup(demos, seed);
              }}
            >
              Load Demo Setup
            </button>
            <button type="button" className="btn-primary" onClick={() => applySetup(setupPlayers, seed)}>
              Start / Restart Game
            </button>
          </div>
        </div>

        <div className="sandbox-setup-seed-row">
          <label htmlFor="sandbox-seed">Seed</label>
          <input
            id="sandbox-seed"
            type="text"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="rules-sandbox"
          />
          <span className="muted">Current RNG seed: {replay.initialState.rng.seed}</span>
        </div>

        {presetLoaded ? (
          <p className="muted">Loaded your most recent analyzed deck into Player 1. Edit any player before restarting.</p>
        ) : null}

        <div className="sandbox-howto">
          <h3>How to use</h3>
          <ol>
            <li>Set player decklists and commanders, then click &quot;Start / Restart Game&quot;.</li>
            <li>In your main phase: play lands, activate mana abilities, then cast spells.</li>
            <li>Use &quot;Pass Priority&quot; to move priority and resolve the stack.</li>
            <li>Use Timeline controls to rewind/replay; return to Live mode to continue playing.</li>
          </ol>
          <p className="muted">
            Engine note: unsupported card-specific behavior is currently limited; unknown card names are omitted from
            setup and listed below.
          </p>
        </div>

        <div className="sandbox-setup-player-grid">
          {setupPlayers.map((player, index) => (
            <article key={`setup-player-${index}`} className="sandbox-setup-player-card">
              <div className="sandbox-setup-player-head">
                <h3>{`Player ${index + 1}`}</h3>
                <button
                  type="button"
                  className="btn-tertiary"
                  onClick={() => handleRemovePlayer(index)}
                  disabled={setupPlayers.length <= MIN_PLAYERS}
                >
                  Remove
                </button>
              </div>

              <div className="row">
                <label htmlFor={`setup-player-name-${index}`}>Name</label>
                <input
                  id={`setup-player-name-${index}`}
                  type="text"
                  value={player.name}
                  onChange={(event) => updateSetupPlayer(index, { name: event.target.value })}
                  placeholder={`Player ${index + 1}`}
                />
              </div>

              <div className="row">
                <label htmlFor={`setup-player-commander-${index}`}>Commander (optional)</label>
                <input
                  id={`setup-player-commander-${index}`}
                  type="text"
                  value={player.commanderName ?? ""}
                  onChange={(event) => updateSetupPlayer(index, { commanderName: event.target.value })}
                  placeholder="Commander name"
                />
              </div>

              <div className="row">
                <label htmlFor={`setup-player-decklist-${index}`}>Decklist</label>
                <textarea
                  id={`setup-player-decklist-${index}`}
                  value={player.decklist}
                  onChange={(event) => updateSetupPlayer(index, { decklist: event.target.value })}
                  rows={10}
                  placeholder="1 Sol Ring"
                />
              </div>
            </article>
          ))}
        </div>

        {setupError ? <p className="error">{setupError}</p> : null}

        {setupWarnings.length > 0 ? (
          <div className="sandbox-setup-feedback">
            <strong>Setup warnings</strong>
            <ul>
              {setupWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {unknownCardsSummary.length > 0 ? (
          <div className="sandbox-setup-feedback">
            <strong>Unknown card names omitted</strong>
            <ul>
              {unknownCardsSummary.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </div>
        ) : null}
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
