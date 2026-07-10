"use client";

import clsx from "clsx";
import { PLAYER_COLORS, type PlayerColorId } from "@/lib/game/types";
import { playerColorTextClass, playerColorLabel } from "@/lib/game/colors";

export interface ColorPickerProps {
  taken: PlayerColorId[];
  selected: PlayerColorId | null;
  onSelect: (color: PlayerColorId) => void;
  takenByNames?: Partial<Record<PlayerColorId, string[]>>;
}

/** 8 szín rácsos választó, a már használt színek láthatók, de újra választhatók. */
export function ColorPicker({ taken, selected, onSelect, takenByNames }: ColorPickerProps) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label="Szín választása">
        {PLAYER_COLORS.map((c) => {
          const usageCount = taken.filter((colorId) => colorId === c.id).length;
          const names = takenByNames?.[c.id] ?? [];
          const isTaken = usageCount > 0;
          const isSelected = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${c.label}${isTaken ? ` — már ${usageCount} játékos használja${names.length ? `: ${names.join(", ")}` : ""}` : ""}`}
              onClick={() => onSelect(c.id)}
              className={clsx(
                "relative min-h-11 min-w-11 aspect-square rounded-full flex items-center justify-center font-bold transition-all duration-150",
                playerColorTextClass(c.id),
                isTaken && !isSelected && "ring-2 ring-white/40 ring-offset-2 ring-offset-bg",
                isSelected && "ring-4 ring-white ring-offset-2 ring-offset-bg"
              )}
              style={{ backgroundColor: c.value }}
            >
              {isSelected && <span aria-hidden>✓</span>}
              {isTaken && (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-white/70 bg-bg text-[10px] font-bold leading-none text-white shadow-sm"
                >
                  {usageCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="text-sm text-text-muted mt-2">Kiválasztva: {playerColorLabel(selected)}</p>
      )}
      {taken.length > 0 && takenByNames && (
        <ul className="text-xs text-text-muted mt-2 space-y-0.5">
          {PLAYER_COLORS.map(({ id: colorId }) =>
            takenByNames[colorId]?.length ? (
              <li key={colorId}>
                › {playerColorLabel(colorId)} már használatban ({takenByNames[colorId]?.join(", ")})
              </li>
            ) : null
          )}
        </ul>
      )}
    </div>
  );
}
