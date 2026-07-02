"use client";

import { AppButton } from "../system/AppButton";

export interface AudioUnlockOverlayProps {
  visible: boolean;
  onUnlock: () => void;
}

/**
 * Nagy PLAY fallback autoplay-blokknál (DESIGN 4.3b — KRITIKUS, iOS Safari autoplay-policy).
 * Csak akkor jelenik meg, ha a host <audio> elem nem tudott elindulni user-gesture nélkül.
 */
export function AudioUnlockOverlay({ visible, onUnlock }: AudioUnlockOverlayProps) {
  if (!visible) return null;

  return (
    <div
      role="alertdialog"
      aria-label="Lejátszás engedélyezése szükséges"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 text-center px-6">
        <AppButton size="lg" onClick={onUnlock} className="text-2xl px-12 py-6">
          ▶ Koppints a lejátszáshoz
        </AppButton>
        <p className="text-text-muted text-sm">(a böngésző kérte)</p>
      </div>
    </div>
  );
}
