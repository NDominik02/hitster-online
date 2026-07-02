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
}

/**
 * Egy drop-slot két kártya között (P3) — DESIGN 4.1c „Rések és snap".
 * dnd-kit droppable ÉS koppintható (tap-to-place fallback, D11 kötelező F1-ben).
 */
export function TimelineSlot({ index, active, selected, color = "var(--accent)", onTapSelect }: TimelineSlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${index}`, data: { index } });
  const highlight = active || isOver || selected;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onTapSelect?.(index)}
      aria-label={`${index + 1}. hely a kártyák között`}
      aria-pressed={selected}
      className={clsx(
        "shrink-0 h-28 rounded-[var(--radius-button)] transition-all duration-150 ease-out flex items-center justify-center",
        "min-w-[44px]",
        highlight ? "w-12 border-2" : "w-4 border border-dashed border-border/60"
      )}
      style={
        highlight
          ? { borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }
          : undefined
      }
    >
      {highlight && (
        <span aria-hidden className="text-lg" style={{ color }}>
          ⇕
        </span>
      )}
    </button>
  );
}
