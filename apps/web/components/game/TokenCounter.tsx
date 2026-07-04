import clsx from "clsx";

export interface TokenCounterProps {
  tokens: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "text-xs px-1.5 py-0.5 gap-0.5",
  md: "text-sm px-2 py-1 gap-1",
  lg: "text-lg px-3 py-1.5 gap-1.5",
};

/**
 * Token-számláló (`🪙 × n`) — DESIGN 5.4 ⟨F2⟩, a `PlayerBadge`/`PlayerTimelineRow` mellett
 * jelenik meg (AC20.2: mindenki token-száma látható mindkét oldalon). A szín soha nem az
 * egyetlen jelölő — a szám + emoji együtt olvasható accessibility-barát módon is (DESIGN 6.2/7).
 */
export function TokenCounter({ tokens, size = "md", className }: TokenCounterProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center font-numeric font-bold rounded-[var(--radius-pill)] bg-surface-2 border border-border text-text",
        sizeClasses[size],
        className
      )}
      title={`${tokens} token`}
      aria-label={`${tokens} token`}
    >
      <span aria-hidden>🪙</span>
      <span>{tokens}</span>
    </span>
  );
}
