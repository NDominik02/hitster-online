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
}

export function useRoomChannel({
  roomId,
  presenceKey,
  presenceMeta,
  onEvent,
  onPresenceChange,
  onDragUpdate,
}: UseRoomChannelOptions) {
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const dragChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const client = getSupabaseClient();

    const roomChannel = client
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        onEvent?.(event as RoomChannelEvent, payload);
      })
      .on("presence", { event: "sync" }, () => {
        onPresenceChange?.(roomChannel.presenceState());
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && presenceKey) {
          roomChannel.track({ key: presenceKey, ...presenceMeta });
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
   */
  function broadcastEvent(event: RoomChannelEvent, payload: unknown = {}) {
    roomChannelRef.current?.send({
      type: "broadcast",
      event,
      payload,
    });
  }

  return { sendDragUpdate, broadcastEvent };
}
