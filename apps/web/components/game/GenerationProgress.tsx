export interface GenerationProgressProps {
  processed: number;
  total: number;
  currentStep: string;
}

/** Pakli-generálás progress + aktuális lépés (H2) — soha nem tűnhet fagyottnak (DESIGN H2). */
export function GenerationProgress({ processed, total, currentStep }: GenerationProgressProps) {
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="text-lg font-semibold">Generálás…</div>
      <div className="h-4 rounded-[var(--radius-pill)] bg-surface-2 overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-text-muted">
        <span>› {currentStep}</span>
        <span className="font-numeric">
          {pct}% (feldolgozva: {processed} / {total})
        </span>
      </div>
    </div>
  );
}
