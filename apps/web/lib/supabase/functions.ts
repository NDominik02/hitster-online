/**
 * Typed wrapperek az Edge Function hívásokhoz (ARCHITECTURE.md 3. szakasz — végleges API,
 * docs/BACKEND-NOTES.md 3. szakasz — a ténylegesen deployolt hívási minta).
 *
 * Minden function `supabase.functions.invoke(...)`-on megy, ami automatikusan felteszi az
 * Authorization headert az aktuális (anonymous auth) sessionből — verify_jwt: true mindenhol,
 * ezért a hívó oldalnak `ensureAnonymousSession()`-t kell futtatnia előbb.
 *
 * Hibaválasz formátum egységes: { error: string, messageHu?: string }, HTTP 400/401/403/404/409/422/500.
 * A FunctionsHttpError body-jából kinyerjük a messageHu-t, ha van, és azt dobjuk emberi olvasásra.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import { adaptDeck, adaptPlayer, adaptRoom, adaptTimelineCard } from "./adapters";
import type { Deck, DrawCardResponse, Player, Room, RoomSettings, TimelineCardPublic } from "../game/types";

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json();
        throw new Error(payload.messageHu || payload.error || error.message);
      } catch {
        // body nem parse-olható JSON-ként — visszaesünk az eredeti hibára
      }
    }
    throw error;
  }
  return data as T;
}

/** generate_deck (ARCHITECTURE 3.1 / BACKEND-NOTES 4.) — szinkron fut, a válasz a végleges eredmény. */
export async function generateDeck(playlistUrl: string): Promise<Deck> {
  const data = await invoke<{
    deckId: string;
    name: string;
    totalTracks: number;
    usableCount: number;
    coveragePct: number;
    meetsMinimum: boolean;
    excluded: Array<{ title: string; artist: string; reason: "no_preview" | "no_year" }>;
    uncertainYearCount?: number;
  }>("generate_deck", { playlistUrl });

  return {
    id: data.deckId,
    name: data.name,
    sourcePlaylistUrl: playlistUrl,
    totalTracks: data.totalTracks,
    usableCount: data.usableCount,
    coveragePct: data.coveragePct,
    status: "ready",
    report: {
      usable: data.usableCount,
      total: data.totalTracks,
      coveragePct: data.coveragePct,
      meetsMinimum: data.meetsMinimum,
      excluded: data.excluded,
      uncertainYearCount: data.uncertainYearCount,
    },
  };
}

/**
 * Pollingozza a decks.report mezőt, amíg a generálás fut (BACKEND-NOTES 4.: 2 mp-enként javasolt).
 * A H2 progress-képernyő ezt hívja PÁRHUZAMOSAN a generateDeck() hívással (utóbbi a generálás
 * végéig nyitva tartja a HTTP kapcsolatot, a polling addig mutatja az élő progresst).
 */
export async function pollDeckProgress(deckId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("decks").select("*").eq("id", deckId).single();
  if (error) throw error;
  return adaptDeck(data);
}

/** create_room (ARCHITECTURE 3.2) */
export async function createRoom(
  deckId: string,
  settings: RoomSettings
): Promise<{ roomId: string; code: string; status: string }> {
  return invoke("create_room", { deckId, settings });
}

/** join_room (ARCHITECTURE 3.3) */
export async function joinRoom(
  code: string,
  name: string,
  color: string
): Promise<{ roomId: string; playerId: string; seatOrder: number; status: string }> {
  return invoke("join_room", { code, name, color });
}

/** start_game (ARCHITECTURE 3.4) — csak host hívhatja */
export async function startGame(
  roomId: string
): Promise<{ status: string; roundId: string; activePlayerId: string }> {
  return invoke("start_game", { roomId });
}

/** draw_card (ARCHITECTURE 3.5) — HOST-ONLY, player hívásra 403 (BACKEND-NOTES 7.) */
export async function drawCard(roomId: string): Promise<DrawCardResponse> {
  return invoke("draw_card", { roomId });
}

/** place_card (ARCHITECTURE 3.6) — csak az aktív játékos hívhatja */
export async function placeCard(
  roundId: string,
  position: number
): Promise<{ phase: string; stealDeadline: string | null }> {
  return invoke("place_card", { roundId, position });
}

/** resolve_round (ARCHITECTURE 3.8) — HOST-ONLY, player hívásra 403 (BACKEND-NOTES 7.) */
export async function resolveRound(roundId: string) {
  return invoke<{ phase: string; outcome: string; revealedCard: unknown }>("resolve_round", {
    roundId,
  });
}

/** next_turn (ARCHITECTURE 3.9) — host hívja ~5 mp reveal után */
export async function nextTurn(roomId: string) {
  return invoke<
    | { next: "draw"; roundId: string }
    | { next: "finished"; winnerPlayerIds: string[] }
  >("next_turn", { roomId });
}

/** reconnect (ARCHITECTURE 3.10 / 7.2 / BACKEND-NOTES 3.) */
export async function reconnect(code: string) {
  return invoke<{
    roomId: string;
    role: "host" | "player";
    status: string;
    currentRoundId: string | null;
    playerId?: string;
  }>("reconnect", { code });
}

/** leave_room (BACKEND-NOTES 3.) */
export async function leaveRoom(roomId: string) {
  return invoke<{ ok: true }>("leave_room", { roomId });
}

/** get_timeline RPC (BACKEND-NOTES 2. — RPC, NEM view, az A4 döntés alapján). */
export async function getTimeline(roomId: string): Promise<TimelineCardPublic[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_timeline", { p_room_id: roomId });
  if (error) throw error;
  return (data ?? []).map(adaptTimelineCard);
}

/** rooms tábla SELECT (RLS: is_room_member) — a room state refetch-hez broadcast után. */
export async function fetchRoom(roomId: string): Promise<Room> {
  const client = getSupabaseClient();
  const { data, error } = await client.from("rooms").select("*").eq("id", roomId).single();
  if (error) throw error;
  return adaptRoom(data);
}

/** players tábla SELECT (RLS: is_room_member) — lobby-lista / host H4. */
export async function fetchPlayers(roomId: string): Promise<Player[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(adaptPlayer);
}

/** round_public VIEW SELECT — SOHA a rounds táblát (anti-leak, BACKEND-NOTES 7.). */
export async function fetchRoundPublic(roundId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("round_public").select("*").eq("id", roundId).single();
  if (error) throw error;
  return data;
}
