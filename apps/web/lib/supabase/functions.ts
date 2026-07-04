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

/**
 * generate_deck (BACKEND-NOTES 4. — MÓDOSÍTVA 2026-07-02, aszinkron self-chaining batch-ekben fut).
 *
 * A HTTP hívás MOST MÁR AZONNAL (~1-2 mp) visszatér `{ deckId, status: 'generating' }`-vel — a
 * régi válasz (totalTracks/usableCount/stb.) NINCS többé ebben a válaszban. A tényleges feldolgozás
 * a szerveren self-chaining batch-ekben fut a 150 mp-es Edge Function wall-clock limit miatt, és
 * percekig tarthat (60-100 track-es playlisteknél 1-4 perc). A hívó oldalnak a `pollDeckUntilReady`
 * segédfüggvényt kell használnia a `generateDeck` visszatérése UTÁN, NEM szabad szinkron várni.
 */
export async function generateDeck(playlistUrl: string): Promise<{ deckId: string }> {
  return invoke<{ deckId: string; status: string; message?: string }>("generate_deck", { playlistUrl });
}

/** Egyszeri lekérdezés a decks tábláról (RLS: owner_id = auth.uid() vagy is_public). */
export async function pollDeckProgress(deckId: string): Promise<Deck> {
  const client = getSupabaseClient();
  const { data, error } = await client.from("decks").select("*").eq("id", deckId).single();
  if (error) throw error;
  return adaptDeck(data);
}

/**
 * Pollingozza a decks táblát ~2 mp-enként (BACKEND-NOTES 4. javaslat), amíg status 'ready' vagy
 * 'failed' nem lesz. Az onProgress callback minden pollingnál meghívódik a friss állapottal, hogy a
 * GenerationProgress komponens élőben frissülhessen.
 */
export async function pollDeckUntilReady(
  deckId: string,
  onProgress?: (deck: Deck) => void,
  intervalMs = 2000
): Promise<Deck> {
  while (true) {
    const deck = await pollDeckProgress(deckId);
    onProgress?.(deck);
    if (deck.status === "ready" || deck.status === "failed") return deck;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
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

/**
 * place_card (ARCHITECTURE 3.6 / 11.3.3) — csak az aktív játékos hívhatja.
 *
 * F2-bővítés (ARCHITECTURE 11.3.3): opcionális `nameGuess` — a "Bemondom!" kapcsoló alatt
 * gyűjtött előadó/cím a LERAKOM gombbal együtt megy fel egy hívásban (F2-D1). A Backend
 * `place_card` Edge Function-je a jelen (2026-07-03-i) állapotában MÉG NEM fogadja el ezt a
 * mezőt és MÉG NEM ír `steal_deadline`-t (ld. supabase/functions/place_card/index.ts — a UPDATE
 * csak `placement`/`phase`-t állít). A hívás emiatt jelenleg ártalmatlanul figyelmen kívül
 * hagyja a nameGuess-t (a Function egyszerűen nem olvassa a mezőt), és a válasz
 * `stealDeadline: null` lesz — a hívó oldal (host steal-ablak logika) ezt defenzíven kezeli:
 * null deadline esetén F1-szerűen azonnal resolve-ol. Amint a Backend bővíti a Function-t
 * (ARCHITECTURE 11.3.3 szerint), ez a wrapper módosítás nélkül helyesen fog működni.
 */
export async function placeCard(
  roundId: string,
  position: number,
  nameGuess?: { artistGuess: string; titleGuess: string } | null
): Promise<{ phase: string; stealDeadline: string | null }> {
  return invoke("place_card", {
    roundId,
    position,
    ...(nameGuess ? { nameGuess } : {}),
  });
}

/**
 * register_steal (ARCHITECTURE 11.6.1) — TODO F2: a szerveroldali Edge Function még nem
 * létezik (nincs supabase/functions/register_steal/ mappa a Backend agent munkája
 * befejezéséig). Ez a wrapper a végleges I/O-szerződést követi (ARCHITECTURE 11.6.1), hogy a
 * StealButton komponens és a host steal-ablak UI a szerződés ellen épülhessen már most —
 * amint a Backend deployolja a Function-t, ez a hívás módosítás nélkül működni fog.
 *
 * Bemenet: a stealer SAJÁT idővonalán megjelölt rés (position). Kimenet sikeres levonás után
 * a hátralévő tokenek + a kör aktuális steal-darabszáma (host UI "X-en lopnak" számlálóhoz —
 * de ezt jelenleg a `steal_registered` broadcast payload-ja adja, nem ez a válasz feltétlenül).
 */
export async function registerSteal(
  roundId: string,
  position: number
): Promise<{ ok: true; tokensLeft: number; stealCount: number }> {
  return invoke("register_steal", { roundId, position });
}

/**
 * use_token (ARCHITECTURE 11.6.4) — TODO F2: a szerveroldali Edge Function még nem létezik.
 * Két akció: `skip` (1 token, F2-D3 — szám átugrása lerakás előtt) és `draw3` (3 token,
 * F2-D4 — azonnali felfedett +1 kártya, a `position` a bemenetben kötelező ehhez az ághoz).
 */
export async function useToken(
  roundId: string,
  action: "skip"
): Promise<{
  action: "skip";
  roundId: string;
  roundNo: number;
  audioUrl?: string;
  placingDeadline: string;
  tokensLeft: number;
}>;
export async function useToken(
  roundId: string,
  action: "draw3",
  position: number
): Promise<{
  action: "draw3";
  outcome: string;
  revealedCard: unknown;
  tokensLeft: number;
  phase: string;
}>;
export async function useToken(
  roundId: string,
  action: "skip" | "draw3",
  position?: number
): Promise<Record<string, unknown>> {
  return invoke("use_token", {
    roundId,
    action,
    ...(action === "draw3" ? { position } : {}),
  });
}

/**
 * dispute_round — ÚJRATERVEZVE 2026-07-04 (F2-D12, ld. supabase/functions/dispute_round/index.ts
 * jsdoc a teljes indoklásért). HOST-ONLY, csak `phase='reveal'` alatt hívható. A host megadja a
 * szám TÉNYLEGES évét (`correctedYear`) — a szerver ez ellen újraértékeli a kört (kié legyen a
 * kártya), frissíti a megjelenített évet, DE a kör MARAD reveal fázisban és NEM lép tovább
 * automatikusan — a host a megszokott "Következő kör" gombbal halad tovább ezután.
 */
export async function disputeRound(
  roundId: string,
  correctedYear: number
): Promise<{ ok: true; outcome: "correct" | "wrong"; revealedCard: unknown }> {
  return invoke("dispute_round", { roundId, correctedYear });
}

/**
 * override_guess — HOST-ONLY, csak `phase='reveal'` alatt hívható (ugyanaz az ablak, mint a
 * vitagomb). A tulaj kérésére: a bemondás (S21) automatikus fuzzy-matching eredménye (helyes/
 * helytelen) manuálisan felülbírálható, ha a társaság közösen úgy dönt, hogy a beírt cím/előadó
 * elfogadható (vagy visszavonandó). A szerver a token-egyenleget is ennek megfelelően módosítja
 * (+1 ha helytelenből helyesre vált, -1 fordítva); ha már a kért állapotban van, nincs token-hatás.
 */
export async function overrideGuess(
  roundId: string,
  correct: boolean
): Promise<{ ok: true; correct: boolean; tokensChanged: boolean; tokensLeft?: number }> {
  return invoke("override_guess", { roundId, correct });
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
    | { next: "draw"; roundId: string; activePlayerId?: string; skipped?: string[] }
    | { next: "finished"; winnerPlayerIds: string[] }
    | { next: "paused"; reason: string }
  >("next_turn", { roomId });
}

/**
 * set_presence (ARCHITECTURE 11.6.6, F2-D9) — HOST-ONLY. A host figyeli a Supabase Realtime
 * Presence-t minden játékosra, és amikor valakinek a jelenléte ~15 mp-ig hiányzik, ezt hívja
 * `connected: false`-szal — a `next_turn` auto-skip logikája ezt a szerveroldali flaget nézi,
 * NEM egy élő kliens-jelzést (AC25.7). Amikor a jelenlét visszatér, `connected: true`-val
 * ugyanez hívandó.
 */
export async function setPresence(
  roomId: string,
  playerId: string,
  connected: boolean
): Promise<{ ok: true; playerId: string; connected: boolean }> {
  return invoke("set_presence", { roomId, playerId, connected });
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
