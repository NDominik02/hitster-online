"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { MOCK_ROOM_CODE } from "@/lib/mock-data";
import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * H1 — Létrehozás (host): playlist forrás + beállítások (DESIGN H1 wireframe).
 * TODO(BACKEND-INTEGRÁCIÓ): jelenleg "Pakli generálása" a mock roomCode-dal navigál a
 * host/[roomCode]-ra, ami a lib/mock-data.ts-t mutatja. Ha kész a generate_deck +
 * create_room Edge Function (docs/BACKEND-NOTES.md), itt kell meghívni valóban:
 *   1. generateDeck(playlistUrl) → deckId
 *   2. createRoom(deckId, settings) → roomId + code
 *   3. router.push(`/host/${code}`)
 */
export default function HostCreatePage() {
  const router = useRouter();
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [winTarget, setWinTarget] = useState(10);
  const [timeLimitSec, setTimeLimitSec] = useState(90);
  const [error, setError] = useState<string | null>(null);

  const urlLooksValid = /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/.test(playlistUrl.trim());

  function handleGenerate() {
    if (!urlLooksValid) {
      setError("Érvénytelen Spotify playlist link. Ellenőrizd, és próbáld újra.");
      return;
    }
    setError(null);
    // TODO(BACKEND-INTEGRÁCIÓ): generate_deck + create_room valós hívása.
    const code = isSupabaseConfigured() ? MOCK_ROOM_CODE : MOCK_ROOM_CODE;
    router.push(`/host/${code}`);
  }

  return (
    <div className="flex flex-col flex-1 items-center px-6 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span aria-hidden>🎵</span> HITSTER ONLINE
          </h1>
          <button className="text-text-muted text-sm hover:text-text">? Súgó</button>
        </header>

        <div>
          <h2 className="text-2xl font-bold mb-6">Új játék létrehozása</h2>

          <label className="block mb-1 font-medium" htmlFor="playlist-url">
            Pakli forrása
          </label>
          <input
            id="playlist-url"
            type="url"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="https://open.spotify.com/playlist/..."
            className="w-full min-h-11 rounded-[var(--radius-button)] bg-surface-2 border-2 border-border focus-visible:border-accent px-4 py-3 text-base"
            aria-invalid={Boolean(error)}
            aria-describedby="playlist-url-help"
          />
          <p id="playlist-url-help" className="text-sm text-text-muted mt-1">
            › Illeszd be egy Spotify playlist linkjét.
          </p>
          {error && (
            <p role="alert" className="text-sm text-danger mt-1">
              {error}
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <SegmentedControl
            label="Győzelmi limit"
            ariaLabel="Győzelmi limit"
            value={winTarget}
            onChange={setWinTarget}
            options={[
              { value: 5, label: "5 · gyors" },
              { value: 10, label: "10 · alap" },
              { value: 15, label: "15 · maraton" },
            ]}
          />
          <SegmentedControl
            label="Időlimit"
            ariaLabel="Időlimit másodpercben"
            value={timeLimitSec}
            onChange={setTimeLimitSec}
            options={[
              { value: 60, label: "60 mp" },
              { value: 90, label: "90 mp" },
              { value: 120, label: "120 mp" },
            ]}
          />
        </div>

        {/* ⟨F2⟩/⟨F3⟩ hely fenntartva — steal + Premium, F1-ben rejtve (DESIGN H1 wireframe) */}

        <AppButton size="lg" fullWidth disabled={!playlistUrl} onClick={handleGenerate}>
          PAKLI GENERÁLÁSA ▶
        </AppButton>

        {!isSupabaseConfigured() && (
          <p className="text-xs text-text-muted text-center">
            Fejlesztői mód: a Supabase backend még nincs bekötve, ez a gomb egy demo szobát nyit meg (mock adatokkal).
          </p>
        )}
      </div>
    </div>
  );
}
