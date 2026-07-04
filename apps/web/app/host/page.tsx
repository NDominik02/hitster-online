"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { GenerationProgress } from "@/components/game/GenerationProgress";
import { CoverageReport } from "@/components/game/CoverageReport";
import { ensureAnonymousSession } from "@/lib/supabase/client";
import { generateDeck, createRoom, pollDeckUntilReady, spotifyRefreshToken } from "@/lib/supabase/functions";
import { startSpotifyLogin } from "@/lib/spotify/pkce";
import type { Deck } from "@/lib/game/types";

/**
 * H1 — Létrehozás (host): playlist forrás + beállítások (DESIGN H1 wireframe).
 * H2 — Pakli-előkészítés / riport ugyanezen az oldalon, generálás közben (DESIGN H2 wireframe).
 *
 * generate_deck AZONNAL visszatér `{ deckId, status: 'generating' }`-vel (BACKEND-NOTES 4. —
 * 2026-07-02 javítás: self-chaining batch-ekben fut a szerveren a 150 mp-es Edge Function
 * wall-clock limit miatt). A tényleges feldolgozás percekig tarthat (60-100 track-es playlisteknél
 * 1-4 perc) — ezt a decks táblát ~2 mp-enként pollingozva követjük (pollDeckUntilReady), amíg
 * status 'ready' vagy 'failed' nem lesz.
 */
export default function HostCreatePage() {
  const router = useRouter();
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [winTarget, setWinTarget] = useState(10);
  const [timeLimitSec, setTimeLimitSec] = useState(90);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<"form" | "generating" | "report">("form");
  const [progress, setProgress] = useState<{ processed: number; total: number; step: string }>({
    processed: 0,
    total: 0,
    step: "fetching_playlist",
  });
  const [deck, setDeck] = useState<Deck | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // S30 (Spotify Premium, F3) — a kapcsolat a SAJÁT auth.uid()-hez kötött, nem
  // egy adott szobához (Architect terv), ezért itt, a szoba létrehozása ELŐTT
  // is csatlakoztatható. A státuszt egy csendes spotify_refresh_token hívással
  // deríti ki: siker = van kapcsolat, 404 (no_spotify_connection) = nincs.
  const [spotifyStatus, setSpotifyStatus] = useState<"checking" | "connected" | "not_connected">("checking");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousSession();
        await spotifyRefreshToken();
        if (!cancelled) setSpotifyStatus("connected");
      } catch {
        if (!cancelled) setSpotifyStatus("not_connected");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnectSpotify() {
    await ensureAnonymousSession();
    const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      setError("A Spotify-integráció nincs konfigurálva ezen a környezeten.");
      return;
    }
    await startSpotifyLogin(clientId, redirectUri);
  }

  const urlLooksValid = /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/.test(playlistUrl.trim());

  async function handleGenerate() {
    if (!urlLooksValid) {
      setError("Érvénytelen Spotify playlist link. Ellenőrizd, és próbáld újra.");
      return;
    }
    setError(null);
    setPhase("generating");
    setProgress({ processed: 0, total: 0, step: "fetching_playlist" });

    try {
      await ensureAnonymousSession();

      // A HTTP hívás azonnal visszatér a deckId-vel, a feldolgozás a szerveren fut tovább.
      const { deckId } = await generateDeck(playlistUrl.trim());

      // Pollingozzuk a decks táblát ~2 mp-enként, amíg ready/failed nem lesz (BACKEND-NOTES 4.).
      const result = await pollDeckUntilReady(deckId, (partial) => {
        setProgress({
          processed: partial.progress.processed,
          total: partial.progress.total || 100,
          step: partial.progress.step,
        });
      });

      if (result.status === "failed") {
        const reason = result.progress.failReason;
        throw new Error(
          reason === "playlist_not_public"
            ? "Csak nyilvános playlist használható. Tedd a playlistet nyilvánossá, majd próbáld újra."
            : "Nem sikerült a pakli generálása. Ellenőrizd, hogy a playlist nyilvános-e, és próbáld újra."
        );
      }

      setDeck(result);
      setPhase("report");
    } catch (err) {
      setPhase("form");
      setError(err instanceof Error ? err.message : "Ismeretlen hiba történt a pakli generálása közben.");
    }
  }

  async function handleCreateRoom() {
    if (!deck) return;
    setCreatingRoom(true);
    setError(null);
    try {
      const { code } = await createRoom(deck.id, { winTarget, timeLimitSec, stealEnabled: false });
      router.push(`/host/${code}`);
    } catch (err) {
      setCreatingRoom(false);
      setError(err instanceof Error ? err.message : "Nem sikerült létrehozni a szobát.");
    }
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

        {phase === "form" && (
          <>
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

            {/* ⟨F2⟩ hely fenntartva — steal, F1-ben rejtve (DESIGN H1 wireframe) */}

            {/* S30 — Spotify Premium csatlakoztatás (opcionális, F3). Enélkül a parti
                a megszokott ingyenes 30 mp-es preview-val indul, semmi nem változik. */}
            <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">🎧 Spotify Premium</p>
                <p className="text-text-muted text-xs mt-0.5">
                  {spotifyStatus === "connected"
                    ? "Csatlakoztatva — teljes számok szólnak majd 30 mp-es preview helyett."
                    : "Opcionális — enélkül is megy a 30 mp-es ingyenes preview."}
                </p>
              </div>
              {spotifyStatus !== "connected" && (
                <AppButton size="sm" variant="secondary" onClick={handleConnectSpotify}>
                  Csatlakoztatás
                </AppButton>
              )}
            </div>

            <AppButton size="lg" fullWidth disabled={!playlistUrl} onClick={handleGenerate}>
              PAKLI GENERÁLÁSA ▶
            </AppButton>
          </>
        )}

        {phase === "generating" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">PAKLI ELŐKÉSZÍTÉSE</h2>
            <GenerationProgress
              processed={progress.processed}
              total={progress.total || 100}
              currentStep={stepLabel(progress.step)}
            />
            <p className="text-text-muted text-sm">
              Ez playlist mérettől függően akár 2-4 percig is eltarthat (MusicBrainz + iTunes lekérdezések).
            </p>
          </div>
        )}

        {phase === "report" && deck && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">PAKLI ELŐKÉSZÍTÉSE</h2>
            <CoverageReport
              usable={deck.report.usable}
              total={deck.report.total}
              pct={deck.report.coveragePct}
              excluded={deck.report.excluded}
              meetsMinimum={deck.report.meetsMinimum}
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <AppButton
              size="lg"
              fullWidth
              disabled={!deck.report.meetsMinimum || creatingRoom}
              onClick={handleCreateRoom}
            >
              {creatingRoom ? "Szoba létrehozása…" : "SZOBA LÉTREHOZÁSA ▶"}
            </AppButton>
            {!deck.report.meetsMinimum && (
              <AppButton variant="secondary" fullWidth onClick={() => setPhase("form")}>
                Másik playlist
              </AppButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function stepLabel(step: string): string {
  switch (step) {
    case "fetching_playlist":
      return "Playlist lekérése…";
    case "resolving_years":
      return "Évszámok lekérése (MusicBrainz)…";
    case "uploading_audio":
      return "Hangfájlok feltöltése…";
    case "done":
      return "Kész.";
    default:
      return "Feldolgozás…";
  }
}
