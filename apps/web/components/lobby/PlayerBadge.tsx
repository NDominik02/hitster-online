import clsx from "clsx";
import type { PlayerColorId } from "@/lib/game/types";
import { playerColorTextClass, playerColorValue, playerMonogram } from "@/lib/game/colors";
import { TokenCounter } from "../game/TokenCounter";

export interface PlayerBadgeProps {
  name: string;
  color: PlayerColorId;
  state?: "online" | "offline" | "active";
  size?: "sm" | "md" | "lg";
  /** F2 (DESIGN 5.2 ⟨F2⟩, AC20.2) — ha meg van adva, a TokenCounter megjelenik a név mellett. */
  tokens?: number;
}

const sizeClasses = {
  sm: { chip: "w-8 h-8 text-sm", name: "text-sm" },
  md: { chip: "w-10 h-10 text-base", name: "text-base" },
  lg: { chip: "w-14 h-14 text-xl", name: "text-lg" },
};

/**
 * Játékos-jelvény: szín + monogram + név — soha csak szín (accessibility, DESIGN 6.2/7).
 */
export function PlayerBadge({ name, color, state = "online", size = "md", tokens }: PlayerBadgeProps) {
  const s = sizeClasses[size];
  const offline = state === "offline";

  return (
    <div
      className={clsx("inline-flex items-center gap-2", offline && "opacity-45")}
      aria-label={`${name}${offline ? " — offline" : ""}${tokens !== undefined ? `, ${tokens} token` : ""}`}
    >
      <div
        className={clsx(
          "rounded-full flex items-center justify-center font-bold shrink-0 border-2",
          s.chip,
          playerColorTextClass(color),
          state === "active" ? "border-white" : "border-transparent"
        )}
        style={{ backgroundColor: playerColorValue(color) }}
      >
        {playerMonogram(name)}
      </div>
      <span className={clsx("font-medium truncate", s.name)}>{name}</span>
      {tokens !== undefined && <TokenCounter tokens={tokens} size={size === "lg" ? "md" : "sm"} />}
      {offline && (
        <span className="text-warning text-xs font-semibold" title="Offline">
          ⚠ offline
        </span>
      )}
    </div>
  );
}
