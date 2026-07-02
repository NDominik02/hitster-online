"use client";

/**
 * Realtime csatorna hook — broadcast + presence + refetch minta (ARCHITECTURE.md 4. szakasz).
 *
 * TODO(BACKEND-INTEGRÁCIÓ): jelenleg csak a csatorna-szerződést (event nevek, payload-alak)
 * és a subscribe/unsubscribe életciklust rögzíti működő Supabase Realtime nélkül (ha a kliens
 * nincs konfigurálva, no-op-ként fut). Amint a Backend Edge Functionök broadcast-olnak a
 * room:{roomId} csatornára (ARCHITECTURE 4.1 táblázat), itt kell az `onEvent` callback-eket
 * a UI állapot-refetch-hez kötni (pl. round_public / players / timeline_public újraolvasás).
 *
 * FONTOS anti-leak szabály (ARCHITECTURE 4.1): a broadcast payload SOSEM tartalmaz kártya-
 * metaadatot vagy card_id-t — csak "mi történt" jelzést. A tényleges adatot mindig a
 * megfelelő RLS-védett SELECT-ből (round_public/timeline_public) kell újraolvasni.
 */
import { useEffect, useRef } from "react";
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
  onEvent?: (event: RoomChannelEvent, payload: unknown) => void;
  onPresenceChange?: (state: Record<string, unknown>) => void;
  /** Csak a host figyeli (D8) — élő húzás tükrözés a :drag csatornán. */
  onDragUpdate?: (payload: DragBroadcastPayload) => void;
}

export function useRoomChannel({
  roomId,
  onEvent,
  onPresenceChange,
  onDragUpdate,
}: UseRoomChannelOptions) {
  const dragChannelRef = useRef<ReturnType<
    NonNullable<ReturnType<typeof getSupabaseClient>>["channel"]
  > | null>(null);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !roomId) {
      // Nincs backend bekötve — no-op. A UI mock-adattal fut, a hívó felelőssége
      // a fallback (lásd app/host/[roomCode] és app/play/[roomCode]).
      return;
    }

    const roomChannel = client
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        onEvent?.(event as RoomChannelEvent, payload);
      })
      .on("presence", { event: "sync" }, () => {
        onPresenceChange?.(roomChannel.presenceState());
      })
      .subscribe();

    const dragChannel = client
      .channel(`room:${roomId}:drag`)
      .on("broadcast", { event: "drag" }, ({ payload }) => {
        onDragUpdate?.(payload as DragBroadcastPayload);
      })
      .subscribe();

    dragChannelRef.current = dragChannel;

    return () => {
      client.removeChannel(roomChannel);
      client.removeChannel(dragChannel);
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

  return { sendDragUpdate };
}
