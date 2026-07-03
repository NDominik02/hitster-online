"use client";

import { useState } from "react";
import type { TimelineCardPublic } from "@/lib/game/types";
import { Timeline } from "./Timeline";
import { AppButton } from "../system/AppButton";

export interface StealButtonProps {
  /** A stealer SAJÁT idővonala — ide jelöl rést (ARCHITECTURE 11.6.1, AC22.4). */
  cards: TimelineCardPublic[];
  ownerColorValue: string;
  tokens: number;
  /** Már leadta-e a steal-jét ebben a körben (AC22.5 — egy steal/játékos/kör). */
  alreadyStole: boolean;
  /** A register_steal hívás folyamatban van-e (submit közbeni letiltás). */
  submitting?: boolean;
  onSteal: (position: number) => void;
}

/**
 * Steal-gomb + pozíciójelölő a P4 steal-képernyőn (DESIGN 5.4 ⟨F2⟩, ARCHITECTURE 11.6.1/11.8).
 *
 * A nem-aktív játékosok a saját idővonalukon jelölnek rést a REJTETT kártyához (anti-leak,
 * AC22.10 — a kártya kiléte itt sosem derül ki), majd 1 tokenért "elteszik" a jelölést. A
 * jelölés kliens-lokális, amíg a `register_steal`-t le nem adják — nem broadcastoljuk
 * (ARCHITECTURE 11.8: a steal-pozíció sosem hagyja el a klienst a hívásig).
 */
export function StealButton({
  cards,
  ownerColorValue,
  tokens,
  alreadyStole,
  submitting,
  onSteal,
}: StealButtonProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const canSteal = tokens >= 1 && !alreadyStole;

  if (alreadyStole) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3 text-center">
        <p className="font-semibold">✅ Leadtad a lopást — várd a reveal-t!</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-accent bg-surface-2 px-4 py-3 space-y-3">
      <p className="font-bold text-center">🕵️ Szerinted rossz helyre rakta? Lopd el!</p>

      {tokens < 1 && (
        <p className="text-xs text-warning text-center">Nincs elég tokened a lopáshoz (1 🪙 kell).</p>
      )}

      <div>
        <div className="text-center text-xs text-text-muted mb-1">Jelöld meg, hova tennéd</div>
        <Timeline
          cards={cards}
          slots={canSteal}
          activeSlotIndex={selectedSlot}
          ownerColor={ownerColorValue}
          onTapSelectSlot={canSteal ? setSelectedSlot : undefined}
        />
      </div>

      <AppButton
        size="lg"
        fullWidth
        variant="secondary"
        disabled={!canSteal || selectedSlot === null || submitting}
        onClick={() => selectedSlot !== null && onSteal(selectedSlot)}
      >
        {submitting ? "Lopás folyamatban…" : "Ellopom! (1 🪙)"}
      </AppButton>
    </div>
  );
}
