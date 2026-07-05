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
  sm: "w-16",
  md: "w-24",
  lg: "w-32",
};

const yearSize = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

/**
 * Egy idővonal-kártya (év + állapot) — player idővonal, host mini-idővonal, reveal, győzelem.
 * DESIGN 5.1 komponenslista. Redesign (Claude Design pass): "lemezboríték" motívum — négyzet
 * art-terület egy kis kilyukasztott középponttal, alatta az évszám és az előadó.
 */
export function TimelineCard({ year, title, artist, state = "placed", size = "md", color }: TimelineCardProps) {
  const isGhost = state === "ghost";

  return (
    <div
      className={clsx(
        "rounded-[var(--radius-button)] shrink-0 border transition-all duration-150 p-2 text-center",
        sizeClasses[size],
        isGhost ? "opacity-50 border-dashed" : "border-solid"
      )}
      style={{
        background: state === "unknown" ? "var(--surface-2)" : "linear-gradient(160deg, #201e2a, #1a1922)",
        borderColor: color ? playerColorValue(color) : "var(--border-3)",
      }}
    >
      <div
        className="w-full aspect-square rounded-md flex items-center justify-center mb-1.5"
        style={{ background: "var(--surface-2)" }}
      >
        {!isGhost && (
          <span
            className="block rounded-full"
            style={{
              width: "28%",
              height: "28%",
              background: "var(--bg)",
              border: "3px solid rgba(255,255,255,0.35)",
            }}
          />
        )}
      </div>
      <span
        className={clsx("font-numeric font-bold block leading-none", yearSize[size], isGhost && "animate-pulse")}
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {isGhost ? "?" : year}
      </span>
      {title && size !== "sm" && (
        <span className="text-[10px] font-normal text-text-muted mt-1 block px-1 truncate">
          {artist ? `${artist} — ${title}` : title}
        </span>
      )}
    </div>
  );
}
