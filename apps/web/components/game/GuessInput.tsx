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
 * „Bemondom!" kapcsoló + előadó/cím/évszám beviteli mezők — DESIGN 5.4 ⟨F2⟩, ARCHITECTURE 11.3.3
 * (S21).
 *
 * A kapcsoló OPCIONÁLIS: ha ki van kapcsolva, a `value` null, és a `place_card` hívás nem küld
 * `nameGuess`-t (AC21.2). A mezők a lerakásig itt gyűlnek — nincs külön "bemondás elküldése"
 * hívás, a szülő (TippingScreen → play page) a LERAKOM gombnál olvassa ki és küldi együtt.
 *
 * REDESIGN (2026-07-06, playtest feedback): a három mező EGYMÁSTÓL FÜGGETLENÜL pontozott — mindegyik
 * kitöltött (nem üres) mező külön +1 zsetont ér, ha helyes (max 3/kör). Az évszám opcionális, és
 * pontos egyezés kell hozzá (nincs "közel jó"). Egy üresen hagyott mező egyszerűen nem pontoz —
 * nincs itt semmilyen "mindkettő kell" validáció.
 *
 * Anti-leak (ARCHITECTURE 11.9/1): a beírt sztring NYERSEN megy a szerverre, a fuzzy-matching
 * kizárólag szerveroldalon fut — ez a komponens nem tud és nem is próbál semmit kiértékelni.
 */
export function GuessInput({ value, onChange, disabled }: GuessInputProps) {
  const [enabled, setEnabled] = useState(value !== null);
  const artistId = useId();
  const titleId = useId();
  const yearId = useId();

  function toggle() {
    if (disabled) return;
    const next = !enabled;
    setEnabled(next);
    onChange(next ? { artistGuess: "", titleGuess: "", yearGuess: "" } : null);
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
        <span className="font-bold">🎤 Bemondom! (max +3 🪙)</span>
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
              onChange={(e) =>
                onChange({
                  artistGuess: e.target.value,
                  titleGuess: value?.titleGuess ?? "",
                  yearGuess: value?.yearGuess ?? "",
                })
              }
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
              onChange={(e) =>
                onChange({
                  artistGuess: value?.artistGuess ?? "",
                  titleGuess: e.target.value,
                  yearGuess: value?.yearGuess ?? "",
                })
              }
              disabled={disabled}
              placeholder="pl. Delilah"
              className={clsx(
                "w-full min-h-11 rounded-[var(--radius-button)] bg-surface border-2 border-border",
                "focus-visible:border-accent px-3 py-2 text-base"
              )}
            />
          </div>
          <div>
            <label htmlFor={yearId} className="block text-xs text-text-muted mb-1">
              Évszám (opcionális)
            </label>
            <input
              id={yearId}
              type="number"
              inputMode="numeric"
              value={value?.yearGuess ?? ""}
              onChange={(e) =>
                onChange({
                  artistGuess: value?.artistGuess ?? "",
                  titleGuess: value?.titleGuess ?? "",
                  yearGuess: e.target.value,
                })
              }
              disabled={disabled}
              placeholder="pl. 1965"
              className={clsx(
                "w-full min-h-11 rounded-[var(--radius-button)] bg-surface border-2 border-border",
                "focus-visible:border-accent px-3 py-2 text-base"
              )}
            />
          </div>
          <p className="text-xs text-text-muted">
            Mindegyik mező külön pontoz — amit kitöltesz és eltalálsz, +1 🪙 érte. Csak reveal után derül ki.
          </p>
        </div>
      )}
    </div>
  );
}
