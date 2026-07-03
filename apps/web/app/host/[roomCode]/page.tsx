"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { RoomCodeBadge } from "@/components/lobby/RoomCodeBadge";
import { QRCodePanel } from "@/components/lobby/QRCodePanel";
import { PlayerList } from "@/components/lobby/PlayerList";
import { MysteryCard } from "@/components/game/MysteryCard";
import { AudioProgressBar } from "@/components/game/AudioProgressBar";
import { AudioUnlockOverlay } from "@/components/game/AudioUnlockOverlay";
import { PlayerTimelineRow } from "@/components/game/PlayerTimelineRow";
import { RevealCard } from "@/components/game/RevealCard";
import { OutcomeBanner } from "@/components/game/OutcomeBanner";
import { PlayerBadge } from "@/components/lobby/PlayerBadge";
import { TimelineCard } from "@/components/game/TimelineCard";
import { ConnectionOverlay } from "@/components/system/ConnectionOverlay";
import { ensureAnonymousSession } from "@/lib/supabase/client";
import {
  reconnect,
  startGame,
  drawCard,
  resolveRound,
  nextTurn,
  fetchPlayers,
  fetchRoundPublic,
  getTimeline,
} from "@/lib/supabase/functions";
import { adaptRoundPublic } from "@/lib/supabase/adapters";
import { useRoomChannel } from "@/lib/game/useRoomChannel";
import type { Player, RoundPublic, TimelineCardPublic } from "@/lib/game/types";

/**
 * Host shell — a `rooms.status` + `round_public.phase`-ből derivált fázis alapján
 * rendereli H3..H6-ot (ARCHITECTURE 5.1/5.3). A H1/H2 (playlist + generálás) a
 * app/host/page.tsx-en zajlik előbb; ide már meglévő, kész szobával érkezünk.
 *
 * A host az EGYETLEN kliens, aki draw_card / resolve_round-ot hívhat (D7 anti-leak,
 * BACKEND-NOTES 7.) — a player kliens ezeket sose hívja.
 */
export default function HostRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode;

  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<"lobby" | "playing" | "paused" | "finished">("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<RoundPublic | null>(null);
  const [timelines, setTimelines] = useState<Record<string, TimelineCardPublic[]>>({});
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLocked, setAudioLocked] = useState(false);
  const [dragGhostIndex, setDragGhostIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // A QR-kódhoz a valódi, kliensről elérhető origin kell — window.location.origin
  // félrevezető, ha a host localhost-on nyitja meg (a telefonon scannelve a
  // telefon SAJÁT localhost-jára mutatna). Az /api/origin a request Host
  // fejlécéből adja vissza, amin a böngésző ténylegesen csatlakozott (pl. a
  // gép LAN IP-je), production mögött pedig a valós domaint.
  const [joinOrigin, setJoinOrigin] = useState<string | null>(null);
  const [originFetchFailed, setOriginFetchFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/origin")
      .then((res) => res.json())
      .then((data: { origin?: string }) => {
        if (!cancelled && data.origin) setJoinOrigin(data.origin);
      })
      .catch(() => {
        if (!cancelled) setOriginFetchFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const effectiveOrigin = joinOrigin ?? fallbackOrigin;
  const isLocalOrigin = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(effectiveOrigin);

  const refreshTimelines = useCallback(async (rid: string) => {
    const cards = await getTimeline(rid);
    const grouped: Record<string, TimelineCardPublic[]> = {};
    for (const c of cards) {
      (grouped[c.playerId] ??= []).push(c);
    }
    setTimelines(grouped);
  }, []);

  const refreshRound = useCallback(async (rid: string) => {
    const row = await fetchRoundPublic(rid);
    setRound(adaptRoundPublic(row));
  }, []);

  const refreshPlayers = useCallback(async (rid: string) => {
    setPlayers(await fetchPlayers(rid));
  }, []);

  // Kezdeti betöltés: reconnect a szobakóddal, majd players + timeline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousSession();
        const res = await reconnect(roomCode);
        if (cancelled) return;
        setRoomId(res.roomId);
        setRoomStatus(res.status as typeof roomStatus);
        await refreshPlayers(res.roomId);
        if (res.currentRoundId) await refreshRound(res.currentRoundId);
        await refreshTimelines(res.roomId);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Nem sikerült betölteni a szobát.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const { broadcastEvent } = useRoomChannel({
    roomId,
    presenceKey: "host",
    presenceMeta: { role: "host" },
    onEvent: async (event, payload) => {
      if (!roomId) return;
      if (event === "player_joined") {
        await refreshPlayers(roomId);
      } else if (event === "game_started" || event === "round_started") {
        setRoomStatus("playing");
        const rid = (payload as { roundId?: string })?.roundId;
        if (rid) await refreshRound(rid);
        else if (round) await refreshRound(round.id);
        setDragGhostIndex(null);
      } else if (event === "card_placed") {
        // Defensive: elsődlegesen a broadcast payload roundId-jét használjuk, ne a
        // closure-ből olvasott `round` state-et (lásd useRoomChannel stale closure fix).
        const rid = (payload as { roundId?: string })?.roundId ?? round?.id;
        if (rid) await refreshRound(rid);
      } else if (event === "round_revealed") {
        const rid = (payload as { roundId?: string })?.roundId ?? round?.id;
        if (rid) await refreshRound(rid);
        await refreshTimelines(roomId);
      } else if (event === "turn_advanced") {
        const rid = (payload as { roundId?: string })?.roundId;
        if (rid) await refreshRound(rid);
      } else if (event === "game_finished") {
        setRoomStatus("finished");
        const ids = (payload as { winnerPlayerIds?: string[] })?.winnerPlayerIds ?? [];
        setWinnerPlayerIds(ids);
        await refreshTimelines(roomId);
      }
    },
    onDragUpdate: (payload) => {
      if (round && payload.playerId === round.activePlayerId) {
        setDragGhostIndex(payload.slotIndex);
      }
    },
  });

  async function handleStart() {
    if (!roomId) return;
    try {
      const res = await startGame(roomId);
      setRoomStatus("playing");
      await refreshRound(res.roundId);
      await broadcastEvent("game_started", { roundId: res.roundId });
      await beginRound(res.roundId);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nem sikerült elindítani a játékot.");
    }
  }

  async function beginRound(roundId: string) {
    if (!roomId) return;
    try {
      const draw = await drawCard(roomId);
      setAudioUrl(draw.audioUrl);
      await refreshRound(draw.roundId);
      await broadcastEvent("round_started", { roundId: draw.roundId, activePlayerId: draw.activePlayerId });
    } catch (err) {
      // draw_card 409-et ad, ha már húzva van erre a körre — ilyenkor csak frissítjük az állapotot.
      await refreshRound(roundId);
      console.warn("[draw_card]", err);
    }
  }

  async function handleResolve() {
    if (!round) return;
    try {
      await resolveRound(round.id);
      await refreshRound(round.id);
      await refreshTimelines(roomId!);
      await broadcastEvent("round_revealed", { roundId: round.id });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nem sikerült kiértékelni a kört.");
    }
  }

  async function handleNextTurn() {
    if (!roomId) return;
    try {
      const res = await nextTurn(roomId);
      if (res.next === "finished") {
        setRoomStatus("finished");
        setWinnerPlayerIds(res.winnerPlayerIds);
        await refreshTimelines(roomId);
        await broadcastEvent("game_finished", { winnerPlayerIds: res.winnerPlayerIds });
      } else {
        await broadcastEvent("turn_advanced", { roundId: res.roundId });
        setAudioUrl(null);
        setDragGhostIndex(null);
        await beginRound(res.roundId);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nem sikerült léptetni a kört.");
    }
  }

  // Szerver-állapot lekérdezése és összevetése a helyi UI-állapottal — ha a szerver már
  // előrébb jár (pl. a pg_cron safety net már lezárta a kört, BACKEND-NOTES 9.), csak
  // frissítjük a helyi state-et, MINT HA a round_revealed broadcast megjött volna. Ez a
  // host sosem hívja emiatt feleslegesen a resolve_round-ot — az optimista zár miatt
  // ártalmatlan lenne, de a cél itt kifejezetten a DETEKTÁLÁS, nem az újra-lezárás.
  const checkServerRoundState = useCallback(
    async (roundId: string) => {
      try {
        const row = await fetchRoundPublic(roundId);
        const serverRound = adaptRoundPublic(row);
        if (!serverRound) return;
        if (
          (serverRound.phase === "reveal" || serverRound.phase === "done") &&
          round?.phase !== "reveal" &&
          round?.phase !== "done"
        ) {
          // A szerver (host-hívás VAGY a pg_cron auto_resolve_expired_rounds safety net,
          // BACKEND-NOTES 9.) már lezárta a kört, de a mi UI-unk még a régi fázisnál áll —
          // pl. a broadcast lemaradt, mert a tab háttérben volt. Frissítsük a state-et,
          // mintha a round_revealed broadcast megérkezett volna (NE hívjuk a resolve_round-ot).
          await refreshRound(roundId);
          if (roomId) await refreshTimelines(roomId);
        }
      } catch (err) {
        console.warn("[host round-state check]", err);
      }
    },
    [round?.phase, roomId, refreshRound, refreshTimelines]
  );

  // Deadline-lejárat figyelése: amikor letelik, a host hívja a resolve_round-ot (D6, A2).
  //
  // MEGBÍZHATÓSÁGI JAVÍTÁS (2026-07-02 hotfix): háttérbe kerülő tab-okban a böngésző
  // energiatakarékossági szabályai miatt a setTimeout drasztikusan késhet/throttle-ölődhet
  // (Chrome dokumentált viselkedés), így ha a host laptopja nincs fókuszban (pl. a tulaj a
  // telefonján nézte a visszaszámlálót), a resolve_round hívás simán soha nem fut le a régi
  // időzítővel — a player véglegesen "Lejárt az idő!" állapotban ragad, mert a
  // round_revealed broadcast sosem érkezik meg.
  //
  // Megoldás: a setTimeout MELLETT egy `visibilitychange` listener is figyeli, amikor a tab
  // visszakerül előtérbe — ilyenkor azonnal újra-ellenőrizzük, hogy a deadline időközben nem
  // járt-e már le (a régi timer pontossága ekkor már nem megbízható), és ha igen, azonnal
  // hívjuk a resolve_round-ot ahelyett, hogy megvárnánk a (esetleg soha le nem futó) régi
  // setTimeout-ot. Ez tisztán UX-jellegű robusztusság — az A2 döntést nem töri: a
  // resolve_round Edge Function maga is ellenőrzi szerveroldalon, hogy a deadline tényleg
  // lejárt-e, tehát a kliensoldali hívás időzítése nem biztonsági kérdés.
  //
  // PG_CRON SAFETY NET FALLBACK (2026-07-02, BACKEND-NOTES 9.4): a fenti visibilitychange
  // logika a HELYI (kliensoldali) deadline-hoz méri az időt, és feltételezi, hogy a hostnak
  // magának kell lezárnia a kört. Azóta viszont a pg_cron `auto_resolve_expired_rounds` is
  // lezárhatja a kört a host tudta nélkül (pl. amíg a tab háttérben volt, ÉS a
  // `round_revealed` broadcast is lemaradt — Realtime nem garantál üzenet-perzisztenciát
  // háttérben lévő tabra). Emiatt a visibilitychange handler most a helyi resolve-próba
  // ELŐTT megkérdezi a szervert (checkServerRoundState) — ha a szerver már reveal/done
  // fázisban van, csak frissítünk, NEM hívjuk feleslegesen a resolve_round-ot.
  useEffect(() => {
    if (!round || round.phase === "reveal" || round.phase === "done" || !round.placingDeadline) return;
    const roundId = round.id;
    const deadline = new Date(round.placingDeadline).getTime();
    const msLeft = Math.max(0, deadline - Date.now());
    const t = setTimeout(() => handleResolve(), msLeft + 500);

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() >= deadline) {
        // A tab háttérben volt, amíg a deadline lejárt. Előbb ellenőrizzük a szerver
        // tényleges állapotát (lehet, hogy a pg_cron már lezárta) — csak ha még mindig
        // nyitva van, próbáljuk a hostot magát lezáratni.
        checkServerRoundState(roundId);
        handleResolve();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, round?.placingDeadline, round?.phase]);

  // FALLBACK POLLING (BACKEND-NOTES 9.4): a player-oldali round_public fallback pollinggal
  // analóg host-oldali tartalék — a pg_cron `auto_resolve_expired_rounds` job (20 mp-enként)
  // a host böngészőjétől FÜGGETLENÜL is lezárhatja a lejárt kört, és utána `round_revealed`
  // broadcast eventet küld. Ha a host tabja épp akkor kerül előtérbe/háttérbe, amikor ez a
  // broadcast-ablak lezárul (Realtime nem garantál perzisztenciát háttérben lévő tabra), a
  // host UI a broadcast nélkül végleg beragadhatna a régi fázisnál. Alacsony frekvenciájú
  // (10 mp) polling a round_public-ra ugyanígy felfedezi az automata lezárást, mint a
  // player oldalon a placingDeadline+GRACE_MS-alapú tartalék — csak itt nincs szükség
  // GRACE_MS-re, mert ez nem indít semmilyen mutációt, csak összeveti az állapotot.
  const roundIdForHostPolling = round?.id;
  const roundPhaseForHostPolling = round?.phase;
  useEffect(() => {
    if (!roomId || !roundIdForHostPolling) return;
    if (roundPhaseForHostPolling === "reveal" || roundPhaseForHostPolling === "done") return;

    const POLL_INTERVAL_MS = 10000;
    let cancelled = false;
    const intervalId = setInterval(() => {
      if (!cancelled) checkServerRoundState(roundIdForHostPolling);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roundIdForHostPolling, roundPhaseForHostPolling]);

  // Amikor a lerakás megtörtént (placement !== null) reveal előtt, azonnal kiértékelünk —
  // nem kell megvárni a deadline-t (D6: "ha van épp kijelölt rés, az számít lerakásnak").
  useEffect(() => {
    if (round && round.placement !== null && (round.phase === "playing" || round.phase === "stealing")) {
      const t = setTimeout(() => handleResolve(), 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.placement, round?.phase]);

  // Audio elindítása amikor új audioUrl érkezik.
  //
  // AUDIO-HOTFIX (2026-07-02): az `audioLocked` korábban csak az AudioUnlockOverlay onUnlock
  // kattintására állt vissza false-ra. Ha egy korábbi körben a play() elutasult (pl. a host tab
  // háttérben volt — autoplay policy), az `audioLocked=true` MINDEN KÖVETKEZŐ körre átöröklődött,
  // még akkor is, ha az adott új play() hívás ténylegesen sikerült — emiatt az AudioProgressBar
  // hamisan "not playing"-et mutatott, és ha a play() a háttérben lévő tabon megint elutasult,
  // semmi nem jelezte, hogy ez egy ÚJ zene, ami megint feloldásra vár (az overlay technikailag
  // már látszott, de a felhasználó könnyen azt hihette, hogy a korábbi state maradt meg).
  // Megoldás: minden új audioUrl-nél explicit resetelünk, majd a play() eredménye alapján
  // állítjuk be újra — így az audioLocked mindig az AKTUÁLIS play() kísérlet valódi állapotát
  // tükrözi, nem egy korábbi körből maradt, esetleg már irreleváns flaget.
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      setAudioLocked(false);
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(() => setAudioLocked(true));
    }
  }, [audioUrl]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ConnectionOverlay mode="reconnecting" />
      </div>
    );
  }

  if (loadError && !roomId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-danger">{loadError}</p>
      </div>
    );
  }

  const activePlayer = players.find((p) => p.id === round?.activePlayerId) ?? null;
  const winners = players.filter((p) => winnerPlayerIds.includes(p.id));

  return (
    <div className="flex flex-col flex-1 px-6 py-8">
      <div className="w-full max-w-5xl mx-auto space-y-8">
        <div className="flex justify-between text-xs text-text-muted border-b border-border pb-3">
          <span className="font-code">Host · {roomCode}</span>
          {loadError && <span className="text-danger">{loadError}</span>}
        </div>

        {/*
         * AUDIO-HOTFIX (2026-07-03): az <audio> elem korábban a "playing" fázis JSX ágában volt,
         * tehát csak akkor létezett a DOM-ban, ha roomStatus === "playing" ÉS a round NEM reveal
         * fázisú. A handleNextTurn() → beginRound() hívásláncban viszont setAudioUrl(draw.audioUrl)
         * MINDIG a round state frissítése (refreshRound) ELŐTT fut le — a nextTurn()-ből visszakapott
         * roundId-vel a `round` state pillanatnyilag MÉG a régi, reveal fázisú kör (revealedCard-dal),
         * tehát pont akkor, amikor az audioUrl useEffect lefutna, a JSX a reveal ágat rendereli, ahol
         * nincs <audio> elem — audioRef.current NULL, a useEffect feltétele hamis, a .play() sosem
         * hívódik meg. A round state csak EZUTÁN vált "playing"-re (refreshRound a beginRound végén),
         * de akkor már nincs újabb audioUrl-változás, ami újra triggerelné az effectet — a lejátszó
         * csendben néma marad.
         *
         * Az 1. körnél (handleStart) ez nem jelentkezett, mert ott a refreshRound(res.roundId) a
         * beginRound hívás ELŐTT fut le, tehát a round state már "playing" volt, mire a
         * setAudioUrl(draw.audioUrl) a JSX playing-ágát (és benne az <audio> elemet) aktiválta.
         *
         * Megoldás: az <audio> elemet KIVESSZÜK a fázis-feltételes JSX-ből, és feltétel nélkül,
         * a komponens gyökerében, rejtve rendereljük — így az audioRef élettartama nem kötődik a
         * round.phase-hez, sosem vész el fázisváltás közben, és minden audioUrl-változás megbízhatóan
         * eléri a valódi <audio> DOM elemet, függetlenül attól, hogy melyik JSX-ág aktív éppen.
         */}
        <audio ref={audioRef} className="hidden" />

        {roomStatus === "lobby" && (
          <section className="space-y-8 text-center">
            <h1 className="text-2xl font-bold">CSATLAKOZZ A JÁTÉKHOZ!</h1>
            <div className="flex flex-col md:flex-row items-center justify-center gap-10">
              <QRCodePanel joinUrl={`${effectiveOrigin}/play/${roomCode}`} />
              <div>
                <div className="text-text-muted mb-2">Szobakód:</div>
                <RoomCodeBadge code={roomCode} />
              </div>
            </div>

            {isLocalOrigin && (
              <div
                className="max-w-lg mx-auto bg-warning/10 border border-warning text-warning text-sm rounded-[var(--radius-card)] px-4 py-3 text-left"
                role="alert"
              >
                <strong>⚠ Figyelem:</strong> ezt az oldalt <span className="font-code">localhost</span>-on
                nyitottad meg — a QR-kód emiatt a telefonodról nem lesz elérhető. Ha telefonról teszteled,
                nyisd meg ezt az oldalt a géped hálózati IP-címén, ne localhost-on — pl.{" "}
                <span className="font-code">http://192.168.0.123:3000/host</span>. (A géped LAN IP-jét a
                `ipconfig` / `ifconfig` paranccsal nézheted meg.)
                {originFetchFailed && " (A cím automatikus felismerése nem sikerült, ez a jelzés csak becslés.)"}
              </div>
            )}

            <div className="text-left">
              <h2 className="text-text-muted text-sm uppercase tracking-wide mb-3">
                Csatlakozott játékosok ({players.length})
              </h2>
              <PlayerList players={players} layout="grid" />
            </div>

            <div>
              <AppButton size="lg" disabled={players.length < 2} onClick={handleStart}>
                START ▶
              </AppButton>
              <p className="text-text-muted text-sm mt-2">Legalább 2 játékos kell az induláshoz.</p>
            </div>
          </section>
        )}

        {roomStatus === "playing" && round && !(round.phase === "reveal" && round.revealedCard) && (
          <section className="space-y-8">
            <div className="flex justify-between text-text-muted text-sm">
              <span>🔊 Most szól…</span>
              <span>Kör {round.roundNo}</span>
            </div>

            <div className="flex flex-col items-center gap-6">
              <MysteryCard spinning size="lg" />
              <AudioProgressBar current={0} duration={30} playing={Boolean(audioUrl) && !audioLocked} />
            </div>

            {activePlayer && (
              <div className="bg-surface-2 rounded-[var(--radius-card)] px-6 py-4 text-center">
                <PlayerBadge name={activePlayer.name} color={activePlayer.color} state="active" size="lg" />
                <p className="text-text-muted mt-2">«húzza a kártyát…»</p>
              </div>
            )}

            <div>
              <h2 className="text-text-muted text-sm uppercase tracking-wide mb-3">Játékosok idővonalai</h2>
              <div className="space-y-2">
                {players.map((p) => (
                  <PlayerTimelineRow
                    key={p.id}
                    player={p}
                    cards={timelines[p.id] ?? []}
                    isActive={p.id === activePlayer?.id}
                    ghostSlotIndex={p.id === activePlayer?.id ? dragGhostIndex : null}
                  />
                ))}
              </div>
            </div>

            <AudioUnlockOverlay
              visible={audioLocked}
              onUnlock={() => {
                // Csak akkor zárjuk be az overlay-t, ha a play() ténylegesen sikerült — ha megint
                // elutasul (pl. a böngésző még mindig nem tekinti ezt elég erős user-gesture-nek),
                // az overlay-nek fent kell maradnia, különben a felhasználó csendben elveszíti az
                // esélyt újra feloldani, és a zene véglegesen néma marad a kör hátralévő részére.
                audioRef.current
                  ?.play()
                  .then(() => setAudioLocked(false))
                  .catch(() => setAudioLocked(true));
              }}
            />
          </section>
        )}

        {roomStatus === "playing" && round && round.phase === "reveal" && round.revealedCard && (
          <section className="flex flex-col items-center gap-8 py-8">
            <RevealCard
              artworkUrl={round.revealedCard.artworkUrl}
              title={round.revealedCard.title}
              artist={round.revealedCard.artist}
              year={round.revealedCard.year}
              flipped
            />
            <OutcomeBanner
              outcome={round.outcome === "timeout" ? "timeout" : round.outcome === "correct" ? "correct" : "wrong"}
              playerName={activePlayer?.name}
            />
            <p className="text-text-muted text-sm" aria-live="polite">
              «következő kör 5 mp múlva…»
            </p>
            <AppButton onClick={handleNextTurn}>Következő kör ▶</AppButton>
          </section>
        )}

        {roomStatus === "finished" && (
          <section className="flex flex-col items-center gap-8 py-8 text-center">
            <h1 className="text-3xl font-bold">
              {winners.length > 1 ? "🎉 HOLTVERSENY! 🎉" : "🎉 GYŐZELEM! 🎉"}
            </h1>
            {winners.map((w) => (
              <PlayerBadge key={w.id} name={w.name} color={w.color} size="lg" />
            ))}

            <div className="text-left w-full max-w-sm">
              <h2 className="text-text-muted text-sm uppercase tracking-wide mb-3">Végeredmény</h2>
              <ul className="space-y-2">
                {players
                  .map((p) => ({ p, count: (timelines[p.id] ?? []).length }))
                  .sort((a, b) => b.count - a.count)
                  .map(({ p, count }) => (
                    <li key={p.id} className="flex items-center justify-between">
                      <PlayerBadge name={p.name} color={p.color} size="sm" />
                      <span className="font-numeric">
                        {count} kártya {winnerPlayerIds.includes(p.id) && "🥇"}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            {winners[0] && (
              <div>
                <h2 className="text-text-muted text-sm uppercase tracking-wide mb-3">
                  {winners[0].name} idővonala
                </h2>
                <div className="flex gap-2 flex-wrap justify-center">
                  {(timelines[winners[0].id] ?? []).map((c) => (
                    <TimelineCard key={c.id} year={c.year} state="revealed" size="sm" />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
