"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { GenerationProgress } from "@/components/game/GenerationProgress";
import { CoverageReport } from "@/components/game/CoverageReport";
import { ensureAnonymousSession } from "@/lib/supabase/client";
import { generateDeck, createRoom } from "@/lib/supabase/functions";
import type { Deck } from "@/lib/game/types";
import type { DeckGenerationProgress } from "@/lib/supabase/adapters";

/**
 * H1 — Létrehozás (host): playlist forrás + beállítások (DESIGN H1 wireframe).
 * H2 — Pakli-előkészítés / riport ugyanezen az oldalon, generálás közben (DESIGN H2 wireframe).
 *
 * generate_deck szinkron fut (BACKEND-NOTES 4.) — a HTTP kérés a generálás végéig nyitva marad.
 * Eközben a decks.report mezőt 2 mp-enként pollingozzuk a progress-bar frissítéséhez; a deckId-t
 * csak a generálás VÉGE után ismerjük meg a generateDeck() válaszából, ezért a polling addig a
 * "legutóbb generált saját deck" feltételezéssel nem működne — helyette a generateDeck() promise-t
 * és egy külön "becsült progress" pollingot futtatunk párhuzamosan: amint a válasz megjön, leállunk.
 */
export default function HostCreatePage() {
  const router = useRouter();
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [winTarget, setWinTarget] = useState(10);
  const [timeLimitSec, setTimeLimitSec] = useState(90);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<"form" | "generating" | "report">("form");
  const [progress, setProgress] = useState<DeckGenerationProgress>({
    processed: 0,
    total: 0,
    step: "fetching_playlist",
  });
  const [deck, setDeck] = useState<Deck | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

      // A generateDeck() a generálás végéig nyitva tartja a kérést (BACKEND-NOTES 4.).
      // A deckId csak a válaszban derül ki, ezért a köztes progresst egyelőre csak a
      // lépés-becsléssel jelezzük; ha a Backend a jövőben a deckId-t korábban visszaadná
      // (pl. egy külön "started" eseményben), itt lehetne rákötni a valódi pollDeckProgress-t.
      const resultPromise = generateDeck(playlistUrl.trim());

      // Amíg a fenti fut, egy egyszerű "step" animáció jelzi, hogy nem fagyott le (DESIGN H2:
      // "a progress soha nem tűnhet fagyottnak"). Valós számokat a válasz megérkezése után mutatunk.
      const steps: DeckGenerationProgress["step"][] = [
        "fetching_playlist",
        "resolving_years",
        "uploading_audio",
      ];
      let stepIndex = 0;
      pollRef.current = setInterval(() => {
        stepIndex = Math.min(stepIndex + 1, steps.length - 1);
        setProgress((p) => ({ ...p, step: steps[stepIndex] }));
      }, 4000);

      const result = await resultPromise;

      if (pollRef.current) clearInterval(pollRef.current);
      setProgress({ processed: result.totalTracks, total: result.totalTracks, step: "done" });
      setDeck(result);
      setPhase("report");
    } catch (err) {
      if (pollRef.current) clearInterval(pollRef.current);
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

            {/* ⟨F2⟩/⟨F3⟩ hely fenntartva — steal + Premium, F1-ben rejtve (DESIGN H1 wireframe) */}

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
