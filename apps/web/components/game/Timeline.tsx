"use client";

import type { TimelineCardPublic } from "@/lib/game/types";
import { TimelineCard } from "./TimelineCard";
import { TimelineSlot } from "./TimelineSlot";

export interface TimelineProps {
  cards: TimelineCardPublic[];
  slots?: boolean;
  activeSlotIndex?: number | null;
  scrollable?: boolean;
  onTapSelectSlot?: (index: number) => void;
  ownerColor?: string;
  /**
   * F2 (lopás) — a soron lévő játékos ide tette le a kártyát (`round.placement`), ezen az
   * idővonalon élőben megjelölve. A lopó nem választhatja ki ezt a rést.
   */
  markedSlotIndex?: number | null;
  markedColor?: string;
}

/** Vízszintes, görgethető idővonal-konténer, rések kezelése (DESIGN P3 wireframe, 5.1). */
export function Timeline({
  cards,
  slots = false,
  activeSlotIndex = null,
  scrollable = true,
  onTapSelectSlot,
  ownerColor,
  markedSlotIndex = null,
  markedColor,
}: TimelineProps) {
  const sorted = [...cards].sort((a, b) => a.position - b.position);

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-1 px-2 py-2 ${scrollable ? "overflow-x-auto scrollbar-thin" : "flex-wrap"}`}
      >
        {slots && (
          <TimelineSlot
            index={0}
            active={activeSlotIndex === 0}
            selected={activeSlotIndex === 0}
            color={ownerColor}
            onTapSelect={onTapSelectSlot}
            markedByActivePlayer={markedSlotIndex === 0}
            markedColor={markedColor}
            disabled={markedSlotIndex === 0}
          />
        )}
        {sorted.map((card, i) => (
          <div key={card.id} className="flex items-center gap-1">
            <TimelineCard
              year={card.year}
              title={card.title}
              artist={card.artist}
              artworkUrl={card.artworkUrl}
              state="revealed"
              size="md"
            />
            {slots && (
              <TimelineSlot
                index={i + 1}
                active={activeSlotIndex === i + 1}
                selected={activeSlotIndex === i + 1}
                color={ownerColor}
                onTapSelect={onTapSelectSlot}
                markedByActivePlayer={markedSlotIndex === i + 1}
                markedColor={markedColor}
                disabled={markedSlotIndex === i + 1}
              />
            )}
          </div>
        ))}
        {sorted.length === 0 && !slots && (
          <span className="text-text-muted text-sm px-2">Még nincs kártya az idővonalon.</span>
        )}
      </div>
      {scrollable && sorted.length > 3 && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-bg to-transparent" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-bg to-transparent" />
        </>
      )}
    </div>
  );
}
