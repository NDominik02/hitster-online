/**
 * Typed wrapperek az Edge Function hívásokhoz (ARCHITECTURE.md 3. szakasz — végleges API).
 *
 * TODO(BACKEND-INTEGRÁCIÓ): ezek jelenleg csak a hívás-alakot és a válasz-típusokat rögzítik.
 * Amint a Backend agent deployolja az Edge Functionöket (docs/BACKEND-NOTES.md-ben jelezve),
 * ide kell bekötni a valós `supabase.functions.invoke(...)` hívásokat — a függvénynevek és a
 * bemenet/kimenet alak MÁR a végleges ARCHITECTURE.md specifikációt követi, elvileg csak az
 * `invoke` hívást kell aktiválni minden stub-ban.
 *
 * Minden függvény throw-ol, ha a Supabase kliens nincs konfigurálva — a hívó oldalon (UI)
 * ezt el kell kapni és a mock-adatra kell esni development közben.
 */
import { getSupabaseClient } from "./client";
import type {
  Deck,
  DrawCardResponse,
  RoomSettings,
} from "../game/types";

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      "Supabase kliens nincs konfigurálva (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY hiányzik). " +
        "Lásd lib/supabase/client.ts TODO — várj a Backend agent docs/BACKEND-NOTES.md-jére."
    );
  }
  return client;
}

/** generate_deck (ARCHITECTURE 3.1) */
export async function generateDeck(playlistUrl: string): Promise<Deck> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("generate_deck", {
    body: { playlistUrl },
  });
  if (error) throw error;
  return data as Deck;
}

/** create_room (ARCHITECTURE 3.2) */
export async function createRoom(
  deckId: string,
  settings: RoomSettings
): Promise<{ roomId: string; code: string; status: string }> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("create_room", {
    body: { deckId, settings },
  });
  if (error) throw error;
  return data;
}

/** join_room (ARCHITECTURE 3.3) */
export async function joinRoom(
  code: string,
  name: string,
  color: string
): Promise<{ roomId: string; playerId: string; seatOrder: number; status: string }> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("join_room", {
    body: { code, name, color },
  });
  if (error) throw error;
  return data;
}

/** start_game (ARCHITECTURE 3.4) — csak host hívhatja */
export async function startGame(
  roomId: string
): Promise<{ status: string; roundId: string; activePlayerId: string }> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("start_game", {
    body: { roomId },
  });
  if (error) throw error;
  return data;
}

/** draw_card (ARCHITECTURE 3.5) — csak host kapja meg az audioUrl-t (D7 anti-leak) */
export async function drawCard(roomId: string): Promise<DrawCardResponse> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("draw_card", {
    body: { roomId },
  });
  if (error) throw error;
  return data as DrawCardResponse;
}

/** place_card (ARCHITECTURE 3.6) — csak az aktív játékos hívhatja */
export async function placeCard(
  roundId: string,
  position: number
): Promise<{ phase: string; stealDeadline: string | null }> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("place_card", {
    body: { roundId, position },
  });
  if (error) throw error;
  return data;
}

/** resolve_round (ARCHITECTURE 3.8) — host/szerver-belső hívás */
export async function resolveRound(roundId: string) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("resolve_round", {
    body: { roundId },
  });
  if (error) throw error;
  return data;
}

/** next_turn (ARCHITECTURE 3.9) — host hívja ~5 mp reveal után */
export async function nextTurn(roomId: string) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("next_turn", {
    body: { roomId },
  });
  if (error) throw error;
  return data;
}

/** reconnect (ARCHITECTURE 3.10 / 7.2) */
export async function reconnect(code: string) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("reconnect", {
    body: { code },
  });
  if (error) throw error;
  return data;
}
