"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { GenerationProgress } from "@/components/game/GenerationProgress";
import { CoverageReport } from "@/components/game/CoverageReport";
import { ModeCard } from "@/components/lobby/ModeCard";
import { DeckLibrary } from "@/components/lobby/DeckLibrary";
import { RosterBuilder, type RosterEntry } from "@/components/pass-and-play/RosterBuilder";
import { ensureAnonymousSession, getSupabaseClient } from "@/lib/supabase/client";
import {
  generateDeck,
  createRoom,
  joinRoom,
  pollDeckUntilReady,
  spotifyRefreshToken,
  listDecks,
  findReadyDeckByPlaylistUrl,
} from "@/lib/supabase/functions";
import { FEATURED_PLAYLISTS } from "@/lib/featuredPlaylists";
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
  // S32 — a lopás (F2) alapból BE van kapcsolva (a "teljes Hitster élmény" már
  // éles funkció), a host itt kapcsolhatja ki, ha egyszerűbb partit szeretne.
  // Pass-and-play módban ez mindig kikapcsolt és nem módosítható (US-PP6) — a
  // szerver ezt amúgy is kikényszeríti (create_room), itt csak vizuálisan is
  // jelezzük, hogy a kapcsoló ne legyen félrevezető.
  const [stealEnabled, setStealEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<"mode" | "form" | "generating" | "report">("mode");
  const [progress, setProgress] = useState<{ processed: number; total: number; step: string }>({
    processed: 0,
    total: 0,
    step: "fetching_playlist",
  });
  const [deck, setDeck] = useState<Deck | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // PP0 (Pass-and-play mód-választó) — US-PP1: a mód a szoba-létrehozás ELŐTT dől el,
  // menet közben nem váltható. "shared_screen" a jelenlegi (F1/F2) host+player mód.
  const [mode, setMode] = useState<"shared_screen" | "pass_and_play" | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [creatingRoster, setCreatingRoster] = useState(false);

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

  // S31 (F3, pakli-könyvtár) — a host választhat "Új pakli" (playlist URL-ből
  // generál), "Ajánlott" (tulaj által előre kiválasztott playlist-csomagok,
  // ld. lib/featuredPlaylists.ts) és "Meglévő pakli" (korábban generált
  // saját/megosztott, a decks RLS-e alapján listázott) között. A
  // könyvtárból/ajánlottból választás — ha van már kész pakli rá — azonnal
  // a "report" fázisba ugrik, generálás/pollingozás nélkül.
  const [deckSource, setDeckSource] = useState<"new" | "featured" | "library">("new");
  const [libraryDecks, setLibraryDecks] = useState<Deck[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [featuredLoadingUrl, setFeaturedLoadingUrl] = useState<string | null>(null);

  async function handleSelectSource(source: "new" | "featured" | "library") {
    setDeckSource(source);
    setError(null);
    if (source === "library" && libraryDecks.length === 0) {
      setLibraryLoading(true);
      try {
        await ensureAnonymousSession();
        const [decks, { data: userData }] = await Promise.all([listDecks(), getSupabaseClient().auth.getUser()]);
        setLibraryDecks(decks);
        setCurrentUid(userData.user?.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nem sikerült betölteni a pakli-könyvtárat.");
      } finally {
        setLibraryLoading(false);
      }
    }
  }

  function handleSelectLibraryDeck(selected: Deck) {
    setDeck(selected);
    setPhase("report");
  }

  /**
   * "Ajánlott playlistek" gyorsválasztó (ld. lib/featuredPlaylists.ts) — előbb
   * megnézzük, van-e már KÉSZ pakli erre a playlistre (bárkitől), ha igen,
   * azonnal újrahasználjuk generálás nélkül; ha nem, elindul a szokásos
   * generálás (playlistUrl state-et is beállítjuk, hogy a "form" fázis
   * visszatérésekor a mező ne legyen üres).
   */
  async function handleSelectFeatured(pl: { name: string; url: string }) {
    setError(null);
    setPlaylistUrl(pl.url);
    setFeaturedLoadingUrl(pl.url);
    try {
      await ensureAnonymousSession();
      const cached = await findReadyDeckByPlaylistUrl(pl.url);
      if (cached) {
        setDeck(cached);
        setPhase("report");
        return;
      }
      await handleGenerate(pl.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült betölteni az ajánlott playlistet.");
    } finally {
      setFeaturedLoadingUrl(null);
    }
  }

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

  /**
   * `urlOverride` — az "Ajánlott playlistek" gyorsválasztó adja át explicit
   * paraméterként (ld. handleSelectFeatured), mert a setPlaylistUrl(...) állapot-
   * frissítés aszinkron/batch-elt, tehát egy közvetlenül utána hívott
   * handleGenerate() még a RÉGI playlistUrl-t olvasná a state-ből.
   */
  async function handleGenerate(urlOverride?: string) {
    const url = (urlOverride ?? playlistUrl).trim();
    if (!urlOverride && !urlLooksValid) {
      setError("Érvénytelen Spotify playlist link. Ellenőrizd, és próbáld újra.");
      return;
    }
    setError(null);
    setPhase("generating");
    setProgress({ processed: 0, total: 0, step: "fetching_playlist" });

    try {
      await ensureAnonymousSession();

      // A HTTP hívás azonnal visszatér a deckId-vel, a feldolgozás a szerveren fut tovább.
      const { deckId } = await generateDeck(url);

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
      const { code } = await createRoom(deck.id, {
        winTarget,
        timeLimitSec,
        stealEnabled,
        mode: "shared_screen",
        spotifyPlaybackMode: spotifyStatus === "connected" ? "premium" : "preview",
      });
      router.push(`/host/${code}`);
    } catch (err) {
      setCreatingRoom(false);
      setError(err instanceof Error ? err.message : "Nem sikerült létrehozni a szobát.");
    }
  }

  /**
   * Pass-and-play — a névsor összeállítása UTÁN: egyetlen munkamenettel (auth_uid)
   * hozzuk létre a szobát ÉS csatlakoztatjuk az összes roster-játékost egymás után
   * (join_room pass_and_play módban minden hívásra új players sort hoz létre —
   * ld. 009_pass_and_play_multi_player_per_auth migráció). Utána a solo state-gép
   * oldalra navigálunk, nem a klasszikus /host/[roomCode]-ra.
   */
  async function handleCreatePassAndPlayRoom() {
    if (!deck || roster.length < 2) return;
    setCreatingRoster(true);
    setError(null);
    try {
      const { code } = await createRoom(deck.id, {
        winTarget,
        timeLimitSec,
        stealEnabled: false,
        mode: "pass_and_play",
      });
      // Sorban, nem párhuzamosan — a szín/seat-ütközések elkerülése végett.
      for (const entry of roster) {
        await joinRoom(code, entry.name, entry.color);
      }
      router.push(`/host/${code}/solo`);
    } catch (err) {
      setCreatingRoster(false);
      setError(err instanceof Error ? err.message : "Nem sikerült elindítani a partit.");
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

        {phase === "mode" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center mb-2">Hogyan játszotok?</h2>
            <ModeCard
              icon="📺"
              title="Klasszikus"
              description="Egy közös képernyő + mindenki a saját telefonján."
              onClick={() => {
                setMode("shared_screen");
                setPhase("form");
              }}
            />
            <ModeCard
              icon="📱"
              title="Add tovább!"
              description="Egyetlen telefon, körbeadva — nincs szükség másik eszközre. 2–6 fő ajánlott."
              highlighted
              onClick={() => {
                setMode("pass_and_play");
                setPhase("form");
              }}
            />
          </div>
        )}

        {phase === "form" && (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-6">Új játék létrehozása</h2>

              {/* S31 (F3, pakli-könyvtár) — "Új pakli" (playlist URL-ből generál, F1 óta
                  ismert), "Ajánlott" (tulaj által előre kiválasztott csomagok) vagy
                  "Meglévő pakli" (korábban generált saját/megosztott). */}
              <SegmentedControl
                label="Pakli forrása"
                ariaLabel="Pakli forrása"
                value={deckSource}
                onChange={handleSelectSource}
                options={[
                  { value: "new", label: "Új pakli" },
                  { value: "featured", label: "Ajánlott" },
                  { value: "library", label: "Meglévő pakli" },
                ]}
              />

              {deckSource === "new" && (
                <div className="mt-3">
                  <label className="block mb-1 font-medium" htmlFor="playlist-url">
                    Spotify playlist link
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
                </div>
              )}

              {deckSource === "featured" && (
                <div className="mt-3 space-y-2">
                  {FEATURED_PLAYLISTS.length === 0 ? (
                    <p className="text-text-muted text-sm">Még nincs ajánlott playlist beállítva.</p>
                  ) : (
                    FEATURED_PLAYLISTS.map((pl) => (
                      <button
                        key={pl.url}
                        type="button"
                        disabled={featuredLoadingUrl !== null}
                        onClick={() => handleSelectFeatured(pl)}
                        className="w-full min-h-11 rounded-[var(--radius-button)] bg-surface-2 border-2 border-border hover:border-accent px-4 py-3 text-left disabled:opacity-50"
                      >
                        <span className="font-semibold">{pl.name}</span>
                        {featuredLoadingUrl === pl.url && (
                          <span className="text-text-muted text-sm ml-2">betöltés…</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {deckSource === "library" && (
                <div className="mt-3">
                  <DeckLibrary
                    decks={libraryDecks}
                    loading={libraryLoading}
                    currentUid={currentUid}
                    onSelect={handleSelectLibraryDeck}
                  />
                </div>
              )}

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

            {/* S32 — lopás be/ki. Pass-and-play módban kikényszerítve kikapcsolt (US-PP6,
                AC32.2) — a szerver amúgy is felülírná, itt csak vizuálisan is jelezzük. */}
            <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">🕵️ Lopás</p>
                <p className="text-text-muted text-xs mt-0.5">
                  {mode === "pass_and_play"
                    ? "Add tovább módban nincs lopás (egyedül nincs kitől)."
                    : "Más játékosok 1 tokenért megpróbálhatják ellopni a rosszul lerakott kártyát."}
                </p>
              </div>
              <div className={mode === "pass_and_play" ? "pointer-events-none opacity-50" : undefined}>
                <SegmentedControl
                  ariaLabel="Lopás engedélyezése"
                  value={mode === "pass_and_play" ? "off" : stealEnabled ? "on" : "off"}
                  onChange={(v) => setStealEnabled(v === "on")}
                  options={[
                    { value: "on", label: "Be" },
                    { value: "off", label: "Ki" },
                  ]}
                />
              </div>
            </div>

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

            {deckSource === "new" && (
              <AppButton size="lg" fullWidth disabled={!playlistUrl} onClick={() => handleGenerate()}>
                PAKLI GENERÁLÁSA ▶
              </AppButton>
            )}
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

            {deck.report.meetsMinimum && mode === "pass_and_play" ? (
              <RosterBuilder
                players={roster}
                onAdd={(entry) => setRoster((r) => [...r, entry])}
                onRemove={(i) => setRoster((r) => r.filter((_, idx) => idx !== i))}
                onConfirm={handleCreatePassAndPlayRoom}
                confirming={creatingRoster}
              />
            ) : (
              <AppButton
                size="lg"
                fullWidth
                disabled={!deck.report.meetsMinimum || creatingRoom}
                onClick={handleCreateRoom}
              >
                {creatingRoom ? "Szoba létrehozása…" : "SZOBA LÉTREHOZÁSA ▶"}
              </AppButton>
            )}
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
