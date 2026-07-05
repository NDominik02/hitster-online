"use client";

import { useState } from "react";
import { AppButton } from "../system/AppButton";
import { ColorPicker } from "../lobby/ColorPicker";
import { PlayerBadge } from "../lobby/PlayerBadge";
import type { PlayerColorId } from "@/lib/game/types";

export interface RosterEntry {
  name: string;
  color: PlayerColorId;
}

export interface RosterBuilderProps {
  players: RosterEntry[];
  onAdd: (entry: RosterEntry) => void;
  onRemove: (index: number) => void;
  onConfirm: () => void;
  confirming?: boolean;
  minPlayers?: number;
  maxPlayers?: number;
}

/**
 * PP-Setup — egyetlen eszközön a névsor összeállítása Pass-and-play módhoz
 * (nincs külön host-gép, valakinek fel kell vinnie mindenki nevét/színét
 * egymás után, ugyanazon a képernyőn — a hozzáadás sorrendje = kör-sorrend).
 */
export function RosterBuilder({
  players,
  onAdd,
  onRemove,
  onConfirm,
  confirming,
  minPlayers = 2,
  maxPlayers = 6,
}: RosterBuilderProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColorId | null>(null);

  const takenColors = players.map((p) => p.color);
  const takenByName = Object.fromEntries(players.map((p) => [p.color, p.name])) as Partial<
    Record<PlayerColorId, string>
  >;
  const atLimit = players.length >= maxPlayers;

  function handleAdd() {
    if (!name.trim() || !color || atLimit) return;
    onAdd({ name: name.trim(), color });
    setName("");
    setColor(null);
  }

  return (
    <div className="flex flex-col gap-6 max-w-sm mx-auto w-full">
      <div>
        <h2 className="text-xl font-bold">Kik játszanak?</h2>
        <p className="text-text-muted text-sm mt-1">
          {minPlayers}–{maxPlayers} fő — a hozzáadás sorrendje lesz a kör-sorrend is.
        </p>
      </div>

      {players.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Hozzáadva ({players.length})</h3>
          <ul className="space-y-2">
            {players.map((p, i) => (
              <li key={i} className="flex items-center justify-between bg-surface-2 rounded-[var(--radius-card)] px-3 py-2">
                <PlayerBadge name={p.name} color={p.color} size="sm" />
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="text-text-muted hover:text-danger px-2"
                  aria-label={`${p.name} eltávolítása`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!atLimit && (
        <div className="space-y-4">
          <div>
            <label className="block mb-1 font-medium text-sm" htmlFor="roster-name">
              Új játékos neve
            </label>
            <input
              id="roster-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 12))}
              placeholder="Dani"
              className="w-full min-h-11 rounded-[var(--radius-button)] bg-surface-2 border-2 border-border focus-visible:border-accent px-4 py-3 text-base"
            />
          </div>
          <div>
            <label className="block mb-2 font-medium text-sm">Színe</label>
            <ColorPicker taken={takenColors} selected={color} onSelect={setColor} takenByName={takenByName} />
          </div>
          <AppButton variant="secondary" fullWidth disabled={!name.trim() || !color} onClick={handleAdd}>
            + Hozzáadás
          </AppButton>
        </div>
      )}

      {atLimit && (
        <p className="text-warning text-sm text-center">Elérted a {maxPlayers} fős limitet ebben a módban.</p>
      )}

      <AppButton
        size="lg"
        fullWidth
        disabled={players.length < minPlayers || confirming}
        onClick={onConfirm}
      >
        {confirming ? "Indítás…" : "KEZDŐDJÖN! ▶"}
      </AppButton>
      {players.length < minPlayers && (
        <p className="text-text-muted text-sm text-center">Legalább {minPlayers} fő kell.</p>
      )}
    </div>
  );
}
