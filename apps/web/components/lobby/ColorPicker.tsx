"use client";

import clsx from "clsx";
import { PLAYER_COLORS, type PlayerColorId } from "@/lib/game/types";
import { playerColorTextClass, playerColorLabel } from "@/lib/game/colors";

export interface ColorPickerProps {
  taken: PlayerColorId[];
  selected: PlayerColorId | null;
  onSelect: (color: PlayerColorId) => void;
  takenByName?: Partial<Record<PlayerColorId, string>>;
}

/** 8 szín rácsos választó, foglaltak tiltva (AC5.3, DESIGN P1 wireframe). */
export function ColorPicker({ taken, selected, onSelect, takenByName }: ColorPickerProps) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label="Szín választása">
        {PLAYER_COLORS.map((c) => {
          const isTaken = taken.includes(c.id);
          const isSelected = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${c.label}${isTaken ? " — foglalt" : ""}`}
              disabled={isTaken}
              onClick={() => onSelect(c.id)}
              className={clsx(
                "relative min-h-11 min-w-11 aspect-square rounded-full flex items-center justify-center font-bold transition-all duration-150",
                playerColorTextClass(c.id),
                isTaken && "opacity-30 cursor-not-allowed line-through",
                isSelected && "ring-4 ring-white ring-offset-2 ring-offset-bg"
              )}
              style={{ backgroundColor: c.value }}
            >
              {isSelected && <span aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="text-sm text-text-muted mt-2">Kiválasztva: {playerColorLabel(selected)}</p>
      )}
      {taken.length > 0 && takenByName && (
        <ul className="text-xs text-text-muted mt-2 space-y-0.5">
          {taken.map((colorId) =>
            takenByName[colorId] ? (
              <li key={colorId}>
                › {playerColorLabel(colorId)} foglalt ({takenByName[colorId]})
              </li>
            ) : null
          )}
        </ul>
      )}
    </div>
  );
}
