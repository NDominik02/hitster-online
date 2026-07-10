"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useServerClock } from "@/lib/time/server-clock";

export interface CountdownTimerProps {
  /** Relatív hátralévő idő másodpercben — a deadline Date.now() + seconds lesz (render-mentesen, effect-ben). */
  seconds?: number;
  /** Abszolút ISO deadline (pl. a szerver placingDeadline mezője) — ha meg van adva, ez élvez elsőbbséget. */
  deadlineIso?: string | null;
  warningAt?: number; // alap 10 mp
  paused?: boolean;
  onExpire?: () => void;
  size?: "md" | "lg";
  /** Redesign — a Claude Design terv szerinti körgyűrűs jelvény (pl. player Tippelés fejléc). */
  ring?: boolean;
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
  ring = false,
}: CountdownTimerProps) {
  const { offsetMs, synced } = useServerClock();
  const clockOffsetForDeadline = deadlineIso ? offsetMs : 0;
  const deadlineRef = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(seconds);
  const [total, setTotal] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    // BUGFIX (2026-07-06): korábban a deadline csak az ELSŐ renderen íródott be
    // (`if (deadlineRef.current === null)`), utána soha többé nem frissült — még
    // akkor sem, ha a `deadlineIso` prop később megváltozott. Mivel a valós
    // `steal_deadline`/`placing_deadline` néha egy pillanattal KÉSŐBB érkezik meg
    // a klienshez, mint a fázisváltás broadcastja (race a round refetch és a DB-írás
    // között), a komponens ilyenkor egy null deadline-ra a `seconds` fallbackkel
    // (pl. 90 mp) állt be, és ez soha nem korrigálódott a később megérkező valódi
    // (pl. 15 mp-es steal-ablakos) deadline-ra — ez okozta, hogy játékosonként
    // teljesen eltérő, "random" hátralévő időt láttunk ugyanabban a körben.
    // Most a deadline MINDEN alkalommal újraszámolódik, amikor a `deadlineIso`
    // prop ténylegesen megváltozik (a hatás-függőséglistában szerepel).
    const now = Date.now() + clockOffsetForDeadline;
    deadlineRef.current = deadlineIso ? new Date(deadlineIso).getTime() : now + seconds * 1000;
    expiredRef.current = false;
    setTotal(deadlineIso ? Math.max(1, Math.round((deadlineRef.current - now) / 1000)) : seconds);

    if (paused) return;

    const tick = () => {
      const deadline = deadlineRef.current ?? Date.now() + clockOffsetForDeadline;
      const next = Math.max(0, Math.ceil((deadline - (Date.now() + clockOffsetForDeadline)) / 1000));
      setRemaining(next);
      if (next <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadlineIso, clockOffsetForDeadline, paused, onExpire, seconds]);

  const waitingForServerClock = Boolean(deadlineIso) && !synced;
  const urgent = !waitingForServerClock && remaining <= warningAt;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const label = waitingForServerClock ? "--:--" : `${mm}:${String(ss).padStart(2, "0")}`;
  const color = urgent ? "var(--danger)" : "var(--accent)";

  if (ring) {
    const pct = Math.max(0, Math.min(1, remaining / total));
    const dim = size === "lg" ? 76 : 56;
    return (
      <div
        role="timer"
        aria-live="polite"
        className={clsx("rounded-full flex items-center justify-center shrink-0", urgent && "animate-pulse motion-reduce:animate-none")}
        style={{
          width: dim,
          height: dim,
          background: `conic-gradient(${color} ${pct * 360}deg, var(--border) 0deg)`,
        }}
      >
        <div
          className="rounded-full flex items-center justify-center font-code font-bold"
          style={{
            width: dim - 8,
            height: dim - 8,
            background: "var(--bg)",
            color,
            fontSize: size === "lg" ? 18 : 14,
          }}
        >
          {label}
        </div>
      </div>
    );
  }

  return (
    <div
      role="timer"
      aria-live="polite"
      className={clsx(
        "font-code font-bold rounded-[var(--radius-pill)] px-4 py-1 inline-flex items-center gap-1 transition-colors",
        size === "lg" ? "text-3xl md:text-4xl" : "text-2xl",
        urgent ? "text-danger animate-pulse motion-reduce:animate-none" : "text-text"
      )}
    >
      <span aria-hidden>⏱</span>
      <span>{label}</span>
    </div>
  );
}
