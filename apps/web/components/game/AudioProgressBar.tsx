export interface AudioProgressBarProps {
  current: number; // sec
  duration: number; // sec
  playing: boolean;
}

// Redesign — az EQ-hullámsáv fix, de véletlenszerűnek tűnő magasság/időzítés
// mintázata (a design "waveBars" mintáját fixre cserélve, hogy ne kelljen
// kliens-oldali random state — SSR/hydration-biztos).
const BAR_COUNT = 32;
const BAR_PATTERN = Array.from({ length: BAR_COUNT }, (_, i) => ({
  h: 25 + ((i * 37) % 70),
  dur: 0.6 + ((i * 13) % 50) / 100,
  delay: ((i * 91) % 100) / 100,
}));

/** Host lejátszás-progress (H4) — nagy, jól látható, 3 m-ről olvasható (DESIGN H4 wireframe). */
export function AudioProgressBar({ current, duration, playing }: AudioProgressBarProps) {
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const format = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="w-full max-w-xl mx-auto" aria-live="off">
      <div className="flex items-end gap-[3px] h-14 mb-3" aria-hidden>
        {BAR_PATTERN.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${b.h}%`,
              background: i / BAR_COUNT < pct / 100 ? "var(--accent)" : "var(--border-2)",
              transformOrigin: "bottom",
              animation: playing ? `eq-bar ${b.dur}s ease-in-out ${b.delay}s infinite` : undefined,
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-xl">
          {playing ? "▶" : "⏸"}
        </span>
        <div className="flex-1 h-[5px] rounded-[var(--radius-pill)] bg-surface-2 overflow-hidden">
          <div className="h-full bg-accent transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-code text-sm text-text-muted shrink-0">
          {format(current)} / {format(duration)}
        </span>
      </div>
    </div>
  );
}
