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
import type { Player, PlayerColorId, RoundPublic, TimelineCardPublic } from "@/lib/game/types";
import { ensureAnonymousSession } from "@/lib/supabase/client";
import {
  reconnect,
  joinRoom,
  placeCard,
  fetchPlayers,
  fetchRoundPublic,
  getTimeline,
} from "@/lib/supabase/functions";
import { adaptRoundPublic } from "@/lib/supabase/adapters";
import { useRoomChannel } from "@/lib/game/useRoomChannel";

/**
 * Player shell — P1 (ha még nem tag) → P2..P5 a fázis alapján (ARCHITECTURE 5.1).
 * A player kliens SOSEM hívja a draw_card/resolve_round-ot (host-only, 403, BACKEND-NOTES 7.),
 * és mindig a round_public view-t olvassa (SOHA a rounds táblát) + a get_timeline RPC-t
 * (nem view — BACKEND-NOTES 2. eltérés az ARCHITECTURE.md-től).
 */
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

  // P1 form state
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColorId | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [placedOutcome, setPlacedOutcome] = useState<"correct" | "wrong" | "timeout" | null>(null);

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
          if (me) setMyTimeline(await refreshTimelineFor(roomId, me.id));
          if (r) setActiveTimeline(await refreshTimelineFor(roomId, r.activePlayerId));
        }
      } else if (event === "card_placed") {
        if (round) await refreshRound(round.id);
      } else if (event === "round_revealed") {
        if (round) {
          const r = await refreshRound(round.id);
          if (me) setMyTimeline(await refreshTimelineFor(roomId, me.id));
          if (r) {
            setActiveTimeline(await refreshTimelineFor(roomId, r.activePlayerId));
            setPlacedOutcome(r.outcome as "correct" | "wrong" | "timeout" | null);
          }
        }
      } else if (event === "game_finished") {
        setRoomFinished(true);
        const ids = (payload as { winnerPlayerIds?: string[] })?.winnerPlayerIds ?? [];
        setWinnerPlayerIds(ids);
      }
    },
  });

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

  async function handlePlaceCard(slotIndex: number) {
    if (!round) return;
    try {
      await placeCard(round.id, slotIndex);
      await refreshRound(round.id);
      // A host figyeli a placement-et és hívja a resolve_round-ot; itt jelezzük a broadcastot,
      // hogy a host (és a többi player) azonnal frissítse a round_public állapotot.
      await broadcastEvent("card_placed", { roundId: round.id });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Nem sikerült lerakni a kártyát.");
    }
  }

  const takenColors = players.filter((p) => p.id !== me?.id).map((p) => p.color);
  const takenByName = Object.fromEntries(
    players.filter((p) => p.id !== me?.id).map((p) => [p.color, p.name])
  ) as Partial<Record<PlayerColorId, string>>;

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
      </div>
    );
  }

  const activePlayer = players.find((p) => p.id === round?.activePlayerId) ?? null;
  const isMyTurn = round?.activePlayerId === me.id;

  // P5 — reveal-visszajelzés (bármelyik player, saját eredmény).
  if (round && round.phase === "reveal" && round.revealedCard) {
    const success = placedOutcome === "correct";
    return (
      <div className="flex flex-col flex-1 min-h-screen">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6 max-w-sm mx-auto w-full text-center">
          <OutcomeBanner
            outcome={
              placedOutcome ?? (round.outcome === "disputed" ? "wrong" : round.outcome) ?? "wrong"
            }
          />
          <p className="text-lg">{success ? "Eltaláltad! 🎉" : "Nem talált 😅"}</p>
          <p className="font-semibold">
            {round.revealedCard.artist} – {round.revealedCard.year}
          </p>
          <div>
            <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">A te idővonalad</h2>
            <Timeline cards={myTimeline} />
          </div>
          <p className="text-text-muted text-sm" aria-live="polite">
            «következő kör…»
          </p>
        </div>
      </div>
    );
  }

  // P3 — a te köröd, tippelés.
  if (round && isMyTurn && round.phase !== "reveal" && round.phase !== "done") {
    return (
      <TippingScreen
        key={round.id}
        cards={myTimeline}
        ownerColor={me.color}
        deadlineIso={round.placingDeadline}
        onConfirm={(slotIndex) => {
          sendDragUpdate({ playerId: me.id, slotIndex });
          handlePlaceCard(slotIndex);
        }}
        onExpire={() => {
          // D6: lejáratkor a host resolve_round-ot hív; a player itt csak vár a broadcastra.
        }}
      />
    );
  }

  // P2' — más köre, megfigyelő.
  if (round && activePlayer && !isMyTurn) {
    return (
      <div className="flex flex-col flex-1 min-h-screen">
        <div className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-sm mx-auto w-full">
          <div>
            <PlayerBadge name={activePlayer.name} color={activePlayer.color} state="active" />
            <p className="text-text-muted text-sm mt-1">«húzza a kártyát…»</p>
          </div>

          <div>
            <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">
              {activePlayer.name} idővonala
            </h2>
            <Timeline cards={activeTimeline} />
          </div>

          <div>
            <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">A te idővonalad</h2>
            <Timeline cards={myTimeline} />
          </div>

          <p className="text-text-muted text-sm">Zene szól a közös képernyőn 🔊</p>
          <p className="text-text-muted">Várd ki a köröd 🙂</p>
        </div>
      </div>
    );
  }

  // P2 — lobby várakozás (még nincs induló kör).
  return (
    <div className="flex flex-col flex-1 min-h-screen">
      <div className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-sm mx-auto w-full">
        <PlayerBadge name={`${me.name} (te)`} color={me.color} />
        <p className="text-text-muted">Várj a hostra…</p>
        <p className="text-text-muted text-sm">«a host mindjárt elindítja»</p>

        <div>
          <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">A te idővonalad</h2>
          <Timeline cards={myTimeline} />
        </div>

        <div>
          <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">Többiek</h2>
          <PlayerList players={players.filter((p) => p.id !== me.id)} />
        </div>
      </div>
    </div>
  );
}
