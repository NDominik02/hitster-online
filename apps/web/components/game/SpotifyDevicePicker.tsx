"use client";

import { AppButton } from "../system/AppButton";
import type { SpotifyConnectDevice } from "../../lib/spotify/useSpotifyPlayback";

export interface SpotifyDevicePickerProps {
  visible: boolean;
  devices: SpotifyConnectDevice[];
  loading: boolean;
  onSelect: (deviceId: string) => void;
  onSkip: () => void;
}

/**
 * S20 (F3) — csak akkor jelenik meg, ha a Web Playback SDK nem tudott
 * elindulni a böngészőben (tipikusan mobilon) 'premium' módú szobában. A
 * host a SAJÁT telefonján/hangszóróján futó Spotify-appot választja ki mint
 * Connect API-s lejátszási célt. "Kihagyás" esetén a parti a 30 mp-es
 * preview módra esik vissza — a játék enélkül is teljesen működik.
 */
export function SpotifyDevicePicker({ visible, devices, loading, onSelect, onSkip }: SpotifyDevicePickerProps) {
  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Spotify-lejátszó eszköz kiválasztása"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 backdrop-blur-sm px-6"
    >
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="text-2xl" aria-hidden>
          🎧
        </p>
        <h2 className="text-lg font-bold">Válassz Spotify-eszközt</h2>
        <p className="text-text-muted text-sm">
          Indíts el egy számot bármelyik Spotify-appodban (pl. a telefonodon), hogy megjelenjen itt.
        </p>

        {loading && <p className="text-text-muted text-sm">Eszközök keresése…</p>}

        {!loading && devices.length === 0 && (
          <p className="text-text-muted text-sm">Nem található aktív Spotify-eszköz.</p>
        )}

        <div className="space-y-2">
          {devices.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className="w-full min-h-11 rounded-[var(--radius-button)] bg-surface-2 border-2 border-border hover:border-accent px-4 py-3 text-left"
            >
              <span className="font-semibold">{d.name}</span>
              <span className="text-text-muted text-xs ml-2">({d.type})</span>
            </button>
          ))}
        </div>

        <AppButton variant="secondary" fullWidth onClick={onSkip}>
          Kihagyás — marad a 30 mp-es preview
        </AppButton>
      </div>
    </div>
  );
}
