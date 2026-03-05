/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from "react";
import { ManaCost } from "@/components/ManaCost";
import type { CardPreviewData } from "@/lib/previewCache";

type CardPreviewPopoverProps = {
  open: boolean;
  state: "idle" | "loading" | "ready" | "error";
  preview: CardPreviewData | null;
  cardName: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  className?: string;
  style?: CSSProperties;
};

function formatUsd(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return `$${parsed.toFixed(2)}`;
  }

  return `$${value}`;
}

function formatPriceLine(preview: CardPreviewData | null): string | null {
  if (!preview?.prices) {
    return null;
  }

  const usd = formatUsd(preview.prices.usd);
  const foil = formatUsd(preview.prices.usdFoil);
  const etched = formatUsd(preview.prices.usdEtched);
  const tix = preview.prices.tix;
  const chunks: string[] = [];

  if (usd) chunks.push(`USD ${usd}`);
  if (foil) chunks.push(`Foil ${foil}`);
  if (etched) chunks.push(`Etched ${etched}`);
  if (tix) chunks.push(`TIX ${tix}`);

  return chunks.length > 0 ? chunks.join(" | ") : null;
}

export function CardPreviewPopover({
  open,
  state,
  preview,
  cardName,
  onMouseEnter,
  onMouseLeave,
  className,
  style
}: CardPreviewPopoverProps) {
  if (!open) {
    return null;
  }

  const priceLine = formatPriceLine(preview);
  const resolvedName = preview?.name ?? cardName;

  return (
    <span
      className={`card-hover-preview${className ? ` ${className}` : ""}`}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {state === "loading" ? <span className="card-hover-loading">Loading preview...</span> : null}

      {state !== "loading" && preview?.imageUrl ? (
        <img src={preview.imageUrl} alt={`${resolvedName} preview`} loading="lazy" />
      ) : null}

      {state !== "loading" ? (
        <span className="card-hover-meta">
          <strong>{resolvedName}</strong>
          {preview?.manaCost ? <ManaCost manaCost={preview.manaCost} size={14} /> : null}
          {preview?.typeLine ? <span className="card-hover-type">{preview.typeLine}</span> : null}
          {priceLine ? <span className="card-hover-prices">{priceLine}</span> : null}
          {state === "error" ? <span className="card-hover-prices">Preview unavailable.</span> : null}
        </span>
      ) : null}
    </span>
  );
}
