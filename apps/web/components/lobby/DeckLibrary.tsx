"use client";

import { AppButton } from "../system/AppButton";
import type { Deck } from "../../lib/game/types";

export interface DeckLibraryProps {
  decks: Deck[];
  loading: boolean;
  connected: boolean;
  onConnect: () => void;
  onSelect: (deck: Deck) => void;
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
  onRename,
  onDelete,
  renamingDeckId,
  deletingDeckId,
}: DeckLibraryProps) {
  if (loading) {
    return <p className="text-text-muted text-sm text-center py-8">Paklik betöltése...</p>;
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
      <p className="text-text-muted text-sm text-center py-8">
        Még nincs mentett pakli. Generálj egyet playlist linkből, utána itt is megjelenik.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {decks.map((deck) => {
        const canManage = !deck.isFeatured;
        return (
          <div
            key={deck.id}
            className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-semibold truncate">{deck.name}</p>
              <p className="text-text-muted text-xs mt-0.5">
                {deck.usableCount} kártya - {deck.coveragePct.toFixed(0)}% lefedettség - saját
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <AppButton size="sm" variant="secondary" onClick={() => onSelect(deck)}>
                Kiválasztom
              </AppButton>
              {canManage && onRename && (
                <AppButton
                  size="sm"
                  variant="secondary"
                  disabled={renamingDeckId === deck.id}
                  onClick={() => onRename(deck)}
                >
                  {renamingDeckId === deck.id ? "Mentés..." : "Átnevezés"}
                </AppButton>
              )}
              {canManage && onDelete && (
                <AppButton
                  size="sm"
                  variant="danger"
                  disabled={deletingDeckId === deck.id}
                  onClick={() => onDelete(deck)}
                >
                  {deletingDeckId === deck.id ? "Törlés..." : "Törlés"}
                </AppButton>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
