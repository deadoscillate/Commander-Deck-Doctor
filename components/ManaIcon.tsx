"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

type ManaIconProps = {
  symbol: string;
  size?: number;
  className?: string;
};

export function ManaIcon({ symbol, size = 18, className }: ManaIconProps) {
  const [failed, setFailed] = useState(false);
  const normalized = symbol.trim();
  const src = useMemo(
    () => `https://svgs.scryfall.io/card-symbols/${encodeURIComponent(normalized)}.svg`,
    [normalized]
  );

  if (!normalized || failed) {
    return (
      <span
        className={`mana-fallback${className ? ` ${className}` : ""}`}
        style={{ width: size, height: size, minWidth: size }}
        aria-label={`Mana symbol ${normalized || "unknown"}`}
      >
        {normalized || "?"}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={`Mana symbol ${normalized}`}
      className={`mana-icon${className ? ` ${className}` : ""}`}
      loading="lazy"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
    />
  );
}
