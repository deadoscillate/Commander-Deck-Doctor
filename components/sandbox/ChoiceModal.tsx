"use client";

import type { ReactNode } from "react";

export type ChoiceModalOption = {
  id: string;
  label: string;
  description?: string;
};

type ChoiceModalProps = {
  open: boolean;
  title: string;
  prompt: string;
  options: ChoiceModalOption[];
  selectedIds: string[];
  requiredCount: number;
  multiSelect?: boolean;
  submitLabel?: string;
  onToggleOption: (id: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  footer?: ReactNode;
};

export function ChoiceModal({
  open,
  title,
  prompt,
  options,
  selectedIds,
  requiredCount,
  multiSelect = false,
  submitLabel = "Confirm",
  onToggleOption,
  onSubmit,
  onCancel,
  footer
}: ChoiceModalProps) {
  if (!open) {
    return null;
  }

  const ready = selectedIds.length >= requiredCount;

  return (
    <div className="sandbox-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sandbox-modal">
        <h3>{title}</h3>
        <p>{prompt}</p>

        <div className="sandbox-choice-list">
          {options.map((option) => {
            const selected = selectedIds.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                className={`sandbox-choice-option${selected ? " sandbox-choice-option-selected" : ""}`}
                onClick={() => onToggleOption(option.id)}
              >
                <span>{option.label}</span>
                {option.description ? <span className="muted">{option.description}</span> : null}
                <span className="status-chip">{selected ? "Selected" : multiSelect ? "Select" : "Choose"}</span>
              </button>
            );
          })}
        </div>

        <div className="sandbox-modal-actions">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="sandbox-btn-muted">
              Cancel
            </button>
          ) : null}
          <button type="button" onClick={onSubmit} disabled={!ready}>
            {submitLabel}
          </button>
        </div>
        {footer}
      </div>
    </div>
  );
}
