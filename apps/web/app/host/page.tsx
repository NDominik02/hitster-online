"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { ActionIconButton } from "@/components/system/ActionIconButton";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { GenerationProgress } from "@/components/game/GenerationProgress";
import { CoverageReport } from "@/components/game/CoverageReport";
import { ModeCard } from "@/components/lobby/ModeCard";
import { HelpModal } from "@/components/system/HelpModal";
import { DeckLibrary } from "@/components/lobby/DeckLibrary";
import { DeckQualityBadge } from "@/components/lobby/DeckQualityBadge";
import { DeckPreviewModal } from "@/components/lobby/DeckPreviewModal";
import {
  RosterBuilder,
  type RosterEntry,
} from "@/components/pass-and-play/RosterBuilder";
import { ensureAnonymousSession } from "@/lib/supabase/client";
import {
  generateDeck,
  createRoom,
  joinRoom,
  pollDeckUntilReady,
  spotifyRefreshToken,
  spotifyDisconnect,
  listDecks,
  listFeaturedDecks,
  deleteDeck,
  renameDeck,
  getAdminStatus,
  listAdminDecks,
  setFeaturedDeck,
  type AdminDeck,
  type AdminStatus,
} from "@/lib/supabase/functions";
import { startSpotifyLogin } from "@/lib/spotify/pkce";
import type { Deck } from "@/lib/game/types";

type DeckSource = "new" | "featured" | "library" | "curation";
type GenerationPipeline =
  | "spotify_only"
  | "accurate_spotify"
  | "verified_audio";

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
  const [helpOpen, setHelpOpen] = useState(false);

  const [phase, setPhase] = useState<"mode" | "form" | "generating" | "report">(
    "mode",
  );
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
    step: string;
    warning?: string;
  }>({
    processed: 0,
    total: 0,
    step: "fetching_playlist",
  });
  const [deck, setDeck] = useState<Deck | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // PP0 (Pass-and-play mód-választó) — US-PP1: a mód a szoba-létrehozás ELŐTT dől el,
  // menet közben nem váltható. "shared_screen" a jelenlegi (F1/F2) host+player mód.
  const [mode, setMode] = useState<"shared_screen" | "pass_and_play" | null>(
    null,
  );
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [creatingRoster, setCreatingRoster] = useState(false);

  // A token az anonim Supabase sessionhöz tartozik, de a paklik stabil
  // tulajdonosa a Spotify-fiók. Így másik eszközön is ugyanaz a könyvtár nyílik meg.
  const [spotifyStatus, setSpotifyStatus] = useState<
    "checking" | "connected" | "not_connected"
  >("checking");
  const [spotifyAccount, setSpotifyAccount] = useState<{
    spotifyUserId: string;
    displayName: string | null;
    product: string | null;
  } | null>(null);
  const [spotifyDisconnecting, setSpotifyDisconnecting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousSession();
        const account = await spotifyRefreshToken();
        if (!account.spotifyUserId)
          throw new Error("A Spotify-kapcsolatot újra kell csatlakoztatni.");
        if (!cancelled) {
          setSpotifyAccount({
            spotifyUserId: account.spotifyUserId,
            displayName: account.displayName,
            product: account.product,
          });
          setSpotifyStatus("connected");
        }
      } catch {
        if (!cancelled) {
          setSpotifyAccount(null);
          setSpotifyStatus("not_connected");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // S31 (F3, pakli-könyvtár) — a host választhat "Új pakli" (playlist URL-ből
  // generál), "Ajánlott" (tulaj által előre kiválasztott playlist-csomagok,
  // ld. lib/featuredPlaylists.ts) és "Meglévő pakli" (korábban generált
  // Spotify-fiókhoz tartozó, korábban generált) között. A
  // könyvtárból/ajánlottból választás — ha van már kész pakli rá — azonnal
  // a "report" fázisba ugrik, generálás/pollingozás nélkül.
  const [deckSource, setDeckSource] = useState<DeckSource>("new");
  const [featuredDecks, setFeaturedDecks] = useState<Deck[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [libraryDecks, setLibraryDecks] = useState<Deck[]>([]);
  const [loadedLibraryOwnerId, setLoadedLibraryOwnerId] = useState<
    string | null
  >(null);
  const [previewDeck, setPreviewDeck] = useState<Deck | null>(null);
  const [previewCanEditYear, setPreviewCanEditYear] = useState(false);
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null);
  const [adminDecks, setAdminDecks] = useState<AdminDeck[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminBusyDeckId, setAdminBusyDeckId] = useState<string | null>(null);
  const [adminPlaylistUrl, setAdminPlaylistUrl] = useState("");
  const [adminGeneratingDownloaded, setAdminGeneratingDownloaded] =
    useState(false);
  const [newDeckKind, setNewDeckKind] = useState<
    "spotify_only" | "accurate_spotify"
  >("spotify_only");
  const [activeGenerationPipeline, setActiveGenerationPipeline] =
    useState<GenerationPipeline>("spotify_only");

  useEffect(() => {
    if (spotifyStatus !== "connected") {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousSession();
        const status = await getAdminStatus();
        if (!cancelled) setAdminStatus(status);
      } catch {
        if (!cancelled) setAdminStatus(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [spotifyStatus]);

  useEffect(() => {
    if (
      deckSource !== "library" ||
      !spotifyAccount ||
      loadedLibraryOwnerId === spotifyAccount.spotifyUserId
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousSession();
        const decks = await listDecks(spotifyAccount.spotifyUserId);
        if (!cancelled) {
          setLibraryDecks(decks);
          setLoadedLibraryOwnerId(spotifyAccount.spotifyUserId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Nem sikerült betölteni a pakli-könyvtárat.",
          );
          setLoadedLibraryOwnerId(spotifyAccount.spotifyUserId);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deckSource, spotifyAccount, loadedLibraryOwnerId]);

  async function handleSelectSource(source: DeckSource) {
    if (source === "curation" && !adminStatus?.isAdmin) return;
    setDeckSource(source);
    setError(null);
    if (source === "featured" && featuredDecks.length === 0) {
      setFeaturedLoading(true);
      try {
        await ensureAnonymousSession();
        setFeaturedDecks(await listFeaturedDecks());
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Nem sikerult betolteni az ajanlott paklikat.",
        );
      } finally {
        setFeaturedLoading(false);
      }
    }
    if (source === "curation") {
      await refreshAdminDecks();
    }
  }

  function handleSelectLibraryDeck(selected: Deck) {
    setDeck(selected);
    setPhase("report");
  }

  function handleSelectPreviewDeck(selected: Deck) {
    setPreviewDeck(null);
    setDeck(selected);
    setPhase("report");
  }

  async function refreshLibraryDecks() {
    if (!spotifyAccount) {
      setLibraryDecks([]);
      return [];
    }
    const decks = await listDecks(spotifyAccount.spotifyUserId);
    setLibraryDecks(decks);
    setLoadedLibraryOwnerId(spotifyAccount.spotifyUserId);
    return decks;
  }

  async function refreshAdminDecks() {
    if (!adminStatus?.isAdmin) {
      setAdminDecks([]);
      return [];
    }
    setAdminLoading(true);
    try {
      const decks = await listAdminDecks();
      setAdminDecks(decks);
      return decks;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nem sikerült betölteni a kurátori paklikat.",
      );
      return [];
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleRenameLibraryDeck(selected: Deck) {
    if (!spotifyAccount || renamingDeckId) return;
    const nextName = window.prompt("Új paklinév", selected.name)?.trim();
    if (!nextName || nextName === selected.name) return;

    setRenamingDeckId(selected.id);
    setError(null);
    try {
      const result = await renameDeck(selected.id, nextName);
      setLibraryDecks((current) =>
        current.map((deckItem) =>
          deckItem.id === selected.id
            ? { ...deckItem, name: result.name }
            : deckItem,
        ),
      );
      if (deck?.id === selected.id) {
        setDeck((current) =>
          current ? { ...current, name: result.name } : current,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nem sikerült átnevezni a paklit.",
      );
    } finally {
      setRenamingDeckId(null);
    }
  }

  async function handleDeleteLibraryDeck(selected: Deck) {
    if (!spotifyAccount || deletingDeckId) return;
    const confirmed = window.confirm(
      `Törlöd ezt a paklit?\n\n${selected.name}`,
    );
    if (!confirmed) return;

    setDeletingDeckId(selected.id);
    setError(null);
    try {
      await deleteDeck(selected.id);
      await refreshLibraryDecks();
      if (deck?.id === selected.id) {
        setDeck(null);
        setPhase("form");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nem sikerült törölni a paklit.",
      );
    } finally {
      setDeletingDeckId(null);
    }
  }

  function adminDeckPlaylistUrls(selected: AdminDeck): string[] {
    return (selected.sourcePlaylistUrl ?? "")
      .split(/\s+/)
      .map((url) => url.trim())
      .filter((url) =>
        /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/.test(url),
      );
  }

  async function handleCreateReliableDeck(selected: AdminDeck) {
    if (adminBusyDeckId || adminGeneratingDownloaded) return;
    const urls = adminDeckPlaylistUrls(selected);
    if (urls.length === 0) {
      setError("Ehhez a paklihoz nincs újragenerálható Spotify playlist link.");
      return;
    }
    const confirmed = window.confirm(
      `Megbízható verziót készítesz ebből a pakliból?\n\n${selected.name}\n\nEz külön, pontosabb évszámos másolatot generál preview hangfeltöltés nélkül.`,
    );
    if (!confirmed) return;

    setAdminBusyDeckId(selected.id);
    setError(null);
    try {
      const { deckId } = await generateDeck(urls[0], {
        playlistUrls: urls.length > 1 ? urls : undefined,
        sourceKey: `reliable-${selected.id}`,
        deckName: selected.name,
        audioPipeline: "accurate_spotify",
        curationSourceDeckId: selected.id,
      });
      const prepared = await pollDeckUntilReady(deckId);
      if (prepared.status === "failed") {
        throw new Error(
          prepared.progress.failReason ||
            "Nem sikerült elkészíteni a megbízható verziót.",
        );
      }
      await refreshAdminDecks();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nem sikerült elkészíteni a megbízható verziót.",
      );
    } finally {
      setAdminBusyDeckId(null);
    }
  }

  async function handleGenerateDownloadedDeck() {
    if (adminBusyDeckId || adminGeneratingDownloaded) return;
    if (!adminPlaylistUrlsLookValid) {
      setError(
        "Érvénytelen Spotify playlist link. Ellenőrizd, és próbáld újra.",
      );
      return;
    }

    setAdminGeneratingDownloaded(true);
    try {
      await handleGenerate(adminPlaylistUrls[0], {
        playlistUrls:
          adminPlaylistUrls.length > 1 ? adminPlaylistUrls : undefined,
        audioPipeline: "verified_audio",
      });
      await refreshAdminDecks();
    } finally {
      setAdminGeneratingDownloaded(false);
    }
  }

  async function handleSetFeaturedDeck(selected: AdminDeck, featured: boolean) {
    if (adminBusyDeckId || adminGeneratingDownloaded) return;
    const confirmed = window.confirm(
      featured
        ? `Megjeleníted az Ajánlott paklik között?\n\n${selected.name}`
        : `Elrejted az Ajánlott paklik közül?\n\n${selected.name}`,
    );
    if (!confirmed) return;

    setAdminBusyDeckId(selected.id);
    setError(null);
    try {
      await setFeaturedDeck(selected.id, featured);
      await Promise.all([
        refreshAdminDecks(),
        listFeaturedDecks().then(setFeaturedDecks),
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nem sikerült menteni az ajánlott állapotot.",
      );
    } finally {
      setAdminBusyDeckId(null);
    }
  }

  function handleSelectFeatured(pl: Deck) {
    setDeck(pl);
    setPhase("report");
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

  async function handleDisconnectSpotify() {
    if (spotifyDisconnecting) return;
    setSpotifyDisconnecting(true);
    setError(null);
    try {
      await spotifyDisconnect();
      setSpotifyAccount(null);
      setSpotifyStatus("not_connected");
      setLibraryDecks([]);
      setLoadedLibraryOwnerId(null);
      setAdminStatus(null);
      setAdminDecks([]);
      if (deckSource === "library" || deckSource === "curation") setDeck(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nem sikerült kijelentkezni a Spotify-fiókból.",
      );
    } finally {
      setSpotifyDisconnecting(false);
    }
  }

  const playlistUrls = playlistUrl
    .split(/\r?\n|,/)
    .map((url) => url.trim())
    .filter(Boolean);
  const playlistUrlsLookValid =
    playlistUrls.length > 0 &&
    playlistUrls.every((url) =>
      /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/.test(url),
    );
  const adminPlaylistUrls = adminPlaylistUrl
    .split(/\r?\n|,/)
    .map((url) => url.trim())
    .filter(Boolean);
  const adminPlaylistUrlsLookValid =
    adminPlaylistUrls.length > 0 &&
    adminPlaylistUrls.every((url) =>
      /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/.test(url),
    );

  /**
   * `urlOverride` — az "Ajánlott playlistek" gyorsválasztó adja át explicit
   * paraméterként (ld. handleSelectFeatured), mert a setPlaylistUrl(...) állapot-
   * frissítés aszinkron/batch-elt, tehát egy közvetlenül utána hívott
   * handleGenerate() még a RÉGI playlistUrl-t olvasná a state-ből.
   */
  async function handleGenerate(
    urlOverride?: string,
    options?: {
      playlistUrls?: string[];
      sourceKey?: string;
      deckName?: string;
      audioPipeline?: GenerationPipeline;
      curationSourceDeckId?: string;
    },
  ) {
    const url = (urlOverride ?? playlistUrl).trim();
    const urls = options?.playlistUrls ?? (urlOverride ? [url] : playlistUrls);
    if (!urlOverride && !playlistUrlsLookValid) {
      setError(
        "Érvénytelen Spotify playlist link. Ellenőrizd, és próbáld újra.",
      );
      return;
    }
    if (!urlOverride && spotifyStatus !== "connected") {
      setError(
        "Saját pakli létrehozásához csatlakoztass Spotify Premium fiókot. Az ajánlott paklik továbbra is mennek bejelentkezés nélkül.",
      );
      return;
    }
    if (!urlOverride && spotifyAccount?.product !== "premium") {
      setError(
        "Saját pakli létrehozásához Spotify Premium kell, mert ezek a paklik Storage-feltöltés nélkül, Spotify-ról játszanak.",
      );
      return;
    }
    setError(null);
    setPhase("generating");
    setProgress({ processed: 0, total: 0, step: "fetching_playlist" });

    try {
      await ensureAnonymousSession();
      const requestedAudioPipeline =
        options?.audioPipeline ??
        (!urlOverride && newDeckKind === "accurate_spotify"
          ? "accurate_spotify"
          : "spotify_only");
      setActiveGenerationPipeline(requestedAudioPipeline);

      // A HTTP hívás azonnal visszatér a deckId-vel, a feldolgozás a szerveren fut tovább.
      const { deckId } = await generateDeck(urls[0] ?? url, {
        ...options,
        playlistUrls: urls.length > 1 ? urls : options?.playlistUrls,
        audioPipeline: requestedAudioPipeline,
      });

      // Pollingozzuk a decks táblát ~2 mp-enként, amíg ready/failed nem lesz (BACKEND-NOTES 4.).
      const result = await pollDeckUntilReady(deckId, (partial) => {
        setProgress({
          processed: partial.progress.processed,
          total: partial.progress.total,
          step: partial.progress.step,
          warning: partial.progress.warning,
        });
      });

      if (result.status === "failed") {
        const reason = result.progress.failReason;
        throw new Error(
          reason === "playlist_not_public"
            ? "Csak nyilvános playlist használható. Tedd a playlistet nyilvánossá, majd próbáld újra."
            : "Nem sikerült a pakli generálása. Ellenőrizd, hogy a playlist nyilvános-e, és próbáld újra.",
        );
      }

      setDeck(result);
      setLibraryDecks([]);
      setLoadedLibraryOwnerId(null);
      setPhase("report");
    } catch (err) {
      setPhase("form");
      setError(
        err instanceof Error
          ? err.message
          : "Ismeretlen hiba történt a pakli generálása közben.",
      );
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
        spotifyPlaybackMode:
          spotifyStatus === "connected" ? "premium" : "preview",
      });
      router.push(`/host/${code}`);
    } catch (err) {
      setCreatingRoom(false);
      setError(
        err instanceof Error
          ? err.message
          : "Nem sikerült létrehozni a szobát.",
      );
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
        spotifyPlaybackMode:
          spotifyStatus === "connected" ? "premium" : "preview",
      });
      // Sorban, nem párhuzamosan — a szín/seat-ütközések elkerülése végett.
      for (const entry of roster) {
        await joinRoom(code, entry.name, entry.color);
      }
      router.push(`/host/${code}/solo`);
    } catch (err) {
      setCreatingRoster(false);
      setError(
        err instanceof Error
          ? err.message
          : "Nem sikerült elindítani a partit.",
      );
    }
  }

  const featuredDeckList: Deck[] = featuredDecks;

  return (
    <div className="flex flex-col flex-1 items-center px-6 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span aria-hidden>🎵</span> HITSTER ONLINE
          </h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-text-muted text-sm hover:text-text"
              onClick={() => router.push("/")}
            >
              Főmenü
            </button>
            <button
              type="button"
              className="text-text-muted text-sm hover:text-text"
              onClick={() => setHelpOpen(true)}
            >
              ? Súgó
            </button>
          </div>
        </header>

        {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
        {previewDeck && (
          <DeckPreviewModal
            key={previewDeck.id}
            deck={previewDeck}
            canEditYear={previewCanEditYear}
            onClose={() => {
              setPreviewDeck(null);
              setPreviewCanEditYear(false);
            }}
            onSelect={handleSelectPreviewDeck}
          />
        )}

        {phase === "mode" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center mb-2">
              Hogyan játszotok?
            </h2>
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
                  ...(adminStatus?.isAdmin
                    ? [{ value: "curation" as const, label: "Admin" }]
                    : []),
                ]}
              />

              {deckSource === "new" && (
                <div className="mt-3">
                  <label
                    className="block mb-1 font-medium"
                    htmlFor="playlist-url"
                  >
                    Spotify playlist link(ek)
                  </label>
                  <textarea
                    id="playlist-url"
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    placeholder={
                      "https://open.spotify.com/playlist/...\nhttps://open.spotify.com/playlist/..."
                    }
                    rows={playlistUrl.includes("\n") ? 4 : 2}
                    className="w-full min-h-24 rounded-[var(--radius-button)] bg-surface-2 border-2 border-border focus-visible:border-accent px-4 py-3 text-base resize-y"
                    aria-invalid={Boolean(error)}
                    aria-describedby="playlist-url-help"
                  />
                  <p
                    id="playlist-url-help"
                    className="text-sm text-text-muted mt-1"
                  >
                    › Egy vagy több Spotify playlist link, soronként külön. Több
                    linkből egy közös, deduplikált pakli készül.
                  </p>
                  <div className="mt-4">
                    <SegmentedControl
                      label="Generálás módja"
                      ariaLabel="Generálás módja"
                      value={newDeckKind}
                      onChange={setNewDeckKind}
                      options={[
                        { value: "spotify_only", label: "Spotify-only" },
                        {
                          value: "accurate_spotify",
                          label: "Pontosabb évszámok",
                        },
                      ]}
                    />
                    <p className="mt-1 text-sm text-text-muted">
                      A pontosabb évszámos mód tovább tart, de több forrásból
                      dolgozik, ezért jobb eredményeket ad.
                    </p>
                  </div>
                </div>
              )}

              {deckSource === "featured" && (
                <div className="mt-3 space-y-2">
                  {featuredLoading ? (
                    <p className="text-text-muted text-sm">
                      Ajánlott paklik betöltése...
                    </p>
                  ) : featuredDeckList.length === 0 ? (
                    <p className="text-text-muted text-sm">
                      Még nincs ajánlott pakli beállítva.
                    </p>
                  ) : (
                    featuredDeckList.map((pl) => {
                      const key = pl.id;
                      return (
                        <div
                          key={key}
                          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{pl.name}</p>
                            <p className="mt-0.5 text-xs text-text-muted">
                              {pl.usableCount} kártya
                              {pl.totalTracks !== pl.usableCount
                                ? ` / ${pl.totalTracks} szám`
                                : ""}{" "}
                              - {pl.coveragePct.toFixed(0)}% lefedettség{" "}
                              <DeckQualityBadge
                                audioPipeline={pl.report.audioPipeline}
                                featured={pl.isFeatured}
                                hasDownloadedPreviews={pl.hasDownloadedPreviews}
                              />
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <ActionIconButton
                              icon="eye"
                              label="Megnézem"
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setPreviewDeck(pl);
                                setPreviewCanEditYear(false);
                              }}
                            />
                            <AppButton
                              size="sm"
                              variant="secondary"
                              onClick={() => handleSelectFeatured(pl)}
                            >
                              Kiválasztom
                            </AppButton>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {deckSource === "library" && (
                <div className="mt-3">
                  <DeckLibrary
                    decks={libraryDecks}
                    loading={
                      spotifyStatus === "checking" ||
                      (spotifyAccount !== null &&
                        loadedLibraryOwnerId !== spotifyAccount.spotifyUserId)
                    }
                    connected={spotifyStatus === "connected"}
                    onConnect={handleConnectSpotify}
                    onSelect={handleSelectLibraryDeck}
                    onPreview={(selected) => {
                      setPreviewDeck(selected);
                      setPreviewCanEditYear(true);
                    }}
                    onRename={handleRenameLibraryDeck}
                    onDelete={handleDeleteLibraryDeck}
                    renamingDeckId={renamingDeckId}
                    deletingDeckId={deletingDeckId}
                  />
                </div>
              )}

              {deckSource === "curation" && (
                <div className="mt-3 space-y-2">
                  {adminLoading ? (
                    <p className="text-text-muted text-sm">
                      Admin paklik betöltése...
                    </p>
                  ) : (
                    <>
                      <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3">
                        <label
                          className="block mb-1 font-medium"
                          htmlFor="admin-playlist-url"
                        >
                          Letöltött verzió playlist link(ek)
                        </label>
                        <textarea
                          id="admin-playlist-url"
                          value={adminPlaylistUrl}
                          onChange={(e) => setAdminPlaylistUrl(e.target.value)}
                          placeholder={
                            "https://open.spotify.com/playlist/...\nhttps://open.spotify.com/playlist/..."
                          }
                          rows={adminPlaylistUrl.includes("\n") ? 4 : 2}
                          className="w-full min-h-24 rounded-[var(--radius-button)] bg-surface border-2 border-border focus-visible:border-accent px-4 py-3 text-base resize-y"
                          aria-invalid={Boolean(error)}
                        />
                        <div className="mt-3 flex justify-end">
                          <AppButton
                            size="sm"
                            variant="secondary"
                            disabled={
                              !adminPlaylistUrlsLookValid ||
                              adminGeneratingDownloaded ||
                              Boolean(adminBusyDeckId)
                            }
                            onClick={handleGenerateDownloadedDeck}
                          >
                            {adminGeneratingDownloaded
                              ? "Letöltött verzió készül..."
                              : "Letöltött verzió készítése"}
                          </AppButton>
                        </div>
                      </div>
                      {adminDecks.length === 0 ? (
                        <p className="text-text-muted text-sm">
                          Nincs megjeleníthető pakli.
                        </p>
                      ) : (
                        adminDecks.map((adminDeck) => {
                          const busy = adminBusyDeckId === adminDeck.id;
                          const canPrepare =
                            adminDeck.status === "ready" &&
                            adminDeck.audioPipeline === "spotify_only";
                          const canPublish =
                            adminDeck.status === "ready" &&
                            !adminDeck.isFeatured &&
                            adminDeck.audioPipeline !== "spotify_only";

                          return (
                            <div
                              key={adminDeck.id}
                              className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold">
                                  {adminDeck.name}
                                </p>
                                <p className="mt-0.5 text-xs text-text-muted">
                                  {adminDeck.usableCount} kártya
                                  {adminDeck.totalTracks !==
                                  adminDeck.usableCount
                                    ? ` / ${adminDeck.totalTracks} szám`
                                    : ""}{" "}
                                  - {adminDeck.coveragePct.toFixed(0)}%{" "}
                                  <DeckQualityBadge
                                    audioPipeline={adminDeck.audioPipeline}
                                    featured={adminDeck.isFeatured}
                                    hasDownloadedPreviews={
                                      adminDeck.hasDownloadedPreviews
                                    }
                                  />
                                  {adminDeck.status !== "ready"
                                    ? ` - ${adminDeck.status}`
                                    : ""}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                {canPrepare && (
                                  <AppButton
                                    size="sm"
                                    variant="secondary"
                                    disabled={
                                      busy ||
                                      adminGeneratingDownloaded ||
                                      Boolean(adminBusyDeckId)
                                    }
                                    title="Külön, pontosabb évszámos másolatot készít preview hangfeltöltés nélkül."
                                    onClick={() =>
                                      handleCreateReliableDeck(adminDeck)
                                    }
                                  >
                                    {busy
                                      ? "Verzió készül..."
                                      : "Megbízható verzió készítése"}
                                  </AppButton>
                                )}
                                {canPublish && (
                                  <AppButton
                                    size="sm"
                                    variant="secondary"
                                    disabled={
                                      busy ||
                                      adminGeneratingDownloaded ||
                                      Boolean(adminBusyDeckId)
                                    }
                                    title="Megjeleníti ezt a kész másolatot az Ajánlott paklik között."
                                    onClick={() =>
                                      handleSetFeaturedDeck(adminDeck, true)
                                    }
                                  >
                                    Ajánlottként megjelenít
                                  </AppButton>
                                )}
                                {adminDeck.isFeatured && (
                                  <AppButton
                                    size="sm"
                                    variant="danger"
                                    disabled={
                                      busy ||
                                      adminGeneratingDownloaded ||
                                      Boolean(adminBusyDeckId)
                                    }
                                    title="Leveszi ezt a paklit az Ajánlott listából."
                                    onClick={() =>
                                      handleSetFeaturedDeck(adminDeck, false)
                                    }
                                  >
                                    Elrejtés ajánlottból
                                  </AppButton>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </>
                  )}
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
              <div
                className={
                  mode === "pass_and_play"
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              >
                <SegmentedControl
                  ariaLabel="Lopás engedélyezése"
                  value={
                    mode === "pass_and_play"
                      ? "off"
                      : stealEnabled
                        ? "on"
                        : "off"
                  }
                  onChange={(v) => setStealEnabled(v === "on")}
                  options={[
                    { value: "on", label: "Be" },
                    { value: "off", label: "Ki" },
                  ]}
                />
              </div>
            </div>

            {/* A Spotify-kapcsolat ad Premium lejátszást és stabil, eszközök között
                megosztott tulajdonost a privát paklikönyvtárhoz. */}
            <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-sm">🎧 Spotify-fiók</p>
                <p className="text-text-muted text-xs mt-0.5">
                  {spotifyStatus === "connected"
                    ? `${spotifyAccount?.displayName || "Spotify-fiók"} csatlakoztatva${spotifyAccount?.product === "premium" ? " (Premium)" : ""}. A mentett paklik ehhez a fiókhoz tartoznak.`
                    : spotifyStatus === "checking"
                      ? "Spotify-kapcsolat ellenőrzése..."
                      : "Csatlakozás nélkül a mentett paklik listája üres; az ajánlott paklik továbbra is elérhetők."}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <AppButton
                  size="sm"
                  variant="secondary"
                  disabled={
                    spotifyStatus === "checking" || spotifyDisconnecting
                  }
                  onClick={handleConnectSpotify}
                >
                  {spotifyStatus === "connected"
                    ? "Fiókváltás"
                    : "Csatlakoztatás"}
                </AppButton>
                {spotifyStatus === "connected" && (
                  <AppButton
                    size="sm"
                    variant="secondary"
                    disabled={spotifyDisconnecting}
                    onClick={handleDisconnectSpotify}
                  >
                    {spotifyDisconnecting
                      ? "Kijelentkezés..."
                      : "Kijelentkezés"}
                  </AppButton>
                )}
              </div>
            </div>

            {deckSource === "new" && (
              <AppButton
                size="lg"
                fullWidth
                disabled={!playlistUrl || !playlistUrlsLookValid}
                onClick={() => handleGenerate()}
              >
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
              total={progress.total}
              currentStep={stepLabel(progress.step)}
            />
            <p className="text-text-muted text-sm">
              {activeGenerationPipeline === "verified_audio"
                ? "Letöltött verzió készül, preview hangok feltöltésével."
                : activeGenerationPipeline === "accurate_spotify"
                  ? "Pontosabb évszámos pakli készül, preview hangfeltöltés nélkül."
                  : "Spotify-only pakli készül, ezért nincs Supabase hangfájl-feltöltés."}
            </p>
            {progress.warning && (
              <p className="rounded-[var(--radius-card)] border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
                {progress.warning}
              </p>
            )}
          </div>
        )}

        {phase === "report" && deck && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">PAKLI ELŐKÉSZÍTÉSE</h2>
            <CoverageReport
              deckId={deck.id}
              usable={deck.report.usable}
              total={deck.report.total}
              pct={deck.report.coveragePct}
              excluded={deck.report.excluded}
              meetsMinimum={deck.report.meetsMinimum}
              importWarning={deck.report.playlistImportWarning}
              spotifyOnlyCount={deck.report.spotifyOnlyCount}
              onRescued={(result) =>
                setDeck((d) =>
                  d
                    ? {
                        ...d,
                        usableCount: result.usableCount,
                        coveragePct: result.coveragePct,
                        report: {
                          ...d.report,
                          usable: result.usableCount,
                          coveragePct: result.coveragePct,
                          meetsMinimum: result.meetsMinimum,
                          spotifyOnlyCount:
                            result.spotifyOnlyCount ??
                            d.report.spotifyOnlyCount,
                          excluded: result.excluded,
                        },
                      }
                    : d,
                )
              }
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
                onRemove={(i) =>
                  setRoster((r) => r.filter((_, idx) => idx !== i))
                }
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
              <AppButton
                variant="secondary"
                fullWidth
                onClick={() => setPhase("form")}
              >
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
    case "building_spotify_only_cards":
      return "Spotify-kártyák előkészítése…";
    case "uploading_audio":
      return "Hangfájlok feltöltése…";
    case "done":
      return "Kész.";
    default:
      return "Feldolgozás…";
  }
}
