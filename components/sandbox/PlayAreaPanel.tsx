/* eslint-disable @next/next/no-img-element */

"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameState } from "@/lib/engineClient";
import { getCardPreview } from "@/lib/scryfallPreview";

type PlayAreaPanelProps = {
  state: GameState;
  selectedCardId: string | null;
  onSelectCard: (cardId: string | null) => void;
};

type ZoneView = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command";

const ZONE_ORDER: ZoneView[] = ["battlefield", "command", "graveyard", "exile", "hand", "library"];
const SEAT_COUNT = 4;

type SeatZoneState = Record<string, ZoneView>;

type CardImageTileProps = {
  cardName: string;
  selected: boolean;
  tapped: boolean;
  counters: Record<string, number>;
  onClick: () => void;
};

function zoneLabel(zone: ZoneView): string {
  if (zone === "battlefield") return "Battlefield";
  if (zone === "command") return "Command";
  if (zone === "graveyard") return "Graveyard";
  if (zone === "exile") return "Exile";
  if (zone === "hand") return "Hand";
  return "Library";
}

function nextSeatZone(current: SeatZoneState, playerId: string): ZoneView {
  return current[playerId] ?? "battlefield";
}

function countersLabel(counters: Record<string, number>): string | null {
  const rows = Object.entries(counters).filter(([, amount]) => amount > 0);
  if (rows.length === 0) {
    return null;
  }

  return rows.map(([name, amount]) => `${name} ${amount}`).join(", ");
}

function CardImageTile({ cardName, selected, tapped, counters, onClick }: CardImageTileProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    void getCardPreview(cardName)
      .then((preview) => {
        if (!mounted) {
          return;
        }

        setImageUrl(preview?.imageUrl ?? null);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [cardName]);

  const countersText = countersLabel(counters);

  return (
    <button
      type="button"
      className={`sandbox-card-image-tile${selected ? " sandbox-card-image-tile-selected" : ""}`}
      onClick={onClick}
      title={cardName}
    >
      {imageUrl ? <img src={imageUrl} alt={cardName} loading="lazy" /> : <span className="sandbox-card-image-fallback">{cardName}</span>}
      <span className="sandbox-card-image-meta">
        <strong>{cardName}</strong>
        {loading ? <em className="muted">Loading image...</em> : null}
        {tapped ? <em>Tapped</em> : null}
        {countersText ? <em>{countersText}</em> : null}
      </span>
    </button>
  );
}

export function PlayAreaPanel({ state, selectedCardId, onSelectCard }: PlayAreaPanelProps) {
  const [seatZone, setSeatZone] = useState<SeatZoneState>({});

  const seats = useMemo(() => {
    const rows: Array<GameState["players"][number] | null> = [...state.players];
    while (rows.length < SEAT_COUNT) {
      rows.push(null);
    }

    return rows.slice(0, SEAT_COUNT);
  }, [state.players]);

  return (
    <section className="sandbox-panel sandbox-playarea-panel">
      <div className="sandbox-playarea-head">
        <h2>Play Area (4-Player Table)</h2>
        <p className="muted">Select a zone per player to inspect cards. Card art is loaded from Scryfall previews.</p>
      </div>

      <div className="sandbox-playarea-grid">
        {seats.map((player, seatIndex) => {
          if (!player) {
            return (
              <article key={`empty-seat-${seatIndex + 1}`} className="sandbox-seat-card sandbox-seat-card-empty">
                <h3>{`Seat ${seatIndex + 1}`}</h3>
                <p className="muted">Empty seat</p>
              </article>
            );
          }

          const active = state.players[state.activePlayerIndex]?.id === player.id;
          const priority = state.priorityHolderPlayerId === player.id;
          const zone = nextSeatZone(seatZone, player.id);

          const zoneCardIds = zone === "library" ? [] : player.zones[zone].cardIds;
          const visibleCardIds = zoneCardIds.slice().reverse();

          return (
            <article key={player.id} className="sandbox-seat-card">
              <div className="sandbox-seat-head">
                <h3>{player.name}</h3>
                <div className="sandbox-seat-tags">
                  <span className="status-chip">Life {player.life}</span>
                  {active ? <span className="status-chip">Active</span> : null}
                  {priority ? <span className="status-chip">Priority</span> : null}
                </div>
              </div>

              <div className="sandbox-seat-zones">
                {ZONE_ORDER.map((zoneName) => {
                  const count = player.zones[zoneName].cardIds.length;
                  const selected = zoneName === zone;
                  return (
                    <button
                      key={`${player.id}-${zoneName}`}
                      type="button"
                      className={`sandbox-zone-chip${selected ? " sandbox-zone-chip-selected" : ""}`}
                      onClick={() => {
                        setSeatZone((previous) => ({
                          ...previous,
                          [player.id]: zoneName
                        }));
                      }}
                    >
                      {zoneLabel(zoneName)} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="sandbox-seat-zone-view">
                <p className="muted">Viewing: {zoneLabel(zone)}</p>
                {zone === "library" ? (
                  <p className="muted">Library contains {player.zones.library.cardIds.length} card(s).</p>
                ) : visibleCardIds.length === 0 ? (
                  <p className="muted">No cards in this zone.</p>
                ) : (
                  <div className="sandbox-card-image-grid">
                    {visibleCardIds.map((cardId) => {
                      const card = state.cardInstances[cardId];
                      if (!card) {
                        return null;
                      }

                      return (
                        <CardImageTile
                          key={card.id}
                          cardName={card.definition.name}
                          selected={selectedCardId === card.id}
                          tapped={card.tapped}
                          counters={card.counters}
                          onClick={() => onSelectCard(selectedCardId === card.id ? null : card.id)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
