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
        "rounded-[var(--radius-card)] border-2 px-6 py-4 flex items-center gap-3 justify-center font-bold text-lg md:text-2xl",
        isCorrect ? "border-success text-success bg-success/10" : "border-danger text-danger bg-danger/10"
      )}
    >
      <span aria-hidden className="text-2xl md:text-3xl">
        {isCorrect ? "✅" : "❌"}
      </span>
      <span>{label}</span>
    </div>
  );
}
