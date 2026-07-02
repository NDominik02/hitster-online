"use client";

import { useState } from "react";
import clsx from "clsx";
import type { CoverageExcludedTrack } from "@/lib/game/types";

export interface CoverageReportProps {
  usable: number;
  total: number;
  pct: number;
  excluded: CoverageExcludedTrack[];
  meetsMinimum: boolean; // D4: >= 60 kell
}

const REASON_LABELS: Record<CoverageExcludedTrack["reason"], string> = {
  no_preview: "nincs preview",
  no_year: "nincs évszám",
};

/** Lefedettségi riport (H2): fő szám + kimaradt lista — DESIGN H2 wireframe. */
export function CoverageReport({ usable, total, pct, excluded, meetsMinimum }: CoverageReportProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-4">
      <div
        className={clsx(
          "rounded-[var(--radius-card)] border-2 px-6 py-5 text-center",
          meetsMinimum ? "border-success bg-success/10" : "border-warning bg-warning/10"
        )}
      >
        <div className={clsx("text-3xl md:text-4xl font-bold", meetsMinimum ? "text-success" : "text-warning")}>
          {meetsMinimum ? "✅" : "⚠"} {usable} / {total} szám használható
        </div>
        <div className="text-text-muted mt-1">({pct.toFixed(1)}% lefedettség)</div>
        {!meetsMinimum && (
          <p className="text-warning text-sm mt-3">
            Ehhez a paklihoz kevés a játszható szám (60 kell). Próbálj hosszabb vagy ismertebb playlistet.
          </p>
        )}
      </div>

      {excluded.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sm text-text-muted hover:text-text underline underline-offset-2"
          >
            Kimaradt számok ({excluded.length}) {expanded ? "▴" : "▾ mutat"}
          </button>
          {expanded && (
            <ul className="mt-2 space-y-1 text-sm text-text-muted">
              {excluded.map((t, i) => (
                <li key={i}>
                  • {t.artist} – {t.title} → {REASON_LABELS[t.reason]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
