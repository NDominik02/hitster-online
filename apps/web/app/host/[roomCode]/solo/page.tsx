"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { ConnectionOverlay } from "@/components/system/ConnectionOverlay";
import { PlayerBadge } from "@/components/lobby/PlayerBadge";
import { Timeline } from "@/components/game/Timeline";
import { TippingScreen } from "@/components/game/TippingScreen";
import { RevealCard } from "@/components/game/RevealCard";
import { OutcomeBanner } from "@/components/game/OutcomeBanner";
import { CountdownTimer } from "@/components/game/CountdownTimer";
import { HandoffOverlay } from "@/components/pass-and-play/HandoffOverlay";
import { GameStats } from "@/components/game/GameStats";
import { ensureAnonymousSession, getSupabaseClient } from "@/lib/supabase/client";
import {
  startGame,
  nextTurn,
  placeCard,
  resolveRound,
  fetchPlayers,
  fetchRoundPublic,
  getTimeline,
  computeGameStats,
} from "@/lib/supabase/functions";
import { adaptRoundPublic } from "@/lib/supabase/adapters";
import { playRevealSound, primeSoundContext } from "@/lib/sound";
import { vibrateOutcome } from "@/lib/haptics";
import type { NameGuessInput, Player, PlayerGameStats, RoundPublic, TimelineCardPublic } from "@/lib/game/types";

type Screen = "handoff" | "playing" | "guard" | "reveal" | "finished";

/**
 * Pass-and-play (F4/S40) — egy eszköz, körbeadva, host-gép nélkül. Az Architect
 * terve szerint EGYETLEN Supabase munkamenet (auth_uid) alatt fut az egész
 * parti — a `players` sorok mind ugyanazt az auth_uid-t viselik (F2-D-szerű
 * migráció: 009_pass_and_play_multi_player_per_auth), a "ki a soron lévő"
 * kizárólag a szerver `round.active_player_id`-jából derül ki, nincs kliens-
 * oldali "én ki vagyok" identitás-feloldás (nincs is rá szükség, ld. terv).
 *
 * KULCSFONTOSSÁGÚ UX-elv (Architect döntés): a mystery kártya adatai (draw_card
 * hívása start_game/next_turn belsejében) csak az explicit "Megvagyok, mutasd!"
 * gombnyomásra töltődnek be — az átadó-overlay (HandoffOverlay variant="pass")
 * alatt NULLA szerver-adat van a kliens state-ben.
 */
export default function PassAndPlaySoloPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();
  const roomCode = params.roomCode;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<RoundPublic | null>(null);
  const [activeTimeline, setActiveTimeline] = useState<TimelineCardPublic[]>([]);
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<string[]>([]);
  const [gameStats, setGameStats] = useState<PlayerGameStats[]>([]);

  const [screen, setScreen] = useState<Screen>("handoff");
  const [handoffTarget, setHandoffTarget] = useState<Player | null>(null);
  const [starting, setStarting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [resolving, setResolving] = useState(false);

  const playersRef = useRef<Player[]>([]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

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

  const refreshActiveTimeline = useCallback(async (rid: string, activePlayerId: string) => {
    const cards = await getTimeline(rid);
    setActiveTimeline(cards.filter((c) => c.playerId === activePlayerId).sort((a, b) => a.position - b.position));
  }, []);

  // Kezdeti betöltés: szoba a kód alapján (RLS engedi, mert ez a munkamenet
  // már a saját players-sorain keresztül tag ebben a szobában), majd a
  // players lista, és — ha a parti már fut — a jelenlegi kör állapota is
  // (frissítés/visszatérés esetére, ugyanaz a robusztussági elv, mint a
  // klasszikus módban).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousSession();
        const client = getSupabaseClient();
        const { data: room, error } = await client.from("rooms").select("*").eq("code", roomCode.toUpperCase()).single();
        if (error || !room) throw new Error("A szoba nem található.");
        if (cancelled) return;

        setRoomId(room.id);
        const list = await refreshPlayers(room.id);

        if (room.status === "finished") {
          setWinnerPlayerIds(room.winner_player_ids ?? []);
          computeGameStats(room.id).then(setGameStats).catch((err) => console.warn("[computeGameStats]", err));
          setScreen("finished");
        } else if (room.status === "playing" && room.current_round_id) {
          const r = await refreshRound(room.current_round_id);
          if (r) {
            if (r.phase === "reveal" || r.phase === "done") {
              await refreshActiveTimeline(room.id, r.activePlayerId);
              setScreen("reveal");
            } else if (r.phase === "stealing") {
              setScreen("guard");
            } else {
              await refreshActiveTimeline(room.id, r.activePlayerId);
              setScreen("playing");
            }
          }
        } else {
          // Lobby — az első játékos (seat 0) jön elsőként.
          setHandoffTarget(list[0] ?? null);
          setScreen("handoff");
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Nem sikerült betölteni a szobát.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // A reveal-show hangeffekt ugyanúgy triggerelődik, mint a klasszikus host
  // oldalon — ezen az eszközön szól a zene/hang, mert ez a "közös hangszóró".
  useEffect(() => {
    if (screen === "reveal" && round?.revealedCard) {
      const outcome = round.outcome === "timeout" ? "timeout" : round.outcome === "correct" ? "correct" : "wrong";
      playRevealSound(outcome);
      vibrateOutcome(outcome);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, round?.id]);

  /** PP1 "Megvagyok, mutasd!" — csak ITT hívódik start_game vagy next_turn, ekkor
   * töltődik be először a kártya-adat (Architect döntés: gombnyomáshoz kötve). */
  async function handleHandoffConfirm() {
    if (!roomId) return;
    primeSoundContext();
    setStarting(true);
    setLoadError(null);
    try {
      if (!round) {
        // Első kör — start_game egyszerre osztja ki a kezdőkártyákat és húzza az elsőt.
        const res = await startGame(roomId);
        await refreshRound(res.roundId);
        await refreshActiveTimeline(roomId, res.activePlayerId);
        setScreen("playing");
      } else {
        const res = await nextTurn(roomId);
        if (res.next === "finished") {
          setWinnerPlayerIds(res.winnerPlayerIds);
          await refreshPlayers(roomId);
          computeGameStats(roomId).then(setGameStats).catch((err) => console.warn("[computeGameStats]", err));
          setScreen("finished");
        } else if (res.next === "paused") {
          // Pass-and-playben nincs presence-alapú lecsatlakozás, de a védelem megmarad —
          // egyszerűen újrapróbáljuk.
          await handleHandoffConfirm();
          return;
        } else {
          await refreshRound(res.roundId);
          if (res.activePlayerId) await refreshActiveTimeline(roomId, res.activePlayerId);
          setScreen("playing");
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nem sikerült elindítani a kört.");
    } finally {
      setStarting(false);
    }
  }

  async function handlePlaceCard(slotIndex: number, nameGuess?: NameGuessInput | null) {
    if (!round) return;
    setPlacing(true);
    setLoadError(null);
    try {
      await placeCard(round.id, slotIndex, nameGuess);
      await refreshRound(round.id);
      setScreen("guard");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nem sikerült lerakni a kártyát.");
    } finally {
      setPlacing(false);
    }
  }

  /** PP3 "Mutasd a lapot!" — csak a steal_deadline lejárta után hívható sikeresen
   * (a resolve_round 409 steal_window_open-t adna korábban, ld. resolveRound). */
  async function handleReveal() {
    if (!round || !roomId) return;
    setResolving(true);
    setLoadError(null);
    try {
      await resolveRound(round.id);
      await refreshRound(round.id);
      await refreshActiveTimeline(roomId, round.activePlayerId);
      await refreshPlayers(roomId);
      setScreen("reveal");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nem sikerült felfedni a kört.");
    } finally {
      setResolving(false);
    }
  }

  function handleRoundEndNext() {
    if (!round) return;
    const list = playersRef.current;
    const idx = list.findIndex((p) => p.id === round.activePlayerId);
    const next = idx === -1 ? list[0] : list[(idx + 1) % list.length];
    setHandoffTarget(next ?? null);
    setActiveTimeline([]);
    setScreen("handoff");
  }

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

  return (
    <div className="flex flex-col flex-1 min-h-screen">
      {loadError && (
        <p role="alert" className="text-danger text-sm text-center px-4 py-2">
          {loadError}
        </p>
      )}

      {screen === "handoff" && handoffTarget && (
        <HandoffOverlay
          variant="pass"
          playerName={handoffTarget.name}
          playerColor={handoffTarget.color}
          onConfirm={handleHandoffConfirm}
          disabled={starting}
        />
      )}

      {screen === "playing" && round && activePlayer && (
        <TippingScreen
          key={round.id}
          cards={activeTimeline}
          ownerColor={activePlayer.color}
          deadlineIso={round.placingDeadline}
          onConfirm={handlePlaceCard}
          onExpire={() => {
            /* a szerver a placing_deadline lejártát önmaga kezeli (D6) */
          }}
        />
      )}
      {screen === "playing" && placing && (
        <div className="fixed inset-0 z-40 bg-bg/60 flex items-center justify-center">
          <ConnectionOverlay mode="reconnecting" />
        </div>
      )}

      {screen === "guard" && round && activePlayer && (
        <HandoffOverlay
          variant="guard"
          playerName={activePlayer.name}
          playerColor={activePlayer.color}
          onConfirm={handleReveal}
          disabled={resolving || !round.stealDeadline || new Date(round.stealDeadline).getTime() > Date.now()}
        />
      )}
      {screen === "guard" && round?.stealDeadline && (
        <div className="fixed bottom-28 inset-x-0 flex justify-center z-50">
          <CountdownTimer
            deadlineIso={round.stealDeadline}
            size="md"
            warningAt={3}
            onExpire={() => {
              if (!resolving) handleReveal();
            }}
          />
        </div>
      )}

      {screen === "reveal" && round?.revealedCard && activePlayer && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-10">
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
            playerName={activePlayer.name}
          />
          <div className="w-full max-w-sm">
            <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2 text-center">
              {activePlayer.name} idővonala
            </h2>
            <Timeline cards={activeTimeline} />
          </div>
          <AppButton
            size="lg"
            fullWidth
            className="max-w-sm"
            onClick={handleRoundEndNext}
          >
            Kész vagyunk, jöhet a következő! ▶
          </AppButton>
        </div>
      )}

      {screen === "finished" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          <h1 className="text-3xl font-bold">
            {winnerPlayerIds.length > 1 ? "🎉 HOLTVERSENY! 🎉" : "🎉 GYŐZELEM! 🎉"}
          </h1>
          {players
            .filter((p) => winnerPlayerIds.includes(p.id))
            .map((w) => (
              <PlayerBadge key={w.id} name={w.name} color={w.color} size="lg" />
            ))}
          <GameStats players={players} stats={gameStats} />
          <AppButton onClick={() => router.push("/host")}>Új parti</AppButton>
        </div>
      )}
    </div>
  );
}
