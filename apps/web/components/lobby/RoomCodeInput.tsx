"use client";

import { useRef } from "react";
import clsx from "clsx";

export interface RoomCodeInputProps {
  value: string; // 0-4 karakter
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** 4 karakteres kód-bevitel — QR-ból érkezve előre kitöltött lehet (AC4.2, DESIGN P1). */
export function RoomCodeInput({ value, onChange, disabled }: RoomCodeInputProps) {
  const chars = value.padEnd(4, " ").slice(0, 4).split("");
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function setCharAt(index: number, char: string) {
    const next = chars.slice();
    next[index] = char || " ";
    const joined = next.join("").replace(/ +$/, "");
    onChange(joined.toUpperCase());
    // requestAnimationFrame véd az iOS Safari fókusz-race ellen: ha a .focus()-t
    // szinkron hívjuk az input eseményen belül, mobil Safarin (autoCapitalize +
    // prediktív sáv miatt) néha nem veszi fel a fókuszt a következő mezőn.
    if (char && index < 3) {
      requestAnimationFrame(() => refs.current[index + 1]?.focus());
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !chars[index].trim() && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Szobakód">
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={chars[i].trim()}
          onChange={(e) => setCharAt(i, e.target.value.slice(-1).toUpperCase())}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          maxLength={1}
          inputMode="text"
          autoCapitalize="characters"
          aria-label={`Kód ${i + 1}. karaktere`}
          style={{ fontFamily: "var(--font-heading)", background: "var(--surface-2)", borderColor: "var(--border-2)" }}
          className={clsx(
            "w-14 h-16 text-center text-2xl font-bold rounded-[var(--radius-button)]",
            "border-2 text-text focus-visible:border-accent",
            "disabled:opacity-50"
          )}
        />
      ))}
    </div>
  );
}
