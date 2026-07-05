"use client";

import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";

export interface TimelineSlotProps {
  index: number;
  active: boolean;
  /** Ha van kijelölt rés (tap-to-place vagy drag-elengedés utáni), ez jelzi. */
  selected?: boolean;
  color?: string;
  onTapSelect?: (index: number) => void;
  /**
   * F2 (lopás) — a tulaj kérésére: a soron lévő játékos ide tette le a kártyát, ez élőben
   * látszik a lopóknak (a `round.placement` mindig kikerül a round_public view-ban). A lopó
   * NEM választhatja ugyanezt a rést (nincs értelme "ellopni" oda, ahova már letette) — ezért
   * ilyenkor a slot nem kattintható, de vizuálisan jól megkülönböztethetően jelölt.
   */
  markedByActivePlayer?: boolean;
  markedColor?: string;
  disabled?: boolean;
}

/**
 * Egy drop-slot két kártya között (P3) — DESIGN 4.1c „Rések és snap".
 * dnd-kit droppable ÉS koppintható (tap-to-place fallback, D11 kötelező F1-ben).
 */
export function TimelineSlot({
  index,
  active,
  selected,
  color = "var(--accent)",
  onTapSelect,
  markedByActivePlayer,
  markedColor = "var(--warning)",
  disabled,
}: TimelineSlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${index}`, data: { index }, disabled });
  const highlight = active || isOver || selected || markedByActivePlayer;
  const displayColor = markedByActivePlayer ? markedColor : color;

  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onTapSelect?.(index)}
      aria-label={
        markedByActivePlayer
          ? `${index + 1}. hely — ide tette a soron lévő játékos, nem választható`
          : `${index + 1}. hely a kártyák között`
      }
      aria-pressed={selected}
      className={clsx(
        "shrink-0 h-28 rounded-[var(--radius-button)] transition-all duration-150 ease-out flex flex-col items-center justify-center gap-0.5",
        "min-w-[44px]",
        highlight ? "w-12 border-2" : "w-4 border border-dashed border-border/60",
        disabled && "cursor-not-allowed opacity-90"
      )}
      style={
        highlight
          ? {
              borderColor: displayColor,
              backgroundColor: `color-mix(in srgb, ${displayColor} 18%, transparent)`,
              boxShadow: `0 0 26px -6px ${displayColor}`,
            }
          : undefined
      }
    >
      {markedByActivePlayer ? (
        <>
          <span aria-hidden className="text-lg" style={{ color: displayColor }}>
            📍
          </span>
          <span className="text-[9px] leading-none text-center px-0.5" style={{ color: displayColor }}>
            ide tette
          </span>
        </>
      ) : (
        highlight && (
          <span aria-hidden className="text-lg" style={{ color: displayColor }}>
            ⇕
          </span>
        )
      )}
    </button>
  );
}
