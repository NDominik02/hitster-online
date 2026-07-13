"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import type { NameGuessInput } from "@/lib/game/types";

export interface GuessInputProps {
  /** Az extra-zsetonos betippelés mezőit a szülő tartja (P3 — a LERAKOM-mal együtt megy fel). */
  value: NameGuessInput | null;
  onChange: (value: NameGuessInput | null) => void;
  disabled?: boolean;
}

/**
 * Extra-zsetonos betippelés: előadó/cím/évszám beviteli mezők — DESIGN 5.4 ⟨F2⟩,
 * ARCHITECTURE 11.3.3 (S21).
 *
 * A mezők OPCIONÁLISAK: ha mind üres, a `value` null, és a `place_card` hívás nem küld
 * érdemi `nameGuess`-t (AC21.2). Nincs külön "bemondás elküldése" hívás, a szülő
 * (TippingScreen → play page) a LERAKOM gombnál olvassa ki és küldi együtt.
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
  const headingId = useId();
  const contentId = useId();
  const artistId = useId();
  const titleId = useId();
  const yearId = useId();
  const [expanded, setExpanded] = useState(true);

  const filledCount = [value?.titleGuess, value?.artistGuess, value?.yearGuess].filter((part) => part?.trim()).length;
  const hasGuess = filledCount > 0;

  function updateField(field: keyof NameGuessInput, nextValue: string) {
    const next: NameGuessInput = {
      titleGuess: value?.titleGuess ?? "",
      artistGuess: value?.artistGuess ?? "",
      yearGuess: value?.yearGuess ?? "",
      [field]: nextValue,
    };
    const hasAnyValue = Boolean(next.titleGuess.trim() || next.artistGuess.trim() || next.yearGuess?.trim());
    onChange(hasAnyValue ? next : null);
  }

  function clearGuess() {
    if (!disabled) onChange(null);
  }

  return (
    <section
      aria-labelledby={headingId}
      className={clsx(
        "w-full rounded-[var(--radius-card)] border-2 px-4 py-4 shadow-lg transition-colors",
        hasGuess ? "border-accent bg-accent/10" : "border-border-2 bg-surface"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow mb-1">extra zseton</div>
          <h2 id={headingId} className="text-xl font-black leading-tight text-text">
            Tudod mi szól?
          </h2>
          <p className="mt-1 text-sm text-text-muted">Cím, előadó vagy évszám: minden találat +1 🪙.</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "rounded-[var(--radius-pill)] border px-3 py-1 text-sm font-bold",
              hasGuess ? "border-accent text-accent" : "border-border text-text-muted"
            )}
          >
            {filledCount}/3
          </span>
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-pill)] border border-border px-3 py-1 text-sm font-bold text-text-muted hover:text-text"
          >
            <span className="sr-only">{expanded ? "Betippelés összecsukása" : "Betippelés kinyitása"}</span>
            <span aria-hidden>{expanded ? "▾" : "▸"}</span>
          </button>
          {hasGuess && (
            <button
              type="button"
              onClick={clearGuess}
              disabled={disabled}
              className="rounded-[var(--radius-pill)] border border-border px-3 py-1 text-sm font-semibold text-text-muted hover:text-text disabled:opacity-50"
            >
              Törlés
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div id={contentId}>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_120px]">
            <GuessField
              id={titleId}
              label="Cím"
              value={value?.titleGuess ?? ""}
              placeholder="pl. Delilah"
              disabled={disabled}
              onChange={(next) => updateField("titleGuess", next)}
            />
            <GuessField
              id={artistId}
              label="Előadó"
              value={value?.artistGuess ?? ""}
              placeholder="pl. Tom Jones"
              disabled={disabled}
              onChange={(next) => updateField("artistGuess", next)}
            />
            <GuessField
              id={yearId}
              label="Év"
              type="number"
              inputMode="numeric"
              value={value?.yearGuess ?? ""}
              placeholder="1965"
              disabled={disabled}
              onChange={(next) => updateField("yearGuess", next)}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-text-muted">
            <span>{hasGuess ? "Betippelés aktív" : "Üresen hagyható"}</span>
            <span className="text-right">A lerakással együtt megy be</span>
          </div>
        </div>
      )}
    </section>
  );
}

interface GuessFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  type?: "text" | "number";
  inputMode?: "text" | "numeric";
  onChange: (value: string) => void;
}

function GuessField({
  id,
  label,
  value,
  placeholder,
  disabled,
  type = "text",
  inputMode,
  onChange,
}: GuessFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold uppercase text-text-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={clsx(
          "min-h-12 w-full rounded-[var(--radius-button)] border-2 border-border bg-bg px-3 py-2 text-base font-semibold",
          "placeholder:text-text-faint focus-visible:border-accent disabled:opacity-60"
        )}
      />
    </div>
  );
}
