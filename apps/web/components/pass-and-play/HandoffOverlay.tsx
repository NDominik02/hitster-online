"use client";

import { PlayerBadge } from "../lobby/PlayerBadge";
import { AppButton } from "../system/AppButton";
import type { PlayerColorId } from "@/lib/game/types";

export interface HandoffOverlayProps {
  variant: "pass" | "guard";
  playerName: string;
  playerColor: PlayerColorId;
  onConfirm: () => void;
  disabled?: boolean;
}

/**
 * PP1 ("Add tovább X-nek!") / PP3 ("Csak X nézzen oda most") — teljes képernyős,
 * egykezes átadó/védő-overlay Pass-and-play módhoz (Designer terv). Szándékosan
 * ÜRES a képernyő közepe/alja (nincs "elősejtés" semmilyen kör-adatról) — az
 * Architect döntése szerint a kártya-adat csak a `pass` variánsnál a gombnyomás
 * UTÁN töltődik be a hívó oldalon (draw_card csak ekkor fut le).
 */
export function HandoffOverlay({ variant, playerName, playerColor, onConfirm, disabled }: HandoffOverlayProps) {
  const isPass = variant === "pass";

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-between px-6 py-12"
    >
      <div />
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="text-5xl" aria-hidden>
          {isPass ? "📱" : "👀"}
        </span>
        <h1 className="text-2xl font-bold uppercase">{isPass ? "Add tovább!" : "Csak ő nézzen oda"}</h1>
        <PlayerBadge name={playerName} color={playerColor} size="lg" />
        <p className="text-text-muted text-sm">
          {isPass ? "ő jön most" : "most — a többiek forduljanak el 🙈"}
        </p>
      </div>
      <AppButton size="lg" fullWidth disabled={disabled} onClick={onConfirm} className="text-xl min-h-16">
        {isPass ? "Megvagyok, mutasd! ▶" : "Mutasd a lapot! ▶"}
      </AppButton>
    </div>
  );
}
