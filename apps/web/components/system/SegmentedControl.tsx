"use client";

import clsx from "clsx";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  sublabel?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  ariaLabel?: string;
}

/** Szegmentált választó (H1: győzelmi limit, időlimit) — DESIGN wireframe H1. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div>
      {label && <div className="eyebrow mb-2">{label}</div>}
      <div
        role="radiogroup"
        aria-label={ariaLabel ?? label}
        className="inline-flex rounded-[var(--radius-button)] border border-border bg-surface p-1 gap-1"
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={clsx(
                "min-h-11 px-4 rounded-[calc(var(--radius-button)-4px)] text-sm font-bold font-code transition-colors duration-150",
                active ? "bg-accent text-[var(--bg)]" : "text-text-muted hover:text-text"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
