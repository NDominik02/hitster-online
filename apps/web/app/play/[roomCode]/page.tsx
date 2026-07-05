"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { RoomCodeInput } from "@/components/lobby/RoomCodeInput";
import { ColorPicker } from "@/components/lobby/ColorPicker";
import { PlayerList } from "@/components/lobby/PlayerList";
import { Timeline } from "@/components/game/Timeline";
import { TippingScreen } from "@/components/game/TippingScreen";
import { OutcomeBanner } from "@/components/game/OutcomeBanner";
import { ConnectionOverlay } from "@/components/system/ConnectionOverlay";
import { PlayerBadge } from "@/components/lobby/PlayerBadge";
import { StealButton } from "@/components/game/StealButton";
import { CountdownTimer } from "@/components/game/CountdownTimer";
import { GameStats } from "@/components/game/GameStats";
import { playerColorValue } from "@/lib/game/colors";
import type { NameGuessInput, Player, PlayerColorId, PlayerGameStats, RoundPublic, TimelineCardPublic } from "@/lib/game/types";
import { ensureAnonymousSession } from "@/lib/supabase/client";
import {
  reconnect,
  joinRoom,
  placeCard,
  registerSteal,
  fetchPlayers,
  fetchRoundPublic,
  getTimeline,
} from "@/lib/supabase/functions";
import { adaptRoundPublic } from "@/lib/supabase/adapters";
import { useRoomChannel } from "@/lib/game/useRoomChannel";
import { vibrateOutcome } from "@/lib/haptics";

/**
 * Player shell — P1 (ha még nem tag) → P2..P5 a fázis alapján (ARCHITECTURE 5.1).
 * A player kliens SOSEM hívja a draw_card/resolve_round-ot (host-only, 403, BACKEND-NOTES 7.),
 * és mindig a round_public view-t olvassa (SOHA a rounds táblát) + a get_timeline RPC-t
 * (nem view — BACKEND-NOTES 2. eltérés az ARCHITECTURE.md-től).
 */
/**
 * F2 (S25, AC25.5) — "X kimaradt, mert lecsatlakozott" toast, a `turn_auto_skipped` eventből.
 * Fixed pozícióban jelenik meg, a fázistól/JSX-ágtól függetlenül (a hívó minden korai-return
 * ág legkülső elemébe illeszti, hogy ne vesszen el egyik nézeten sem).
 */
function AutoSkipToast({ names, onDismiss }: { names: string[]; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 flex justify-center px-4 py-2 pointer-events-none"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="pointer-events-auto bg-warning text-[var(--bg)] text-sm font-semibold rounded-[var(--radius-pill)] px-4 py-2 shadow-lg"
      >
        ⚠ {names.join(", ")} kimaradt, mert lecsatlakozott
      </button>
    </div>
  );
}

export default function PlayRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode;

  const [checkingReconnect, setCheckingReconnect] = useState(true);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<RoundPublic | null>(null);
  const [myTimeline, setMyTimeline] = useState<TimelineCardPublic[]>([]);
  const [activeTimeline, setActiveTimeline] = useState<TimelineCardPublic[]>([]);
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<string[]>([]);
  const [roomFinished, setRoomFinished] = useState(false);
  // S41 (F4, statisztikák) — a player kliens SOSEM olvassa a `rounds` táblát közvetlenül
  // (anti-leak elv, ld. lentebb a game_finished ág jsdoc-ját) — a host számolja ki és
  // a game_finished broadcast payload-jában küldi el.
  const [gameStats, setGameStats] = useState<PlayerGameStats[]>([]);

  // F2 (S22, ARCHITECTURE 11.6.1) — steal-ablak lokális állapot. `stolenInRound` a körhöz
  // kötött (AC22.5: egy steal/játékos/kör), ezért roundId-vel kulcsolt — új körnél a
  // round_started/turn_advanced ág úgyis nullázza a round state-et, tehát ez a Set implicit
  // "üríthető" lenne körönként; a legegyszerűbb megbízható jelzés mégis a roundId-alapú tárolás.
  const [stealSubmittedForRound, setStealSubmittedForRound] = useState<string | null>(null);
  const [stealSubmitting, setStealSubmitting] = useState(false);
  const [stealError, setStealError] = useState<string | null>(null);
  const [stealCount, setStealCount] = useState(0);

  // F2 (S25, AC25.5) — "Anna kimaradt, mert lecsatlakozott" jelzés a turn_auto_skipped eventből.
  const [autoSkipBanner, setAutoSkipBanner] = useState<string[] | null>(null);

  // P1 form state
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColorId | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [placedOutcome, setPlacedOutcome] = useState<"correct" | "wrong" | "timeout" | null>(null);
  // Loading-visszajelzés + dupla-submit védelem a LERAKOM gombhoz (playtest feedback,
  // 2026-07-06): korábban a gomb rögtön újra kattinthatóvá vált, semmi jelzés nem
  // mutatta, hogy a place_card hívás még folyamatban van — türelmetlen tapogatás
  // esetén ez több egymást követő hívást is elküldött ugyanarra a körre.
  const [placingSubmitting, setPlacingSubmitting] = useState(false);

  // S23 (reveal-show) — a SAJÁT eredményhez kötött haptika (nem a globális round.outcome-hoz),
  // körönként egyszer, a reveal-belépés pillanatában.
  useEffect(() => {
    if (round?.phase === "reveal" && round.revealedCard) {
      const outcome = placedOutcome ?? (round.outcome === "disputed" ? "wrong" : round.outcome) ?? "wrong";
      vibrateOutcome(outcome === "timeout" ? "timeout" : outcome === "correct" ? "correct" : "wrong");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, round?.phase]);

  const refreshPlayers = useCallback(async (rid: string) => {
    const list = await fetchPlayers(rid);
    setPlayers(list);
    return list;
  }, []);

  const refreshRound = useCallback(async (roundId: string) => {
    const row = await fetchRoundPublic(roundId);
    const r = adaptRoundPublic(row);
    setRound(r);
    return r;
  }, []);

  const refreshTimelineFor = useCallback(async (rid: string, playerId: string) => {
    const cards = await getTimeline(rid);
    return cards.filter((c) => c.playerId === playerId).sort((a, b) => a.position - b.position);
  }, []);

  // Kezdeti reconnect-próba (S15) — ha van már ismert identitás ebben a szobában, egyből P2/P3-ra ugrunk.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousSession();
        const res = await reconnect(roomCode);
        if (cancelled) return;
        if (res.role === "player" && res.playerId) {
          setRoomId(res.roomId);
          const list = await refreshPlayers(res.roomId);
          const myPlayer = list.find((p) => p.id === res.playerId) ?? null;
          setMe(myPlayer);
          if (res.status === "finished") setRoomFinished(true);
          if (res.currentRoundId) {
            const r = await refreshRound(res.currentRoundId);
            if (myPlayer) {
              setMyTimeline(await refreshTimelineFor(res.roomId, myPlayer.id));
              if (r) setActiveTimeline(await refreshTimelineFor(res.roomId, r.activePlayerId));
            }
          }
        }
      } catch {
        // Nincs korábbi identitás ehhez a szobához — marad a P1 join form.
      } finally {
        if (!cancelled) setCheckingReconnect(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Reveal-frissítés kiszervezve, hogy a broadcast-esemény ÉS a lenti fallback polling
  // (round_revealed kiesés esetére) ugyanazt az egy útvonalat használja.
  const applyRevealedRound = useCallback(
    async (rid: string) => {
      if (!roomId) return;
      const r = await refreshRound(rid);
      if (me) setMyTimeline(await refreshTimelineFor(roomId, me.id));
      if (r) {
        setActiveTimeline(await refreshTimelineFor(roomId, r.activePlayerId));
        setPlacedOutcome(r.outcome as "correct" | "wrong" | "timeout" | null);
      }
    },
    [roomId, me, refreshRound, refreshTimelineFor]
  );

  const { sendDragUpdate, broadcastEvent } = useRoomChannel({
    roomId,
    presenceKey: me?.id,
    presenceMeta: { role: "player", name: me?.name },
    onEvent: async (event, payload) => {
      if (!roomId) return;
      if (event === "player_joined") {
        await refreshPlayers(roomId);
      } else if (event === "game_started" || event === "round_started" || event === "turn_advanced") {
        const rid = (payload as { roundId?: string })?.roundId;
        if (rid) {
          const r = await refreshRound(rid);
          setPlacedOutcome(null);
          setPlacingSubmitting(false);
          setStealCount(0);
          setStealSubmittedForRound(null);
          setStealError(null);
          if (me) setMyTimeline(await refreshTimelineFor(roomId, me.id));
          if (r) setActiveTimeline(await refreshTimelineFor(roomId, r.activePlayerId));
        }
      } else if (event === "card_placed") {
        // Defensive: elsődlegesen a broadcast payload roundId-jét használjuk, ne a
        // closure-ből olvasott `round` state-et (lásd useRoomChannel stale closure fix).
        const rid = (payload as { roundId?: string })?.roundId ?? round?.id;
        if (rid) await refreshRound(rid);
      } else if (event === "round_revealed") {
        const rid = (payload as { roundId?: string })?.roundId ?? round?.id;
        if (rid) await applyRevealedRound(rid);
      } else if (event === "round_disputed") {
        // F2-D12 (2026-07-04): a host kijavította a szám évét — a kör NEM vált, csak a
        // kimenet/kártya-hely és a megjelenített év frissül. Korábban ezt az eventet a player
        // oldal egyáltalán nem kezelte (a régi, teljes-érvénytelenítős dispute alatt a player
        // kliensek élesben "beragadtak" a régi eredménynél) — ugyanúgy frissítünk, mint reveal-nél.
        const rid = (payload as { roundId?: string })?.roundId ?? round?.id;
        if (rid) await applyRevealedRound(rid);
      } else if (event === "game_finished") {
        setRoomFinished(true);
        // Csak a broadcast payload-ból olvasunk (a host már kiszámolta) — a player kliens
        // SOHA nem olvassa a `rounds` táblát közvetlenül, ugyanúgy, mint a round_public
        // view-nál (anti-leak elv, ld. a fájl tetején lévő jsdoc-ot).
        const finishedPayload = payload as { winnerPlayerIds?: string[]; stats?: PlayerGameStats[] };
        setWinnerPlayerIds(finishedPayload?.winnerPlayerIds ?? []);
        setGameStats(finishedPayload?.stats ?? []);
      } else if (event === "steal_registered") {
        const count = (payload as { stealCount?: number })?.stealCount;
        if (typeof count === "number") setStealCount(count);
      } else if (event === "turn_auto_skipped") {
        const skipped = (payload as { skipped?: string[] })?.skipped ?? [];
        if (skipped.length > 0) setAutoSkipBanner(skipped);
      }
    },
  });

  // FALLBACK POLLING (2026-07-02 hotfix): ha a `round_revealed` broadcast valamiért nem
  // érkezik meg (pl. a host tab háttérbe kerül és a setTimeout throttle-ölődik, vagy a
  // broadcast-csatorna épp nem volt feliratkozva), a player kliens korábban véglegesen
  // beragadt a "Lejárt az idő!" képernyőn — semmi nem mentette meg. Ez a tartalék: ha a
  // kör fázisa még nem reveal/done, DE a placingDeadline már (jó ráhagyással) a múltban
  // van, rövid intervallumban újraolvassuk a round_public nézetet, amíg a fázis ténylegesen
  // reveal-re nem vált (vagy amíg a broadcast közben meg nem érkezik — ilyenkor a round.phase
  // már reveal lesz, és ez az effect magától leáll).
  const roundIdForPolling = round?.id;
  const roundPhaseForPolling = round?.phase;
  const placingDeadlineForPolling = round?.placingDeadline;
  useEffect(() => {
    if (!roomId || !roundIdForPolling) return;
    if (roundPhaseForPolling === "reveal" || roundPhaseForPolling === "done") return;
    if (!placingDeadlineForPolling) return;

    const deadline = new Date(placingDeadlineForPolling).getTime();
    const GRACE_MS = 4000; // ráhagyás, hogy a hostnak legyen ideje a normál úton reagálni
    const POLL_INTERVAL_MS = 2500;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function scheduleNextCheck() {
      const msUntilPollingShouldStart = Math.max(0, deadline + GRACE_MS - Date.now());
      timeoutId = setTimeout(tick, msUntilPollingShouldStart || POLL_INTERVAL_MS);
    }

    async function tick() {
      if (cancelled) return;
      if (Date.now() < deadline + GRACE_MS) {
        scheduleNextCheck();
        return;
      }
      try {
        const row = await fetchRoundPublic(roundIdForPolling!);
        const r = adaptRoundPublic(row);
        if (cancelled || !r) return;
        if (r.phase === "reveal" || r.phase === "done") {
          // A szerver már kiértékelte (a host feldolgozta a resolve_round-ot valamelyik
          // úton) — csak a broadcast maradt el. Frissítsük az UI-t, mintha megjött volna.
          await applyRevealedRound(roundIdForPolling!);
          return; // ne ütemezzünk további pollingot, a phase-változás úgyis leállítja az effectet
        }
      } catch (err) {
        console.warn("[fallback-poll round_public]", err);
      }
      if (!cancelled) scheduleNextCheck();
    }

    scheduleNextCheck();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roundIdForPolling, roundPhaseForPolling, placingDeadlineForPolling]);

  async function handleJoin() {
    if (!name.trim() || !color) return;
    setJoining(true);
    setJoinError(null);
    try {
      await ensureAnonymousSession();
      const res = await joinRoom(roomCode, name.trim(), color);
      setRoomId(res.roomId);
      const list = await refreshPlayers(res.roomId);
      const myPlayer = list.find((p) => p.id === res.playerId) ?? null;
      setMe(myPlayer);
      // A useRoomChannel csak a roomId state-változás UTÁNI render-ciklusban iratkozik fel —
      // a broadcastEvent belső retry-ja megvárja a SUBSCRIBED állapotot (max ~2 mp).
      await broadcastEvent("player_joined", { playerId: res.playerId });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Nem sikerült csatlakozni a szobához.");
    } finally {
      setJoining(false);
    }
  }

  async function handlePlaceCard(slotIndex: number, nameGuess?: NameGuessInput | null) {
    if (!round || placingSubmitting) return;
    setPlacingSubmitting(true);
    try {
      await placeCard(round.id, slotIndex, nameGuess);
      await refreshRound(round.id);
      // A host figyeli a placement-et és hívja a resolve_round-ot; itt jelezzük a broadcastot,
      // hogy a host (és a többi player) azonnal frissítse a round_public állapotot.
      await broadcastEvent("card_placed", { roundId: round.id });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Nem sikerült lerakni a kártyát.");
      setPlacingSubmitting(false);
    }
    // Sikeres lerakás után a `placingSubmitting`-et szándékosan NEM nullázzuk itt —
    // a round.phase úgyis elmozdul (stealing/reveal), a TippingScreen unmountol, a
    // state a következő körnél frissen inicializálódik. Ha nullázzuk, egy lassú
    // hálózat mellett még a régi fázisban újra megnyomható lenne a gomb.
  }

  /**
   * F2 (S22, ARCHITECTURE 11.6.1) — register_steal hívás. TODO F2: az Edge Function még nem
   * él (a Backend nem végzett még, ld. functions.ts registerSteal jsdoc) — ez a handler a
   * végleges szerződés ellen épül, hívásra hibát fog dobni (404/nincs function), amit a UI
   * hibaüzenetként jelez, amíg a Backend nem deployolja. Bekötése módosítás nélkül életbe lép.
   */
  async function handleSteal(position: number) {
    if (!round) return;
    setStealSubmitting(true);
    setStealError(null);
    try {
      await registerSteal(round.id, position);
      setStealSubmittedForRound(round.id);
      await broadcastEvent("steal_registered", { roundId: round.id });
    } catch (err) {
      setStealError(err instanceof Error ? err.message : "Nem sikerült leadni a lopást.");
    } finally {
      setStealSubmitting(false);
    }
  }

  const takenColors = players.filter((p) => p.id !== me?.id).map((p) => p.color);
  const takenByName = Object.fromEntries(
    players.filter((p) => p.id !== me?.id).map((p) => [p.color, p.name])
  ) as Partial<Record<PlayerColorId, string>>;

  // F2 (S25, AC25.5) — a turn_auto_skipped payload playerId-kat ad; itt oldjuk fel névre.
  const autoSkipNames = autoSkipBanner
    ? autoSkipBanner.map((id) => players.find((p) => p.id === id)?.name ?? "Valaki")
    : null;

  if (checkingReconnect) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ConnectionOverlay mode="reconnecting" />
      </div>
    );
  }

  // P1 — még nem tag ennek a szobának.
  if (!roomId || !me) {
    return (
      <div className="flex flex-col flex-1 min-h-screen">
        <div className="flex-1 flex flex-col justify-center px-6 py-8 gap-6 max-w-sm mx-auto w-full">
          <div className="text-center">
            <div className="text-3xl mb-1" aria-hidden>
              🎵
            </div>
            <h1 className="text-xl font-bold">HITSTER</h1>
            <p className="text-text-muted mt-1">Csatlakozz a játékhoz</p>
          </div>

          <div>
            <label className="block mb-1 font-medium text-sm">Szobakód</label>
            <RoomCodeInput value={roomCode.toUpperCase()} onChange={() => {}} disabled />
          </div>

          <div>
            <label className="block mb-1 font-medium text-sm" htmlFor="player-name">
              Neved
            </label>
            <input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 12))}
              placeholder="Anna"
              className="w-full min-h-11 rounded-[var(--radius-button)] bg-surface-2 border-2 border-border focus-visible:border-accent px-4 py-3 text-base"
            />
          </div>

          <div>
            <label className="block mb-2 font-medium text-sm">Színed</label>
            <ColorPicker taken={takenColors} selected={color} onSelect={setColor} takenByName={takenByName} />
          </div>

          {joinError && (
            <p role="alert" className="text-sm text-danger">
              {joinError}
            </p>
          )}

          <AppButton size="lg" fullWidth disabled={!name.trim() || !color || joining} onClick={handleJoin}>
            {joining ? "Csatlakozás…" : "BELÉPEK ▶"}
          </AppButton>
        </div>
      </div>
    );
  }

  // P5-end — vége a játéknak.
  if (roomFinished) {
    const winnerNames = players.filter((p) => winnerPlayerIds.includes(p.id));
    return (
      <div className="flex flex-col flex-1 min-h-screen items-center justify-center px-6 py-8 gap-4 text-center">
        <p className="text-2xl font-bold">
          {winnerNames.length > 1
            ? "🎉 Holtverseny!"
            : `🎉 Nyert: ${winnerNames[0]?.name ?? "?"}`}
        </p>
        <p className="text-text-muted">A győzelem részletei a közös képernyőn láthatók.</p>
        <GameStats players={players} stats={gameStats} />
      </div>
    );
  }

  const activePlayer = players.find((p) => p.id === round?.activePlayerId) ?? null;
  const isMyTurn = round?.activePlayerId === me.id;

  // P5 — reveal-visszajelzés (bármelyik player, saját eredmény).
  if (round && round.phase === "reveal" && round.revealedCard) {
    // BUGFIX (2026-07-06): a `success` korábban a KÖR globális kimenetelét tükrözte,
    // ezért a "Eltaláltad!"/"Nem talált" szöveg MINDENKINEK ugyanaz volt, függetlenül
    // attól, hogy ő rakta-e le a kártyát — most a soron lévőhöz (isMyTurn) képest
    // személyre szabott: a soron lévő "Eltaláltad/Nem találtad el" második személyben
    // olvassa, mindenki más a soron lévő nevével, harmadik személyben.
    const success = placedOutcome === "correct";
    // F2 (AC21.8, AC22.11, ARCHITECTURE 11.5) — a saját bemondás/steal eredménye, ha volt.
    // Csak reveal fázisban érkezik (anti-leak), a revealedCard.guess/.steals mezőkből —
    // ezek hiányoznak (undefined), amíg a Backend nem bővíti a resolve_round-ot (11.6.3).
    const myGuessResult =
      round.revealedCard.guess && round.revealedCard.guess.byPlayerId === me.id
        ? round.revealedCard.guess
        : null;
    const myStealResult = round.revealedCard.steals?.find((s) => s.playerId === me.id) ?? null;
    return (
      <div className="flex flex-col flex-1 min-h-screen">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6 max-w-sm mx-auto w-full text-center">
          <OutcomeBanner
            outcome={
              placedOutcome ?? (round.outcome === "disputed" ? "wrong" : round.outcome) ?? "wrong"
            }
          />
          <p className="text-lg">
            {isMyTurn
              ? success
                ? "Eltaláltad! 🎉"
                : "Nem találtad el 😅"
              : success
                ? `${activePlayer?.name ?? "Ő"} eltalálta! 🎉`
                : `${activePlayer?.name ?? "Ő"} nem találta el 😅`}
          </p>
          <p className="font-semibold">
            {round.revealedCard.artist} – {round.revealedCard.year}
          </p>
          {myGuessResult && (
            <p className={myGuessResult.correct ? "text-success font-semibold" : "text-text-muted"}>
              {myGuessResult.correct ? "🎤 Bemondás sikeres — +1 🪙" : "🎤 Bemondás nem talált"}
            </p>
          )}
          {myStealResult && (
            <p className={myStealResult.won ? "text-success font-semibold" : "text-text-muted"}>
              {myStealResult.won ? "🕵️ Sikeres lopás — tiéd a kártya!" : "🕵️ A lopás nem sikerült"}
            </p>
          )}
          <div>
            <h2 className="eyebrow mb-2">A te idővonalad</h2>
            <Timeline cards={myTimeline} />
          </div>
          <p className="text-text-muted text-sm" aria-live="polite">
            «következő kör…»
          </p>
        </div>
      </div>
    );
  }

  // P3 — a te köröd, tippelés. A `stealing` fázis SOSEM ide tartozik, még a soron lévőnek
  // sem (F2-D5: a soron lévő nem lophat saját magától, ő a lenti "várakozás a lopásokra"
  // ágba esik — az ARCHITECTURE 11.3.2 szerint a lerakás UTÁN nyílik a 15 mp-es steal-ablak).
  if (round && isMyTurn && round.phase !== "stealing" && round.phase !== "reveal" && round.phase !== "done") {
    return (
      <TippingScreen
        key={round.id}
        cards={myTimeline}
        ownerColor={me.color}
        deadlineIso={round.placingDeadline}
        submitting={placingSubmitting}
        onConfirm={(slotIndex, nameGuess) => {
          sendDragUpdate({ playerId: me.id, slotIndex });
          handlePlaceCard(slotIndex, nameGuess);
        }}
        onExpire={() => {
          // D6: lejáratkor a host resolve_round-ot hív; a player itt csak vár a broadcastra.
        }}
      />
    );
  }

  // P4 — steal-ablak, saját köröm épp lezajlott (aktív vagyok, de már stealing fázisban).
  // F2-D5: a soron lévő nem lophat, csak várja a többiek reakcióját / a deadline lejártát.
  if (round && isMyTurn && round.phase === "stealing") {
    return (
      <div className="flex flex-col flex-1 min-h-screen">
        <div className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-sm mx-auto w-full">
          <div className="flex items-center justify-between">
            <PlayerBadge name={`${me.name} (te)`} color={me.color} state="active" tokens={me.tokens} />
            {round.stealDeadline && (
              <CountdownTimer deadlineIso={round.stealDeadline} size="md" warningAt={5} />
            )}
          </div>
          <p className="text-text-muted text-sm">Lerakva! Most 15 mp-ig bárki ellophatja, ha szerinte rossz helyre tetted…</p>
          {stealCount > 0 && (
            <p className="text-warning font-semibold">🕵️ {stealCount} játékos próbál lopni…</p>
          )}
          <div>
            <h2 className="eyebrow mb-2">A te idővonalad</h2>
            <Timeline cards={myTimeline} />
          </div>
        </div>
      </div>
    );
  }

  // P2' — más köre, megfigyelő (playing/placing) VAGY P4 — steal-ablak nem-aktív játékosként.
  if (round && activePlayer && !isMyTurn) {
    const stealing = round.phase === "stealing";
    return (
      <div className="flex flex-col flex-1 min-h-screen">
        {autoSkipNames && (
          <AutoSkipToast names={autoSkipNames} onDismiss={() => setAutoSkipBanner(null)} />
        )}
        <div className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-sm mx-auto w-full">
          <div className="flex items-center justify-between">
            <div>
              <PlayerBadge name={activePlayer.name} color={activePlayer.color} state="active" tokens={activePlayer.tokens} />
              <p className="text-text-muted text-sm mt-1">
                {stealing ? "«lerakta a kártyát»" : "«húzza a kártyát…»"}
              </p>
            </div>
            {stealing && round.stealDeadline && (
              <CountdownTimer deadlineIso={round.stealDeadline} size="md" warningAt={5} />
            )}
          </div>

          {!stealing && (
            <div>
              <h2 className="eyebrow mb-2">
                {activePlayer.name} idővonala
              </h2>
              <Timeline cards={activeTimeline} />
            </div>
          )}

          {stealing ? (
            <>
              {stealCount > 0 && (
                <p className="text-warning text-sm text-center">🕵️ {stealCount} játékos próbál lopni…</p>
              )}
              {stealError && (
                <p role="alert" className="text-sm text-danger">
                  {stealError}
                </p>
              )}
              {/* A tulaj kérésére (2026-07-03): a lopó a SORON LÉVŐ idővonalán jelöl — élőben
                  látja, ő hova tette (round.placement, "📍 ide tette", nem választható), és
                  egy MÁSIK rést jelölhet meg — nem a saját idővonalán, teljesen külön elmélet
                  helyett a konkrét döntést vitatja. */}
              <StealButton
                cards={activeTimeline}
                activePlayerName={activePlayer.name}
                activePlayerColorValue={playerColorValue(activePlayer.color)}
                markedSlotIndex={round.placement}
                ownerColorValue={playerColorValue(me.color)}
                tokens={me.tokens ?? 0}
                alreadyStole={stealSubmittedForRound === round.id}
                submitting={stealSubmitting}
                onSteal={handleSteal}
              />
            </>
          ) : (
            <>
              <div>
                <h2 className="eyebrow mb-2">A te idővonalad</h2>
                <Timeline cards={myTimeline} />
              </div>
              <p className="text-text-muted text-sm">Zene szól a közös képernyőn 🔊</p>
              <p className="text-text-muted">Várd ki a köröd 🙂</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // P2 — lobby várakozás (még nincs induló kör).
  return (
    <div className="flex flex-col flex-1 min-h-screen">
      {autoSkipNames && (
        <AutoSkipToast names={autoSkipNames} onDismiss={() => setAutoSkipBanner(null)} />
      )}
      <div className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-sm mx-auto w-full">
        <PlayerBadge name={`${me.name} (te)`} color={me.color} tokens={me.tokens} />
        <p className="text-text-muted">Várj a hostra…</p>
        <p className="text-text-muted text-sm">«a host mindjárt elindítja»</p>

        <div>
          <h2 className="eyebrow mb-2">A te idővonalad</h2>
          <Timeline cards={myTimeline} />
        </div>

        <div>
          <h2 className="eyebrow mb-2">Többiek</h2>
          <PlayerList players={players.filter((p) => p.id !== me.id)} />
        </div>
      </div>
    </div>
  );
}
