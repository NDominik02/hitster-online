"use client";

import { useState } from "react";
import clsx from "clsx";
import type { CoverageExcludedTrack } from "@/lib/game/types";
import { addManualYearCard } from "@/lib/supabase/functions";
import { AppButton } from "../system/AppButton";

export interface CoverageReportProps {
  deckId: string;
  usable: number;
  total: number;
  pct: number;
  excluded: CoverageExcludedTrack[];
  meetsMinimum: boolean; // D4: >= 60 kell
  importWarning?: string;
  spotifyOnlyCount?: number;
  /** A szülő itt kapja meg a friss usable/coverage/excluded állapotot egy sikeres
   *  évszám-mentés után (playtest feedback, 2026-07-06). */
  onRescued: (result: {
    usableCount: number;
    coveragePct: number;
    meetsMinimum: boolean;
    spotifyOnlyCount?: number;
    excluded: CoverageExcludedTrack[];
  }) => void;
}

const REASON_LABELS: Record<CoverageExcludedTrack["reason"], string> = {
  no_preview: "nincs preview",
  no_year: "nincs évszám",
};

/** Lefedettségi riport (H2): fő szám + kimaradt lista — DESIGN H2 wireframe. */
export function CoverageReport({
  deckId,
  usable,
  total,
  pct,
  excluded,
  meetsMinimum,
  importWarning,
  spotifyOnlyCount = 0,
  onRescued,
}: CoverageReportProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-4">
      {importWarning && (
        <div className="rounded-[var(--radius-card)] border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
          {importWarning}
        </div>
      )}

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
        {spotifyOnlyCount > 0 && (
          <div className="text-text-muted mt-2 text-sm">
            {spotifyOnlyCount} szám teljes Spotify-lejátszással működik, ezekhez Premium mód kell.
          </div>
        )}
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
            <ul className="mt-2 space-y-2 text-sm text-text-muted">
              {excluded.map((t, i) => (
                <ExcludedRow key={i} deckId={deckId} track={t} onRescued={onRescued} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ExcludedRow({
  deckId,
  track,
  onRescued,
}: {
  deckId: string;
  track: CoverageExcludedTrack;
  onRescued: CoverageReportProps["onRescued"];
}) {
  const [yearInput, setYearInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRescue = track.reason === "no_year" && track.hasSource && typeof track.index === "number";

  async function handleSave() {
    if (typeof track.index !== "number") return;
    const year = Number.parseInt(yearInput, 10);
    if (!Number.isFinite(year)) {
      setError("Adj meg egy évszámot.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await addManualYearCard(deckId, track.index, year);
      onRescued(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült a mentés.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li>
      <div className="flex items-center gap-2 flex-wrap">
        <span>
          • {track.artist} – {track.title} → {REASON_LABELS[track.reason]}
        </span>
        {canRescue && (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
              placeholder="pl. 1985"
              disabled={saving}
              className="w-20 min-h-8 rounded-[var(--radius-button)] bg-surface-2 border border-border focus-visible:border-accent px-2 py-1 text-sm text-text"
            />
            <AppButton size="sm" variant="secondary" disabled={saving || !yearInput} onClick={handleSave}>
              {saving ? "Mentés…" : "Hozzáadás"}
            </AppButton>
          </div>
        )}
      </div>
      {error && <p className="text-danger text-xs mt-1">{error}</p>}
    </li>
  );
}
