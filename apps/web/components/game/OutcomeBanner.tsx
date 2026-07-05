import clsx from "clsx";

export interface OutcomeBannerProps {
  outcome: "correct" | "wrong" | "timeout";
  playerName?: string;
  color?: string;
}

/** Helyes/hibás visszajelzés — ikon + szín + szöveg, sosem csak szín (DESIGN H5/P5, 7. accessibility). */
export function OutcomeBanner({ outcome, playerName }: OutcomeBannerProps) {
  const isCorrect = outcome === "correct";
  const label = isCorrect
    ? `${playerName ? `${playerName} ` : ""}jól rakta le!`
    : outcome === "timeout"
      ? "Lejárt az idő — a kártya elszáll"
      : "Nem talált — a kártya elszáll";

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        "rounded-full px-6 py-3 flex items-center gap-3 justify-center font-bold text-base md:text-lg",
        isCorrect ? "bg-success" : "border-2 bg-danger/15 border-danger text-danger"
      )}
      style={isCorrect ? { color: "var(--bg)" } : undefined}
    >
      <span aria-hidden className="text-xl md:text-2xl">
        {isCorrect ? "✅" : "❌"}
      </span>
      <span className="font-code" style={{ letterSpacing: "0.06em" }}>
        {label.toUpperCase()}
      </span>
    </div>
  );
}
