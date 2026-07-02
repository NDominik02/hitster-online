import type { Player } from "@/lib/game/types";
import { PlayerBadge } from "./PlayerBadge";

export interface PlayerListProps {
  players: Player[];
  layout?: "grid" | "row";
  activePlayerId?: string;
}

/** Csatlakozott játékosok listája (host lobby H3, player várakozó P2). */
export function PlayerList({ players, layout = "row", activePlayerId }: PlayerListProps) {
  return (
    <ul
      className={
        layout === "grid"
          ? "grid grid-cols-2 md:grid-cols-4 gap-4"
          : "flex flex-wrap gap-4"
      }
    >
      {players.map((p) => (
        <li key={p.id}>
          <PlayerBadge
            name={p.name}
            color={p.color}
            state={!p.connected ? "offline" : p.id === activePlayerId ? "active" : "online"}
            size="md"
          />
        </li>
      ))}
    </ul>
  );
}
