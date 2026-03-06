"use client";

import { useEffect, useState } from "react";
import { CardNameHover } from "@/components/CardNameHover";
import { getCardPreview } from "@/lib/scryfallPreview";

type ComboCardTileProps = {
  name: string;
  imageUrl?: string | null;
  missing?: boolean;
};

/**
 * Small combo-card tile used in Advanced > Combo Detection.
 * Uses deck-resolved image when available, then falls back to Scryfall preview lookup.
 */
export function ComboCardTile({ name, imageUrl = null, missing = false }: ComboCardTileProps) {
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(imageUrl);

  useEffect(() => {
    let canceled = false;
    setResolvedImageUrl(imageUrl);

    if (imageUrl) {
      return () => {
        canceled = true;
      };
    }

    void getCardPreview(name).then((preview) => {
      if (canceled) {
        return;
      }

      setResolvedImageUrl(preview?.imageUrl ?? null);
    });

    return () => {
      canceled = true;
    };
  }, [name, imageUrl]);

  return (
    <div className={`combo-card-tile${missing ? " combo-card-tile-missing" : ""}`}>
      {resolvedImageUrl ? (
        <div className="combo-card-image" style={{ backgroundImage: `url("${resolvedImageUrl}")` }} />
      ) : (
        <div className="combo-card-image-fallback">
          <span>{name}</span>
        </div>
      )}
      <div className="combo-card-name">
        <CardNameHover name={name} />
      </div>
      {missing ? <div className="combo-card-missing">Missing</div> : null}
    </div>
  );
}

