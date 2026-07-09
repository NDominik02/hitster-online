export interface AudioProgressBarProps {
  current: number; // sec
  duration: number; // sec
  playing: boolean;
  onTogglePlayback?: () => void;
  toggleDisabled?: boolean;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
}

const BAR_COUNT = 32;
const BAR_PATTERN = Array.from({ length: BAR_COUNT }, (_, i) => ({
  h: 25 + ((i * 37) % 70),
  dur: 0.6 + ((i * 13) % 50) / 100,
  delay: ((i * 91) % 100) / 100,
}));

export function AudioProgressBar({
  current,
  duration,
  playing,
  onTogglePlayback,
  toggleDisabled = false,
  volume = 1,
  onVolumeChange,
}: AudioProgressBarProps) {
  const safeDuration = Math.max(0, duration);
  const safeCurrent = Math.max(0, Math.min(current, safeDuration));
  const pct = safeDuration > 0 ? Math.min(100, (safeCurrent / safeDuration) * 100) : 0;
  const format = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const toggleLabel = playing ? "Zene megallitasa" : "Zene folytatasa";

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
        <button
          type="button"
          onClick={onTogglePlayback}
          disabled={!onTogglePlayback || toggleDisabled}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-accent bg-surface-2 text-xl text-accent transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:border-border disabled:text-text-muted disabled:opacity-60"
        >
          <span aria-hidden>{playing ? "⏸" : "▶"}</span>
        </button>
        <div className="flex-1 h-[5px] rounded-[var(--radius-pill)] bg-surface-2 overflow-hidden">
          <div className="h-full bg-accent transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-code text-sm text-text-muted shrink-0">
          {format(safeCurrent)} / {format(safeDuration)}
        </span>
      </div>
      {onVolumeChange && (
        <div className="mt-3 flex items-center gap-3">
          <span aria-hidden className="w-10 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Vol
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(Math.max(0, Math.min(1, volume)) * 100)}
            onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
            aria-label="Hangerő"
            title="Hangerő"
            className="h-2 flex-1 accent-[var(--accent)]"
          />
        </div>
      )}
    </div>
  );
}
