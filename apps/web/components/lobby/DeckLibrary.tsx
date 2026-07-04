"use client";

import { AppButton } from "../system/AppButton";
import type { Deck } from "../../lib/game/types";

export interface DeckLibraryProps {
  decks: Deck[];
  loading: boolean;
  currentUid: string | null;
  onSelect: (deck: Deck) => void;
}

/**
 * S31 (F3, pakli-könyvtár) — korábban generált (saját) vagy megosztott
 * (is_public) kész paklik listája újrafelhasználásra (DESIGN H1 kiegészítés).
 * Csak `status='ready'` paklik jelennek meg — a listDecks wrapper már ezekre
 * szűr, itt csak a megjelenítés van.
 */
export function DeckLibrary({ decks, loading, currentUid, onSelect }: DeckLibraryProps) {
  if (loading) {
    return <p className="text-text-muted text-sm text-center py-8">Paklik betöltése…</p>;
  }

  if (decks.length === 0) {
    return (
      <p className="text-text-muted text-sm text-center py-8">
        Még nincs mentett pakli. Generálj egyet playlist linkből — utána itt is megjelenik.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {decks.map((deck) => {
        const isOwn = deck.ownerId === currentUid;
        return (
          <div
            key={deck.id}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-semibold truncate">{deck.name}</p>
              <p className="text-text-muted text-xs mt-0.5">
                {deck.usableCount} kártya · {deck.coveragePct.toFixed(0)}% lefedettség ·{" "}
                {isOwn ? "saját" : "megosztott"}
              </p>
            </div>
            <AppButton size="sm" variant="secondary" onClick={() => onSelect(deck)}>
              Kiválasztom
            </AppButton>
          </div>
        );
      })}
    </div>
  );
}
