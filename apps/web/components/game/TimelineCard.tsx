import clsx from "clsx";
import type { PlayerColorId } from "@/lib/game/types";
import { playerColorValue } from "@/lib/game/colors";

export type TimelineCardState = "revealed" | "placed" | "ghost" | "unknown";

export interface TimelineCardProps {
  year: number;
  title?: string;
  artist?: string;
  state?: TimelineCardState;
  size?: "sm" | "md" | "lg";
  color?: PlayerColorId;
}

const sizeClasses = {
  sm: "w-16 h-20 text-lg",
  md: "w-24 h-28 text-2xl",
  lg: "w-32 h-40 text-3xl",
};

/**
 * Egy idővonal-kártya (év + állapot) — player idővonal, host mini-idővonal, reveal, győzelem.
 * DESIGN 5.1 komponenslista.
 */
export function TimelineCard({ year, title, artist, state = "placed", size = "md", color }: TimelineCardProps) {
  const isGhost = state === "ghost";

  return (
    <div
      className={clsx(
        "rounded-[var(--radius-card)] flex flex-col items-center justify-center font-numeric font-bold shrink-0 border-2 transition-all duration-150",
        sizeClasses[size],
        isGhost ? "opacity-50 border-dashed" : "border-solid",
        state === "unknown" ? "bg-surface-2" : "bg-surface"
      )}
      style={{ borderColor: color ? playerColorValue(color) : "var(--border)" }}
    >
      <span className={clsx(isGhost && "animate-pulse")}>{isGhost ? "?" : year}</span>
      {title && size !== "sm" && (
        <span className="text-[10px] font-normal text-text-muted mt-1 px-1 text-center line-clamp-1">
          {artist ? `${artist} — ${title}` : title}
        </span>
      )}
    </div>
  );
}
