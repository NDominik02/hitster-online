export interface AudioProgressBarProps {
  current: number; // sec
  duration: number; // sec
  playing: boolean;
}

/** Host lejátszás-progress (H4) — nagy, jól látható, 3 m-ről olvasható (DESIGN H4 wireframe). */
export function AudioProgressBar({ current, duration, playing }: AudioProgressBarProps) {
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const format = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="w-full max-w-xl mx-auto" aria-live="off">
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-2xl">
          {playing ? "▶" : "⏸"}
        </span>
        <div className="flex-1 h-3 rounded-[var(--radius-pill)] bg-surface-2 overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-numeric text-lg text-text-muted shrink-0">
          {format(current)} / {format(duration)}
        </span>
      </div>
    </div>
  );
}
