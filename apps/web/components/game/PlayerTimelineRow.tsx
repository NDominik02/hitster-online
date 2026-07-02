import clsx from "clsx";
import type { Player, TimelineCardPublic } from "@/lib/game/types";
import { playerColorValue } from "@/lib/game/colors";
import { TimelineCard } from "./TimelineCard";
import { PlayerBadge } from "../lobby/PlayerBadge";

export interface PlayerTimelineRowProps {
  player: Player;
  cards: TimelineCardPublic[];
  isActive: boolean;
  /** Élő tükrözés — a soron lévő játékos húzása közben melyik rés aktív (ARCHITECTURE 4.2, D8). */
  ghostSlotIndex?: number | null;
  /** F2-kész prop, F1-ben nem renderel semmit vele (DESIGN ⟨F2⟩). */
  tokens?: number;
}

/** Host H4 egy játékos-sora (név + mini-idővonal) — DESIGN H4 wireframe. */
export function PlayerTimelineRow({ player, cards, isActive, ghostSlotIndex }: PlayerTimelineRowProps) {
  const sorted = [...cards].sort((a, b) => a.position - b.position);
  const items: Array<{ type: "card"; card: TimelineCardPublic } | { type: "ghost" }> = [];

  sorted.forEach((card, i) => {
    if (ghostSlotIndex === i) items.push({ type: "ghost" });
    items.push({ type: "card", card });
  });
  if (ghostSlotIndex === sorted.length) items.push({ type: "ghost" });

  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-[var(--radius-card)] px-3 py-2 transition-colors",
        isActive && "bg-surface-2 ring-2"
      )}
      style={isActive ? { boxShadow: `0 0 0 2px ${playerColorValue(player.color)}` } : undefined}
    >
      <div className="w-32 shrink-0">
        <PlayerBadge name={player.name} color={player.color} state={!player.connected ? "offline" : isActive ? "active" : "online"} size="sm" />
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-thin">
        {items.map((item, i) =>
          item.type === "ghost" ? (
            <TimelineCard key={`ghost-${i}`} year={0} state="ghost" size="sm" color={player.color} />
          ) : (
            <TimelineCard
              key={item.card.id}
              year={item.card.year}
              state="revealed"
              size="sm"
            />
          )
        )}
      </div>
    </div>
  );
}
