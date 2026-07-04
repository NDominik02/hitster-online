"use client";

import { PlayerBadge } from "../lobby/PlayerBadge";
import type { Player, PlayerGameStats } from "../../lib/game/types";

export interface GameStatsProps {
  players: Player[];
  stats: PlayerGameStats[];
}

/** S41 (F4) — parti végi statisztika-táblázat, játékosonkénti bontásban. */
export function GameStats({ players, stats }: GameStatsProps) {
  const byPlayerId = new Map(stats.map((s) => [s.playerId, s]));

  return (
    <div className="w-full max-w-md text-left">
      <h2 className="text-text-muted text-sm uppercase tracking-wide mb-3">Statisztikák</h2>
      <ul className="space-y-2">
        {players.map((p) => {
          const s = byPlayerId.get(p.id);
          return (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3"
            >
              <PlayerBadge name={p.name} color={p.color} size="sm" />
              <span className="text-sm text-text-muted whitespace-nowrap">
                ✅ {s?.correctPlacements ?? 0} · ❌ {s?.wrongPlacements ?? 0} · ⏱ {s?.timeouts ?? 0} · 🕵️{" "}
                {s?.successfulSteals ?? 0} · 🎤 {s?.correctGuesses ?? 0}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
