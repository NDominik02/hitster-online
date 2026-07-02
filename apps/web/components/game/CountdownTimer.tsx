"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

export interface CountdownTimerProps {
  /** Relatív hátralévő idő másodpercben — a deadline Date.now() + seconds lesz (render-mentesen, effect-ben). */
  seconds?: number;
  /** Abszolút ISO deadline (pl. a szerver placingDeadline mezője) — ha meg van adva, ez élvez elsőbbséget. */
  deadlineIso?: string | null;
  warningAt?: number; // alap 10 mp
  paused?: boolean;
  onExpire?: () => void;
  size?: "md" | "lg";
}

/**
 * Vizuális visszaszámláló (P3 + F2 steal) — DESIGN P3 wireframe, D6.
 * Deadline-alapú, nem drift-elő setInterval-lánc — ha a `seconds`/`deadlineIso` prop változik,
 * a komponenst a hívó `key`-jével kell remountolni (pl. `key={roundId}`).
 */
export function CountdownTimer({
  seconds = 90,
  deadlineIso,
  warningAt = 10,
  paused,
  onExpire,
  size = "md",
}: CountdownTimerProps) {
  const deadlineRef = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (deadlineRef.current === null) {
      deadlineRef.current = deadlineIso ? new Date(deadlineIso).getTime() : Date.now() + seconds * 1000;
    }
    if (paused) return;

    const tick = () => {
      const deadline = deadlineRef.current ?? Date.now();
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, onExpire]);

  const urgent = remaining <= warningAt;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <div
      role="timer"
      aria-live="polite"
      className={clsx(
        "font-numeric font-bold rounded-[var(--radius-pill)] px-4 py-1 inline-flex items-center gap-1 transition-colors",
        size === "lg" ? "text-3xl md:text-4xl" : "text-2xl",
        urgent ? "text-danger animate-pulse motion-reduce:animate-none" : "text-text"
      )}
    >
      <span aria-hidden>⏱</span>
      <span>
        {mm}:{String(ss).padStart(2, "0")}
      </span>
    </div>
  );
}
