"use client";

import { AppButton } from "./AppButton";

export interface HelpModalProps {
  onClose: () => void;
}

/** Rövid szabály-összefoglaló popup — a host oldal "? Súgó" gombjához. */
export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Súgó"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-sm px-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface border border-border rounded-[var(--radius-card)] p-6 space-y-4 max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">🎵 Hogyan kell játszani?</h2>

        <div className="space-y-3 text-sm text-text-muted">
          <p>
            <span className="font-semibold text-text">1. Pakli.</span> Illessz be egy nyilvános
            Spotify playlist linket, vagy válassz egy ajánlott/meglévő paklit. A rendszer legyűjti a
            zenéket és az évszámaikat.
          </p>
          <p>
            <span className="font-semibold text-text">2. Kör.</span> A soron lévő játékos meghallgat
            egy titkos számot, és a saját idővonalán megpróbálja jó helyre rakni évszám szerint.
          </p>
          <p>
            <span className="font-semibold text-text">3. Betippelés.</span> A lerakás előtt címet,
            előadót és évszámot is írhat extra zsetonért. Mindegyik helyes mező külön +1 tokent ér.
          </p>
          <p>
            <span className="font-semibold text-text">4. Lopás.</span> A többiek 1 tokenért
            megjelölhetik, ők hova tennék a kártyát — ha a soron lévő rosszul rakta le és valaki
            eltalálja, ő viszi el a kártyát.
          </p>
          <p>
            <span className="font-semibold text-text">5. Győzelem.</span> Az nyer, aki elsőként eléri
            a beállított kártyaszámot az idővonalán.
          </p>
        </div>

        <AppButton fullWidth onClick={onClose}>
          Értem ▶
        </AppButton>
      </div>
    </div>
  );
}
