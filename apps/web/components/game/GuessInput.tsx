"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import type { NameGuessInput } from "@/lib/game/types";

export interface GuessInputProps {
  /** A "Bemondom!" kapcsoló + mezők állapotát a szülő tartja (P3 — a LERAKOM-mal együtt megy fel). */
  value: NameGuessInput | null;
  onChange: (value: NameGuessInput | null) => void;
  disabled?: boolean;
}

/**
 * „Bemondom!" kapcsoló + előadó/cím beviteli mezők — DESIGN 5.4 ⟨F2⟩, ARCHITECTURE 11.3.3 (S21).
 *
 * A kapcsoló OPCIONÁLIS: ha ki van kapcsolva, a `value` null, és a `place_card` hívás nem küld
 * `nameGuess`-t (AC21.2). A mezők a lerakásig itt gyűlnek — nincs külön "bemondás elküldése"
 * hívás, a szülő (TippingScreen → play page) a LERAKOM gombnál olvassa ki és küldi együtt
 * (F2-D1: mindkettő kell, cím ÉS előadó, részjutalom nincs — ezért itt sincs külön validáció,
 * az üresen hagyott mező egyszerűen nem fog találni a szerveroldali kiértékelésnél).
 *
 * Anti-leak (ARCHITECTURE 11.9/1): a beírt sztring NYERSEN megy a szerverre, a fuzzy-matching
 * kizárólag szerveroldalon fut — ez a komponens nem tud és nem is próbál semmit kiértékelni.
 */
export function GuessInput({ value, onChange, disabled }: GuessInputProps) {
  const [enabled, setEnabled] = useState(value !== null);
  const artistId = useId();
  const titleId = useId();

  function toggle() {
    if (disabled) return;
    const next = !enabled;
    setEnabled(next);
    onChange(next ? { artistGuess: "", titleGuess: "" } : null);
  }

  return (
    <div className="w-full rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3">
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={toggle}
          disabled={disabled}
          className="w-5 h-5 accent-[var(--accent)]"
        />
        <span className="font-bold">🎤 Bemondom! (+1 🪙)</span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2">
          <div>
            <label htmlFor={artistId} className="block text-xs text-text-muted mb-1">
              Előadó
            </label>
            <input
              id={artistId}
              type="text"
              value={value?.artistGuess ?? ""}
              onChange={(e) => onChange({ artistGuess: e.target.value, titleGuess: value?.titleGuess ?? "" })}
              disabled={disabled}
              placeholder="pl. Tom Jones"
              className={clsx(
                "w-full min-h-11 rounded-[var(--radius-button)] bg-surface border-2 border-border",
                "focus-visible:border-accent px-3 py-2 text-base"
              )}
            />
          </div>
          <div>
            <label htmlFor={titleId} className="block text-xs text-text-muted mb-1">
              Cím
            </label>
            <input
              id={titleId}
              type="text"
              value={value?.titleGuess ?? ""}
              onChange={(e) => onChange({ artistGuess: value?.artistGuess ?? "", titleGuess: e.target.value })}
              disabled={disabled}
              placeholder="pl. Delilah"
              className={clsx(
                "w-full min-h-11 rounded-[var(--radius-button)] bg-surface border-2 border-border",
                "focus-visible:border-accent px-3 py-2 text-base"
              )}
            />
          </div>
          <p className="text-xs text-text-muted">Mindkét mező kell a jutalomhoz. Csak reveal után derül ki.</p>
        </div>
      )}
    </div>
  );
}
