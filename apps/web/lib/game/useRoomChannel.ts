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
  | "game_finished";

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

  useEffect(() => {
    if (!roomId) return;
    const client = getSupabaseClient();
    isSubscribedRef.current = false;

    const roomChannel = client
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        onEvent?.(event as RoomChannelEvent, payload);
      })
      .on("presence", { event: "sync" }, () => {
        onPresenceChange?.(roomChannel.presenceState());
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isSubscribedRef.current = true;
          if (presenceKey) roomChannel.track({ key: presenceKey, ...presenceMeta });
          onSubscribed?.();
        }
      });

    const dragChannel = client
      .channel(`room:${roomId}:drag`)
      .on("broadcast", { event: "drag" }, ({ payload }) => {
        onDragUpdate?.(payload as DragBroadcastPayload);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

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
