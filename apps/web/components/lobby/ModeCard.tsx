"use client";

import clsx from "clsx";

export interface ModeCardProps {
  icon: string;
  title: string;
  description: string;
  highlighted?: boolean;
  onClick: () => void;
}

/** PP0 — mód-választó kártya-gomb (Pass-and-play UX terv, "ModeCard"). */
export function ModeCard({ icon, title, description, highlighted, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "min-h-24 w-full rounded-[var(--radius-card)] border-2 p-5 text-left flex flex-col gap-2 transition-colors",
        highlighted ? "border-accent shadow-[0_0_12px_rgba(245,182,46,0.25)]" : "border-border hover:border-accent"
      )}
    >
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <span className="font-bold">{title}</span>
      <span className="text-sm text-text-muted">{description}</span>
    </button>
  );
}
