"use client";

import { AppButton } from "../system/AppButton";
import { ActionIconButton } from "../system/ActionIconButton";
import type { Deck } from "../../lib/game/types";

export interface DeckLibraryProps {
  decks: Deck[];
  loading: boolean;
  connected: boolean;
  onConnect: () => void;
  onSelect: (deck: Deck) => void;
  onPreview?: (deck: Deck) => void;
  onRename?: (deck: Deck) => void;
  onDelete?: (deck: Deck) => void;
  renamingDeckId?: string | null;
  deletingDeckId?: string | null;
}

/**
 * S31 (F3, pakli-könyvtár) - korábban generált saját vagy megosztott
 * kész paklik listája újrafelhasználásra.
 */
export function DeckLibrary({
  decks,
  loading,
  connected,
  onConnect,
  onSelect,
  onPreview,
  onRename,
  onDelete,
  renamingDeckId,
  deletingDeckId,
}: DeckLibraryProps) {
  if (loading) {
    return <p className="text-text-muted py-8 text-center text-sm">Paklik betöltése...</p>;
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="max-w-md text-sm text-text-muted">
          A mentett paklik Spotify-fiókhoz tartoznak. Csatlakoztasd a fiókodat a saját paklijaid megnyitásához.
        </p>
        <AppButton size="sm" variant="secondary" onClick={onConnect}>
          Spotify csatlakoztatása
        </AppButton>
      </div>
    );
  }

  if (decks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        Még nincs mentett pakli. Generálj egyet playlist linkből, utána itt is megjelenik.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {decks.map((deck) => {
        const kindLabel = deck.isStarred ? "csillagozott" : "Spotify-only";
        return (
          <div
            key={deck.id}
            className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{deck.name}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {deck.usableCount} kártya
                {deck.totalTracks !== deck.usableCount ? ` / ${deck.totalTracks} szám` : ""} -{" "}
                {deck.coveragePct.toFixed(0)}% lefedettség - {kindLabel}
                {deck.isFeatured ? " - ajánlott" : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {onPreview && (
                <ActionIconButton
                  icon="eye"
                  label="Megnézem"
                  size="sm"
                  variant="secondary"
                  onClick={() => onPreview(deck)}
                />
              )}
              <AppButton size="sm" variant="secondary" onClick={() => onSelect(deck)}>
                Kiválasztom
              </AppButton>
              {onRename && (
                <ActionIconButton
                  icon="pen"
                  label={renamingDeckId === deck.id ? "Átnevezés folyamatban" : "Átnevezés"}
                  size="sm"
                  variant="secondary"
                  disabled={renamingDeckId === deck.id}
                  onClick={() => onRename(deck)}
                />
              )}
              {onDelete && (
                <ActionIconButton
                  icon="trash"
                  label={deletingDeckId === deck.id ? "Törlés folyamatban" : "Törlés"}
                  size="sm"
                  variant="danger"
                  disabled={deletingDeckId === deck.id}
                  onClick={() => onDelete(deck)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
