"use client";

import { useEffect, useMemo, useState } from "react";
import { AppButton } from "../system/AppButton";
import { listDeckCards } from "../../lib/supabase/functions";
import type { Deck, DeckCardPreview, DeckCardPreviewPage } from "../../lib/game/types";

const PAGE_SIZE = 50;

export interface DeckPreviewModalProps {
  deck: Deck;
  onClose: () => void;
  onSelect: (deck: Deck) => void;
}

export function DeckPreviewModal({ deck, onClose, onSelect }: DeckPreviewModalProps) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DeckCardPreviewPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const nextResult = await listDeckCards(deck.id, { page, pageSize: PAGE_SIZE, query });
        if (!cancelled) setResult(nextResult);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nem sikerült betölteni a pakli számait.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deck.id, page, query]);

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);
  const summary = useMemo(() => {
    const base = `${deck.usableCount} kártya`;
    const totalText = deck.totalTracks !== deck.usableCount ? ` / ${deck.totalTracks} szám` : "";
    return `${base}${totalText} - ${deck.coveragePct.toFixed(0)}% lefedettség`;
  }, [deck.coveragePct, deck.totalTracks, deck.usableCount]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${deck.name} pakli megnézése`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/85 px-4 py-4 backdrop-blur-sm sm:items-center sm:py-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-[var(--radius-card)] border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow mb-1">{deck.isFeatured ? "Ajánlott pakli" : "Meglévő pakli"}</p>
              <h2 className="truncate text-xl font-bold">{deck.name}</h2>
              <p className="mt-1 text-sm text-text-muted">{summary}</p>
            </div>
            <button
              type="button"
              aria-label="Bezárás"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-button)] text-xl text-text-muted hover:bg-surface-2 hover:text-text"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div className="mt-4">
            <label className="sr-only" htmlFor="deck-preview-search">
              Keresés a pakliban
            </label>
            <input
              id="deck-preview-search"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Keresés cím vagy előadó alapján..."
              className="h-12 w-full rounded-[var(--radius-button)] border-2 border-border bg-surface-2 px-4 text-base outline-none focus-visible:border-accent"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p role="alert" className="rounded-[var(--radius-card)] border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : loading && !result ? (
            <p className="py-8 text-center text-sm text-text-muted">Számok betöltése...</p>
          ) : result && result.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">Nincs találat ebben a pakliban.</p>
          ) : (
            <div className="space-y-2">
              {(result?.items ?? []).map((card) => (
                <DeckPreviewRow key={card.id} card={card} />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-muted">
              {loading && result ? "Frissítés..." : `${pageStart}-${pageEnd} / ${total}`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <AppButton
                size="sm"
                variant="secondary"
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Előző
              </AppButton>
              <span className="min-w-16 text-center text-sm text-text-muted">
                {page} / {totalPages}
              </span>
              <AppButton
                size="sm"
                variant="secondary"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Következő
              </AppButton>
              <AppButton size="sm" onClick={() => onSelect(deck)}>
                Kiválasztom
              </AppButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeckPreviewRow({ card }: { card: DeckCardPreview }) {
  return (
    <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2 px-3 py-2">
      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[10px] bg-surface">
        {card.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.artworkUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="text-lg" aria-hidden>
            ♪
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{card.title}</p>
        <p className="truncate text-sm text-text-muted">{card.artist}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="font-numeric text-base font-bold">{card.year}</span>
        {(card.spotifyOnly || card.yearUncertain) && (
          <span className="rounded-[var(--radius-pill)] border border-border px-2 py-0.5 text-[11px] text-text-muted">
            {card.spotifyOnly ? "Spotify" : "bizonytalan"}
          </span>
        )}
      </div>
    </div>
  );
}
