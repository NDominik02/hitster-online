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
import { SpotifyDevicePicker } from "@/components/game/SpotifyDevicePicker";
import { PlayerTimelineRow } from "@/components/game/PlayerTimelineRow";
import { RevealCard } from "@/components/game/RevealCard";
import { OutcomeBanner } from "@/components/game/OutcomeBanner";
import { GameStats } from "@/components/game/GameStats";
import { PlayerBadge } from "@/components/lobby/PlayerBadge";
import { TimelineCard } from "@/components/game/TimelineCard";
import { CountdownTimer } from "@/components/game/CountdownTimer";
import { ConnectionOverlay } from "@/components/system/ConnectionOverlay";
import { ensureAnonymousSession } from "@/lib/supabase/client";
import {
  reconnect,
  startGame,
  drawCard,
  resolveRound,
  disputeRound,
  overrideGuess,
  setPresence,
  nextTurn,
  fetchPlayers,
  fetchRoundPublic,
  fetchRoom,
  getTimeline,
  computeGameStats,
} from "@/lib/supabase/functions";
import { adaptRoundPublic } from "@/lib/supabase/adapters";
import { useRoomChannel } from "@/lib/game/useRoomChannel";
import { playRevealSound, primeSoundContext } from "@/lib/sound";
import { useSpotifyPlayback } from "@/lib/spotify/useSpotifyPlayback";
import type { Player, PlayerGameStats, RoundPublic, TimelineCardPublic } from "@/lib/game/types";

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
  // S41 (F4, statisztikák) — csak a parti végén töltjük be (nincs rá szükség menet közben).
  const [gameStats, setGameStats] = useState<PlayerGameStats[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLocked, setAudioLocked] = useState(false);
  const [dragGhostIndex, setDragGhostIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // S20 (F3, Spotify Premium) — a rooms.spotify_playback_mode oszlop (NEM a settings JSON
  // része, ld. lib/game/types.ts Room.spotifyPlaybackMode jsdoc) — csak 'premium'-nál
  // kapcsoljuk be az SDK-t/Connect API-t, hogy 'preview' módban egyáltalán ne fusson le
  // semmilyen Spotify-betöltés.
  const [spotifyPlaybackMode, setSpotifyPlaybackMode] = useState<"preview" | "premium">("preview");
  const spotify = useSpotifyPlayback(spotifyPlaybackMode === "premium");
  // Amikor a jelenlegi kör számát ténylegesen a Spotify játssza (nem a preview <audio>),
  // ez jelzi az AudioProgressBar-nak/<audio>-nak, hogy ne induljon el a preview is.
  const [spotifyPlaying, setSpotifyPlaying] = useState(false);
  // A host bezárhatja a Connect-eszközválasztót anélkül, hogy eszközt választana — ilyenkor
  // a parti egyszerűen a preview módra esik vissza, a picker nem jelenik meg újra.
  const [spotifyPickerDismissed, setSpotifyPickerDismissed] = useState(false);

  // F2 (S22, ARCHITECTURE 11.8) — élő steal-számláló a `steal_registered` broadcastból
  // (H5 mintájára, D8: a host lát élő tükrözést, a payload csak darabszám, anti-leak).
  const [stealCount, setStealCount] = useState(0);

  // F2-D12 (2026-07-04, ÚJRATERVEZVE — ld. supabase/functions/dispute_round/index.ts jsdoc): a
  // vitagomb már NEM nukolja a kört és NEM lép tovább automatikusan — a host beírja a szám
  // tényleges évét, a szerver újraértékeli ez ellen a kört (kié legyen a kártya), és a kör MARAD
  // reveal fázisban, a host a megszokott "Következő kör" gombbal halad tovább. `disputeOpen` az
  // évszám-beviteli mező nyitva van-e; `disputeSaving` a hívás alatt tiltja a gombot.
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeYearInput, setDisputeYearInput] = useState("");
  const [disputeSaving, setDisputeSaving] = useState(false);

  // A tulaj kérésére: a bemondás automatikus talált/nem-talált eredménye a vitagomb mellett,
  // külön is felülbírálható (a csapat közösen dönthet úgy, hogy a beírt cím/előadó elfogadható,
  // vagy éppen visszavonandó) — a kör egészét (évszám/lerakás) ez nem érinti.
  const [guessOverrideSaving, setGuessOverrideSaving] = useState(false);

  // F2 (S25, AC25.5) — "Anna kimaradt, mert lecsatlakozott" toast a turn_auto_skipped eventből.
  const [autoSkipNames, setAutoSkipNames] = useState<string[] | null>(null);

  // F2 (S25, F2-D9/F2-D10) — presence-alapú auto-skip bekötése. A `players` state-et ref-ben is
  // tartjuk (a setInterval closure elavulna a puszta state-re hivatkozva — ugyanaz a minta, mint
  // a korábbi stale-closure javításoknál). A `presentIdsRef` a legutóbbi Realtime Presence
  // pillanatképet tárolja, a `missingSinceRef` pedig azt, mióta hiányzik folyamatosan egy adott
  // játékos — csak a 15 mp-es küszöb (F2-D9) átlépésekor hívjuk a `set_presence`-t, hogy egy
  // pillanatnyi hálózati akadozás ne jelezzen azonnal lecsatlakozást.
  const playersRef = useRef<Player[]>([]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  const presentIdsRef = useRef<Set<string>>(new Set());
  const missingSinceRef = useRef<Map<string, number>>(new Map());

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
        // S20 — a rooms.spotify_playback_mode a reconnect válaszban nincs benne (az csak
        // roomId/role/status/currentRoundId-t ad), ezért egy külön fetchRoom hívás kell rá.
        const roomRow = await fetchRoom(res.roomId);
        if (cancelled) return;
        if (roomRow.spotifyPlaybackMode === "premium") {
          setSpotifyPlaybackMode("premium");
        }
        // Ha a host egy MÁR befejezett partiba csatlakozik vissza (pl. újratöltötte
        // az oldalt a végeredmény-képernyőn), a winnerPlayerIds/statisztika a
        // game_finished broadcastból sosem jönne meg újra — itt kell pótolni.
        if (roomRow.status === "finished") {
          setWinnerPlayerIds(roomRow.winnerPlayerIds);
          computeGameStats(res.roomId).then(setGameStats).catch((err) => console.warn("[computeGameStats]", err));
        }
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
        setStealCount(0);
        setDisputeOpen(false);
        setDisputeYearInput("");
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
        const finishedPayload = payload as { winnerPlayerIds?: string[]; stats?: PlayerGameStats[] };
        setWinnerPlayerIds(finishedPayload?.winnerPlayerIds ?? []);
        await refreshTimelines(roomId);
        if (finishedPayload?.stats) {
          setGameStats(finishedPayload.stats);
        } else {
          computeGameStats(roomId).then(setGameStats).catch((err) => console.warn("[computeGameStats]", err));
        }
      } else if (event === "steal_registered") {
        const count = (payload as { stealCount?: number })?.stealCount;
        if (typeof count === "number") setStealCount(count);
      } else if (event === "round_disputed") {
        // F2-D12: a kör NEM vált, csak az évszám/kimenet frissül ugyanazon a körön — pontosan
        // úgy frissítünk, mint a round_revealed-nél (round + timeline-ok, a kártya új helye miatt).
        const rid = (payload as { roundId?: string })?.roundId ?? round?.id;
        if (rid) await refreshRound(rid);
        await refreshTimelines(roomId);
      } else if (event === "turn_auto_skipped") {
        const skipped = (payload as { skipped?: string[] })?.skipped ?? [];
        if (skipped.length > 0) {
          setAutoSkipNames(skipped.map((id) => players.find((p) => p.id === id)?.name ?? "Valaki"));
        }
      }
    },
    onDragUpdate: (payload) => {
      if (round && payload.playerId === round.activePlayerId) {
        setDragGhostIndex(payload.slotIndex);
      }
    },
    onPresenceChange: (state) => {
      // BUGFIX: a Supabase Realtime Presence a channel() saját, VÉLETLEN kapcsolat-kulcsaival
      // csoportosít (`presenceState()` felső szintű kulcsai NEM a track()-nek átadott `key`
      // mezőt használják, hacsak a csatorna létrehozásakor explicit `config.presence.key`-t nem
      // adunk meg — ezt a useRoomChannel jelenleg nem teszi). A korábbi implementáció
      // `Object.keys(state)`-et nézte, ami ezért SOHA nem egyezett egyetlen player.id-vel sem —
      // minden játékos mindig "hiányzónak" tűnt, 15 mp múlva mindenkit lecsatlakozottnak
      // jelentett (ez okozta az élesben látott hamis "mindenki offline → szünetel" leállást).
      // A helyes megoldás: a track()-kel elküldött payload (benne a `key: presenceKey` mezővel)
      // a presence ÉRTÉKEK között van, nem a kulcsok között — azokat kell kiolvasni.
      const ids = new Set<string>();
      for (const entries of Object.values(state)) {
        for (const entry of entries as Array<{ key?: string }>) {
          if (entry?.key && entry.key !== "host") ids.add(entry.key);
        }
      }
      presentIdsRef.current = ids;
    },
  });

  // F2 (S25, F2-D9/F2-D10) — periodikus ellenőrzés: ha egy regisztrált játékos folyamatosan
  // hiányzik a Presence-ből legalább 15 mp-ig, a host jelenti a szervernek (set_presence,
  // connected:false) — a next_turn ez alapján ugorja át automatikusan a köreit (a szerver,
  // nem egyetlen kliens pillanatnyi jelzése dönt, AC25.7). Visszatéréskor connected:true.
  useEffect(() => {
    if (!roomId) return;
    const CHECK_INTERVAL_MS = 5000;
    const DISCONNECT_THRESHOLD_MS = 15000;

    const interval = setInterval(() => {
      const present = presentIdsRef.current;
      const now = Date.now();
      for (const p of playersRef.current) {
        if (present.has(p.id)) {
          missingSinceRef.current.delete(p.id);
          if (p.connected === false) {
            setPresence(roomId, p.id, true)
              .then(() => refreshPlayers(roomId))
              .catch(() => {});
          }
          continue;
        }
        const missingSince = missingSinceRef.current.get(p.id);
        if (missingSince === undefined) {
          missingSinceRef.current.set(p.id, now);
        } else if (now - missingSince >= DISCONNECT_THRESHOLD_MS && p.connected !== false) {
          setPresence(roomId, p.id, false)
            .then(() => refreshPlayers(roomId))
            .catch(() => {});
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [roomId, refreshPlayers]);

  async function handleStart() {
    if (!roomId) return;
    // S23: a START gomb egy garantált user-gesture — itt oldjuk fel a hangeffekt
    // AudioContext-jét is (Chrome/Safari "suspended" állapotban tartaná az első
    // reveal-ig enélkül), ugyanúgy, ahogy az <audio> elemet is user-gesture oldja fel.
    primeSoundContext();
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
      // S20 (F3) — 'premium' módban ELSŐKÉNT a Spotify-lejátszást próbáljuk (SDK vagy a host
      // által kiválasztott Connect-eszköz); csak sikertelenség esetén (nincs eszköz, hiba a
      // parancsnál) esünk vissza a megszokott preview <audio> útra — a játék emiatt sosem törik.
      if (draw.spotifyUri) {
        const played = await spotify.play(draw.spotifyUri);
        setSpotifyPlaying(played);
        setAudioUrl(played ? null : draw.audioUrl);
      } else {
        setSpotifyPlaying(false);
        setAudioUrl(draw.audioUrl);
      }
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
      // F2 (ARCHITECTURE 11.8): a steal-ablak lezárásának jelzése — a round_revealed a
      // meglévő F1 refetch-triggert adja, a steal_window_closed a jövőbeli finomabb
      // steal-specifikus UI-reakciókhoz (jelenleg a kliensek a round_revealed-re is
      // ugyanúgy refetchelnek, tehát ez ma redundáns, de a szerződést előkészíti).
      await broadcastEvent("round_revealed", { roundId: round.id });
      await broadcastEvent("steal_window_closed", { roundId: round.id });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nem sikerült kiértékelni a kört.");
    }
  }

  /**
   * F2-D12 (2026-07-04) — a host beírja a szám tényleges évét, a szerver újraértékeli ez ellen
   * a kört (kié legyen a kártya), a kör MARAD reveal fázisban. A "Következő kör" gomb ezután a
   * megszokott úton (handleNextTurn/beginRound) lép tovább — nincs itt semmilyen auto-advance.
   */
  async function handleDisputeSubmit() {
    if (!round) return;
    const year = Number.parseInt(disputeYearInput, 10);
    if (!Number.isFinite(year)) {
      setLoadError("Adj meg egy érvényes évszámot.");
      return;
    }
    setDisputeSaving(true);
    try {
      await disputeRound(round.id, year);
      await refreshRound(round.id);
      await refreshTimelines(roomId!);
      await broadcastEvent("round_disputed", { roundId: round.id });
      setDisputeOpen(false);
      setDisputeYearInput("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nem sikerült javítani az évszámot.");
    } finally {
      setDisputeSaving(false);
    }
  }

  /**
   * A tulaj kérésére: a bemondás elismerésének manuális felülbírálása, a vitagomb mellett, attól
   * függetlenül. Ugyanabban az ablakban hívható (reveal fázis, next_turn előtt). A szerver a
   * token-egyenleget is módosítja a váltásnak megfelelően (idempotens, ha már a kért állapotban
   * van — nincs dupla token-jóváírás/-levonás, ha véletlenül kétszer kattintanak ugyanarra).
   */
  async function handleOverrideGuess(correct: boolean) {
    if (!round) return;
    setGuessOverrideSaving(true);
    try {
      await overrideGuess(round.id, correct);
      await refreshRound(round.id);
      await refreshPlayers(roomId!);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nem sikerült módosítani a bemondás eredményét.");
    } finally {
      setGuessOverrideSaving(false);
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
        // A player kliens SOSEM olvassa a `rounds` táblát közvetlenül (anti-leak elv,
        // ld. app/play/[roomCode]/page.tsx jsdoc) — a statisztikát a host számolja ki
        // EGYSZER, és a game_finished broadcast payload-jában küldi tovább mindenkinek.
        const stats = await computeGameStats(roomId).catch((err) => {
          console.warn("[computeGameStats]", err);
          return [];
        });
        setGameStats(stats);
        await broadcastEvent("game_finished", { winnerPlayerIds: res.winnerPlayerIds, stats });
      } else if (res.next === "paused") {
        // F2-D10: mindenki offline-nak tűnt a szerver szerint — a szoba szünetel, amíg valaki
        // vissza nem tér (vagy a host újra nem próbálja, miután a jelenlét-figyelés frissült).
        // A backend-javítás óta (2026-07-03) ez a state ÚJRAPRÓBÁLHATÓ, nem zsákutca.
        setRoomStatus("paused");
      } else {
        // F2 (S25, AC25.5) — ha a szerver átugrott lecsatlakozott játékosokat, jelezzük
        // közvetlenül itt is (a broadcast a saját magunknak küldött eseményt jellemzően nem
        // adja vissza), hogy a host maga is lássa a toast-ot, nem csak a többi kliens.
        if (res.skipped && res.skipped.length > 0) {
          const names = res.skipped.map((id) => playersRef.current.find((p) => p.id === id)?.name ?? "Valaki");
          setAutoSkipNames(names);
          await broadcastEvent("turn_auto_skipped", { skipped: res.skipped });
        }
        await broadcastEvent("turn_advanced", { roundId: res.roundId });
        setAudioUrl(null);
        setSpotifyPlaying(false);
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

  // F1: amikor a lerakás megtörtént (placement !== null) `playing` fázisban, azonnal
  // kiértékelünk — nem kell megvárni a deadline-t (D6: "ha van épp kijelölt rés, az számít
  // lerakásnak"). EZ CSAK a `playing` fázisra vonatkozik (a `place_card` már `stealing`-re
  // állítja a fázist a UPDATE-ben, tehát ez az ág valójában sosem futna `stealing`-nél —
  // a régi kód mégis explicit belevette a `stealing`-et is a feltételbe, ami az F1 "0 mp
  // pass-through" mintát tükrözte).
  //
  // F2-VÁLTÁS (ARCHITECTURE 11.3.2, KRITIKUS): a `stealing` fázis F2-ben TÉNYLEGESEN 15 mp-ig
  // tart — a lerakás UTÁN nem szabad azonnal resolve-olni, a steal-ablaknak valóban nyitva
  // kell maradnia, amíg a `steal_deadline` le nem jár. Ezt egy KÜLÖN effekt kezeli lent
  // ("F2 — steal-ablak deadline figyelése"), ami a `round.stealDeadline`-ra vár.
  //
  // Visszafelé-kompatibilitás: amíg a Backend `place_card`-ja nem ír `steal_deadline`-t (a
  // jelenlegi, 2026-07-03-i élő Function még nem — ld. functions.ts placeCard jsdoc), a
  // `round.stealDeadline` mindig null lesz. Ilyenkor ez az ág az F1-es azonnali resolve-ot
  // futtatja `stealing` fázisban IS (a régi mintát megtartva), hogy a UI ne ragadjon be egy
  // sosem-lejáró ablakban. Amint a Backend bővíti a `place_card`-ot és tényleges
  // `steal_deadline`-t kezd írni, ez az ág automatikusan átadja a vezérlést a lenti F2 effektnek.
  useEffect(() => {
    if (!round || round.placement === null) return;
    if (round.phase === "playing") {
      const t = setTimeout(() => handleResolve(), 0);
      return () => clearTimeout(t);
    }
    if (round.phase === "stealing" && !round.stealDeadline) {
      // Backend még nem F2-kompatibilis (nincs steal_deadline) — F1-fallback: azonnali resolve.
      const t = setTimeout(() => handleResolve(), 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.placement, round?.phase, round?.stealDeadline]);

  // F2 — steal-ablak deadline figyelése (ARCHITECTURE 11.3.2/11.7): amíg a `stealing` fázis
  // aktív ÉS van valós `steal_deadline`, a host megvárja a lejáratot, mielőtt resolve-ol —
  // ezalatt a `steal_registered` broadcastok élőben növelik a `stealCount`-ot (fent). A
  // pg_cron biztonsági háló (BACKEND-NOTES 9., ARCHITECTURE 11.7) ugyanígy lezárná, ha a host
  // tabja közben eltűnne — ez a kliensoldali timer csak UX-gyorsítás, nem biztonsági kérdés
  // (a resolve_round maga ellenőrzi szerveroldalon, hogy a steal_deadline tényleg lejárt-e).
  useEffect(() => {
    if (!round || round.phase !== "stealing" || !round.stealDeadline) return;
    const deadline = new Date(round.stealDeadline).getTime();
    const msLeft = Math.max(0, deadline - Date.now());
    const t = setTimeout(() => handleResolve(), msLeft + 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, round?.phase, round?.stealDeadline]);

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

  // S23 (reveal-show) — a hangeffekt a reveal fázisba lépés PILLANATÁBAN szól egyszer,
  // körönként (a `round?.id` dependency zárja ki, hogy re-render újra elsüsse).
  useEffect(() => {
    if (round?.phase === "reveal" && round.revealedCard) {
      playRevealSound(round.outcome === "timeout" ? "wrong" : round.outcome === "correct" ? "correct" : "wrong");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, round?.phase]);

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
              <h2 className="eyebrow mb-3">
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

        {autoSkipNames && autoSkipNames.length > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="bg-warning/10 border border-warning text-warning text-sm rounded-[var(--radius-card)] px-4 py-3 flex items-center justify-between gap-3"
          >
            <span>⚠ {autoSkipNames.join(", ")} kimaradt, mert lecsatlakozott</span>
            <button
              type="button"
              onClick={() => setAutoSkipNames(null)}
              className="text-warning/80 hover:text-warning font-bold px-2"
              aria-label="Bezár"
            >
              ✕
            </button>
          </div>
        )}

        {roomStatus === "playing" && round && !(round.phase === "reveal" && round.revealedCard) && (
          <section className="space-y-8">
            <div className="flex justify-between items-center">
              <span className="eyebrow" style={{ color: round.phase === "stealing" ? "var(--danger)" : "var(--accent)" }}>
                {round.phase === "stealing" ? "🕵️ lopás folyamatban" : "▶ most szól — ki tudod találni?"}
              </span>
              <span className="eyebrow">Kör {round.roundNo}</span>
            </div>

            {round.phase === "stealing" ? (
              // F2 (S22, ARCHITECTURE 11.3.2/11.8) — a lerakás megtörtént, a 15 mp-es
              // steal-ablak fut. A host élőben mutatja, hányan próbálnak lopni (darabszám
              // csak, anti-leak — 11.9/5.) és a visszaszámlálót a szerver steal_deadline-jából.
              <div className="flex flex-col items-center gap-4">
                {round.stealDeadline ? (
                  <CountdownTimer deadlineIso={round.stealDeadline} size="lg" warningAt={5} />
                ) : (
                  <p className="text-text-muted text-sm">«kiértékelés…»</p>
                )}
                <p className="text-lg">
                  {stealCount > 0 ? `🕵️ ${stealCount} játékos próbál lopni…` : "Bárki ellophatja 1 tokenért…"}
                </p>
              </div>
            ) : (
              <div className="grid md:grid-cols-[auto_1fr_auto] gap-8 items-center pb-8 border-b border-border">
                <div className="flex justify-center">
                  <MysteryCard spinning size="lg" />
                </div>
                <AudioProgressBar
                  current={0}
                  duration={30}
                  playing={spotifyPlaying || (Boolean(audioUrl) && !audioLocked)}
                />
                {activePlayer && (
                  <div className="text-center md:pl-6 md:border-l border-border">
                    <p className="eyebrow mb-2">soron</p>
                    <PlayerBadge name={activePlayer.name} color={activePlayer.color} state="active" size="lg" tokens={activePlayer.tokens} />
                    <p className="text-text-muted mt-1 text-sm">tippel…</p>
                  </div>
                )}
              </div>
            )}

            {round.phase === "stealing" && activePlayer && (
              <div className="bg-surface-2 rounded-[var(--radius-card)] px-6 py-4 text-center">
                <PlayerBadge
                  name={activePlayer.name}
                  color={activePlayer.color}
                  state="active"
                  size="lg"
                  tokens={activePlayer.tokens}
                />
                <p className="text-text-muted mt-2">«lerakta a kártyát»</p>
              </div>
            )}

            <div>
              <h2 className="eyebrow mb-3">Játékosok idővonalai</h2>
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

            <SpotifyDevicePicker
              visible={spotify.needsDevicePicker && !spotifyPickerDismissed}
              devices={spotify.connectDevices}
              loading={spotify.loadingDevices}
              onSelect={(deviceId) => spotify.selectDevice(deviceId)}
              onSkip={() => setSpotifyPickerDismissed(true)}
            />

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
              variant="show"
              outcome={round.outcome === "timeout" ? "timeout" : round.outcome === "correct" ? "correct" : "wrong"}
            />
            <OutcomeBanner
              outcome={round.outcome === "timeout" ? "timeout" : round.outcome === "correct" ? "correct" : "wrong"}
              playerName={activePlayer?.name}
            />

            {/* F2 (S21/S22, AC21.8/AC22.11, ARCHITECTURE 11.5) — bemondás/steal publikus eredmény.
                Hiányzik (undefined), amíg a Backend nem bővíti a resolve_round-ot (11.6.3) —
                ilyenkor ez az egész blokk egyszerűen nem renderel semmit. */}
            {(() => {
              const guess = round.revealedCard?.guess;
              const steals = round.revealedCard?.steals ?? [];
              if (!guess && steals.length === 0) return null;
              return (
                <div className="text-center space-y-1 text-sm">
                  {guess && (
                    <div className="flex flex-col items-center gap-1">
                      <p className={guess.correct ? "text-success" : "text-text-muted"}>
                        🎤 {players.find((p) => p.id === guess.byPlayerId)?.name ?? "Valaki"} bemondása{" "}
                        {guess.correct ? "talált (+1 🪙)" : "nem talált"}
                      </p>
                      {/* A tulaj kérésére: a bemondás elismerése a vitagombtól függetlenül is
                          felülbírálható, ha közösen úgy döntötök, hogy a beírtat elfogadjátok
                          (vagy visszavonjátok) — ez a döntés függetlenül él az évszám-javítástól. */}
                      <button
                        type="button"
                        className="text-xs text-text-muted underline hover:text-text disabled:opacity-50"
                        disabled={guessOverrideSaving}
                        onClick={() => handleOverrideGuess(!guess.correct)}
                      >
                        {guessOverrideSaving
                          ? "Mentés…"
                          : guess.correct
                            ? "Mégsem talált (−1 🪙)"
                            : "Elfogadjuk, mégis talált (+1 🪙)"}
                      </button>
                    </div>
                  )}
                  {steals.map((s) => (
                    <p key={s.playerId} className={s.won ? "text-success" : "text-text-muted"}>
                      🕵️ {players.find((p) => p.id === s.playerId)?.name ?? "Valaki"}{" "}
                      {s.won ? "sikeresen ellopta a kártyát!" : s.correct ? "jól jelölt, de nem ő nyert" : "nem talált"}
                    </p>
                  ))}
                </div>
              );
            })()}

            <p className="text-text-muted text-sm" aria-live="polite">
              «következő kör…»
            </p>

            {/* F2-D12 (2026-07-04) — évszám-javítás: a host beírja a szám tényleges évét, a
                szerver újraértékeli ez ellen a kört (kié legyen a kártya), a kör MARAD reveal
                fázisban — a "Következő kör" gomb utána a megszokott úton lép tovább. */}
            {disputeOpen ? (
              <div className="flex items-center gap-2">
                <label htmlFor="dispute-year" className="text-sm text-text-muted">
                  Valódi évszám:
                </label>
                <input
                  id="dispute-year"
                  type="number"
                  inputMode="numeric"
                  value={disputeYearInput}
                  onChange={(e) => setDisputeYearInput(e.target.value)}
                  placeholder={String(round.revealedCard.year)}
                  className="w-24 min-h-11 rounded-[var(--radius-button)] bg-surface-2 border-2 border-border focus-visible:border-accent px-3 py-2 text-base"
                />
                <AppButton
                  size="sm"
                  variant="secondary"
                  onClick={handleDisputeSubmit}
                  disabled={disputeSaving || !disputeYearInput}
                >
                  {disputeSaving ? "Mentés…" : "Frissítés"}
                </AppButton>
                <button
                  type="button"
                  className="text-text-muted text-sm underline"
                  onClick={() => {
                    setDisputeOpen(false);
                    setDisputeYearInput("");
                  }}
                >
                  Mégse
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <AppButton
                  variant="secondary"
                  onClick={() => {
                    setDisputeOpen(true);
                    setDisputeYearInput(String(round.revealedCard?.year ?? ""));
                  }}
                >
                  ⚠ Vitatom (rossz évszám)
                </AppButton>
                <AppButton onClick={handleNextTurn}>Következő kör ▶</AppButton>
              </div>
            )}
          </section>
        )}

        {roomStatus === "paused" && (
          <section className="flex flex-col items-center gap-6 py-12 text-center">
            <h2 className="text-2xl font-bold">⏸ A parti szünetel</h2>
            <p className="text-text-muted max-w-md">
              A szerver úgy látja, senki nincs jelen épp — várd meg, amíg a játékosok
              visszatérnek (a jelzés magától frissül néhány másodperc múlva), vagy próbáld
              újra most.
            </p>
            <AppButton onClick={handleNextTurn}>Újrapróbálom ▶</AppButton>
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
              <h2 className="eyebrow mb-3">Végeredmény</h2>
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
                <h2 className="eyebrow mb-3">
                  {winners[0].name} idővonala
                </h2>
                <div className="flex gap-2 flex-wrap justify-center">
                  {(timelines[winners[0].id] ?? []).map((c) => (
                    <TimelineCard key={c.id} year={c.year} state="revealed" size="sm" />
                  ))}
                </div>
              </div>
            )}

            <GameStats players={players} stats={gameStats} />
          </section>
        )}
      </div>
    </div>
  );
}
