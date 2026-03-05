"use client";

import type { TurnStep } from "@/engine";

type TimelineControlsProps = {
  currentIndex: number;
  totalEvents: number;
  turnNumber: number;
  step: TurnStep;
  isLive: boolean;
  autoplay: boolean;
  onChangeIndex: (index: number) => void;
  onStart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
  onToggleAutoplay: () => void;
  onToggleLive: (enabled: boolean) => void;
};

export function TimelineControls({
  currentIndex,
  totalEvents,
  turnNumber,
  step,
  isLive,
  autoplay,
  onChangeIndex,
  onStart,
  onPrev,
  onNext,
  onEnd,
  onToggleAutoplay,
  onToggleLive
}: TimelineControlsProps) {
  const atStart = currentIndex <= 0;
  const atEnd = currentIndex >= totalEvents;

  return (
    <section className="sandbox-panel timeline-panel">
      <div className="timeline-head">
        <h2>Timeline</h2>
        <label className="timeline-live-toggle" htmlFor="timeline-live-toggle">
          <input
            id="timeline-live-toggle"
            type="checkbox"
            checked={isLive}
            onChange={(event) => onToggleLive(event.target.checked)}
          />
          Live Mode
        </label>
      </div>

      <div className="timeline-metrics">
        <span>
          Index <strong>{currentIndex}</strong>
        </span>
        <span>
          Events <strong>{totalEvents}</strong>
        </span>
        <span>
          Turn <strong>{turnNumber}</strong> / <strong>{step}</strong>
        </span>
      </div>

      <input
        className="timeline-slider"
        type="range"
        min={0}
        max={Math.max(totalEvents, 0)}
        value={currentIndex}
        onChange={(event) => onChangeIndex(Number(event.target.value))}
      />

      <div className="timeline-buttons">
        <button type="button" onClick={onStart} disabled={atStart}>
          ? Start
        </button>
        <button type="button" onClick={onPrev} disabled={atStart}>
          ? Prev Event
        </button>
        <button type="button" onClick={onNext} disabled={atEnd}>
          ? Next Event
        </button>
        <button type="button" onClick={onEnd} disabled={atEnd}>
          ? End
        </button>
      </div>

      <button
        type="button"
        className="timeline-autoplay"
        onClick={onToggleAutoplay}
        disabled={isLive || atEnd}
      >
        {autoplay ? "? Stop Autoplay" : "? Autoplay"}
      </button>
    </section>
  );
}
