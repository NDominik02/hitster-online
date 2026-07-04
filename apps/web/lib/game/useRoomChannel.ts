"use client";

/**
 * Realtime csatorna hook — broadcast + presence + refetch minta (ARCHITECTURE.md 4. szakasz,
 * docs/BACKEND-NOTES.md 5. szakasz).
 *
 * FONTOS (BACKEND-NOTES 5.): az Edge Functionök NEM broadcastolnak automatikusan — ez
 * kliensoldali felelősség. Minden sikeres mutáció (place_card, draw_card, start_game, stb.)
 * után a HÍVÓ kliensnek kell broadcastolnia a megfelelő eventet a room:{roomId} csatornára,
 * hogy a többi kliens tudja, mikor kell újraolvasnia a round_public/players/rooms állapotot.
 *
 * FONTOS anti-leak szabály (ARCHITECTURE 4.1): a broadcast payload SOSEM tartalmaz kártya-
 * metaadatot vagy card_id-t — csak "mi történt" jelzést. A tényleges adatot mindig a
 * megfelelő RLS-védett SELECT-ből (round_public/get_timeline) kell újraolvasni.
 */
import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase/client";
import type { DragBroadcastPayload } from "./types";

export type RoomChannelEvent =
  | "player_joined"
  | "game_started"
  | "round_started"
  | "card_placed"
  | "round_revealed"
  | "turn_advanced"
  | "game_finished"
  // F2 (ARCHITECTURE 11.8) — a 15 mp-es steal-ablak eventjei. A payloadok SOSEM tartalmaznak
  // kártya-adatot vagy card_id-t (anti-leak, 11.9/5.): steal_registered csak darabszámot küld.
  | "steal_registered"
  | "steal_window_closed"
  | "round_disputed"
  | "turn_auto_skipped";

export interface UseRoomChannelOptions {
  roomId: string | null;
  /** Ez az én (a jelen kliens) player/host azonosítóm — presence track()-hez. */
  presenceKey?: string;
  presenceMeta?: Record<string, unknown>;
  onEvent?: (event: RoomChannelEvent, payload: unknown) => void;
  onPresenceChange?: (state: Record<string, unknown>) => void;
  /** Csak a host figyeli (D8) — élő húzás tükrözés a :drag csatornán. */
  onDragUpdate?: (payload: DragBroadcastPayload) => void;
  /**
   * Meghívódik, amint a room:{roomId} csatorna ténylegesen SUBSCRIBED állapotba kerül.
   * A broadcastEvent() ELŐTTE hívva no-op (a channel ref még nincs kész) — ha a hívó oldalnak
   * egy akció UTÁN azonnal broadcastolnia kell (pl. join_room után), erre a callbackre vagy az
   * isSubscribedRef-re kell támaszkodnia, nem feltételezheti, hogy a roomId state-beállítás
   * után szinkron már küldhető az esemény.
   */
  onSubscribed?: () => void;
}

export function useRoomChannel({
  roomId,
  presenceKey,
  presenceMeta,
  onEvent,
  onPresenceChange,
  onDragUpdate,
  onSubscribed,
}: UseRoomChannelOptions) {
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const dragChannelRef = useRef<RealtimeChannel | null>(null);
  const isSubscribedRef = useRef(false);

  // STALE CLOSURE FIX (2026-07-02): a csatorna-feliratkozás useEffect-je [roomId] dependency-vel
  // fut, tehát a `.on("broadcast", ...)` callback-ek CSAK EGYSZER látják a hívó oldal által
  // átadott onEvent/onPresenceChange/onDragUpdate/onSubscribed függvényeket — ha ezek a hívó
  // komponensben inline arrow function-ök, amik a komponens state-jére hivatkoznak (pl. `round`),
  // akkor az a state referencia örökre a feliratkozáskori (gyakran null/kezdeti) értékre fagy.
  // Megoldás: minden callback-et egy ref-ben tartunk, és minden render után frissítjük — így a
  // channel handler mindig a LEGFRISSEBB callback-et hívja, a `[roomId]`-only effect pedig
  // valóban csak a csatorna élettartamát kezeli, nem a callback-identitást.
  const onEventRef = useRef(onEvent);
  const onPresenceChangeRef = useRef(onPresenceChange);
  const onDragUpdateRef = useRef(onDragUpdate);
  const onSubscribedRef = useRef(onSubscribed);
  // Ugyanez a stale-closure minta vonatkozik a presenceKey/presenceMeta-ra is (lásd lent, a
  // track()-újrapróbálkozó effektnél és a subscribe callback-ben).
  const presenceKeyRef = useRef(presenceKey);
  const presenceMetaRef = useRef(presenceMeta);
  useEffect(() => {
    onEventRef.current = onEvent;
    onPresenceChangeRef.current = onPresenceChange;
    onDragUpdateRef.current = onDragUpdate;
    onSubscribedRef.current = onSubscribed;
    presenceKeyRef.current = presenceKey;
    presenceMetaRef.current = presenceMeta;
  });

  useEffect(() => {
    if (!roomId) return;
    const client = getSupabaseClient();
    isSubscribedRef.current = false;

    const roomChannel = client
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        onEventRef.current?.(event as RoomChannelEvent, payload);
      })
      .on("presence", { event: "sync" }, () => {
        onPresenceChangeRef.current?.(roomChannel.presenceState());
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isSubscribedRef.current = true;
          // A ref-et olvassuk, NEM a closure-be zárt `presenceKey` paramétert — ha a hívó oldalon
          // (pl. a player oldalon) a `presenceKey` (me?.id) csak egy KÉSŐBBI render-ciklusban válik
          // elérhetővé (mert a roomId- és a me-state beállítása közé egy `await` ékelődik, tehát nem
          // egy React-batch-ben történik), ez a callback a feliratkozáskori (gyakran még undefined)
          // értéket látná örökre — lásd a lenti track-újrapróbáló effektet is, ami a FORDÍTOTT
          // sorrendet fedi le (presenceKey érkezik később, mint a SUBSCRIBED állapot).
          if (presenceKeyRef.current) {
            roomChannel.track({ key: presenceKeyRef.current, ...presenceMetaRef.current });
          }
          onSubscribedRef.current?.();
        }
      });

    const dragChannel = client
      .channel(`room:${roomId}:drag`)
      .on("broadcast", { event: "drag" }, ({ payload }) => {
        onDragUpdateRef.current?.(payload as DragBroadcastPayload);
      })
      .subscribe();

    roomChannelRef.current = roomChannel;
    dragChannelRef.current = dragChannel;

    return () => {
      client.removeChannel(roomChannel);
      client.removeChannel(dragChannel);
      roomChannelRef.current = null;
      dragChannelRef.current = null;
    };
  }, [roomId]);

  // BUGFIX (2026-07-04): a player oldalon a `presenceKey` (me?.id) tipikusan EGY KÉSŐBBI
  // render-ciklusban válik elérhetővé, mint a `roomId` — a join/reconnect handlerekben egy
  // `await` (pl. refreshPlayers) van a `setRoomId(...)` ÉS a `setMe(...)` hívás között, tehát
  // ezek NEM egy React-batchben futnak. Mire a `me` (és vele a presenceKey) beállna, a fenti
  // `[roomId]`-only effekt már lefutott és feliratkozott — a subscribe callback ekkor még
  // undefined presenceKey-t látott, tehát a `track()` SOHA nem hívódott meg a valódi
  // player.id-vel. Emiatt a host Presence-figyelése sosem találta a játékost jelenlévőnek,
  // és ~15 mp múlva (F2-D9) mindig lecsatlakozottnak jelentette — HIÁBA volt ténylegesen
  // nyitva a player kliens (éles tünet: "offline" jelzés minden név mellett, holott minden
  // eszköz nyitva volt). Ez a külön effekt a `presenceKey` VÁLTOZÁSÁRA figyel, és ha a
  // csatorna eközben már SUBSCRIBED állapotba került, azonnal track()-el a friss kulccsal —
  // a fenti subscribe callback (a ref-en keresztül) az ELLENKEZŐ sorrendet fedi le.
  useEffect(() => {
    if (!presenceKey) return;
    if (!isSubscribedRef.current || !roomChannelRef.current) return;
    roomChannelRef.current.track({ key: presenceKey, ...presenceMeta });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceKey]);

  /** A soron lévő player küldi húzás közben, throttle-ölve (~10-15/s, ARCHITECTURE 4.2). */
  function sendDragUpdate(payload: DragBroadcastPayload) {
    dragChannelRef.current?.send({
      type: "broadcast",
      event: "drag",
      payload,
    });
  }

  /**
   * Minden sikeres Edge Function hívás UTÁN ezt kell hívni (BACKEND-NOTES 5.) — a function
   * maga nem broadcastol, a kliens felelőssége jelezni a többieknek, hogy refetch-eljenek.
   *
   * Ha a hívás egy join_room/create_room UTÁN azonnal történik, a csatorna feliratkozása még
   * folyamatban lehet (a `roomId` state-effect aszinkron) — ilyenkor rövid, néhány próbálkozásos
   * polling-gal megvárjuk a SUBSCRIBED állapotot, hogy az esemény ne vesszen el csendben.
   */
  async function broadcastEvent(event: RoomChannelEvent, payload: unknown = {}) {
    for (let attempt = 0; attempt < 20 && !isSubscribedRef.current; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    roomChannelRef.current?.send({
      type: "broadcast",
      event,
      payload,
    });
  }

  return { sendDragUpdate, broadcastEvent };
}
