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
import type {
  CoverageExcludedTrack,
  Deck,
  DeckCardPreviewPage,
  DrawCardResponse,
  Player,
  PlayerGameStats,
  Room,
  RoundPhase,
  RoomSettings,
  TimelineCardPublic,
} from "../game/types";

export type ReadyNextRoundResponse = {
  ok: true;
  readyPlayerIds: string[];
  waitingPlayerIds: string[];
  allReady: boolean;
  advance?:
    | { ok: true; next: "draw"; roundId: string; activePlayerId?: string; skipped?: string[] }
    | { ok: true; next: "finished"; winnerPlayerIds: string[]; stats?: PlayerGameStats[] }
    | { ok: true; next: "paused"; reason: string };
};

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let payload: { messageHu?: string; error?: string } | null = null;
      try {
        payload = await error.context.json();
      } catch {
        // body nem parse-olható JSON-ként — visszaesünk az eredeti hibára
      }
      if (payload?.messageHu || payload?.error) {
        throw new Error(payload.messageHu || payload.error);
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
export async function generateDeck(
  playlistUrl: string,
  options?: {
    playlistUrls?: string[];
    sourceKey?: string;
    deckName?: string;
    audioPipeline?: "spotify_only" | "verified_audio";
  }
): Promise<{ deckId: string }> {
  return invoke<{ deckId: string; status: string; message?: string }>("generate_deck", {
    playlistUrl,
    ...(options?.playlistUrls ? { playlistUrls: options.playlistUrls } : {}),
    ...(options?.sourceKey ? { sourceKey: options.sourceKey } : {}),
    ...(options?.deckName ? { deckName: options.deckName } : {}),
    ...(options?.audioPipeline ? { audioPipeline: options.audioPipeline } : {}),
  });
}

/** Egyszeri lekérdezés a decks tábláról (RLS: publikus, anonim saját vagy Spotify-fiókhoz tartozó). */
export async function pollDeckProgress(deckId: string): Promise<Deck> {
  const client = getSupabaseClient();
  const { data, error } = await client.from("decks").select("*").eq("id", deckId).single();
  if (error) throw error;
  return adaptDeck(data);
}

/**
 * A mentett paklik könyvtára a csatlakoztatott Spotify-fiókhoz tartozik. A
 * spotify_owner_id szűrés és az RLS együtt biztosítja, hogy a publikus, de nem
 * saját paklik csak az Ajánlott nézetben jelenjenek meg.
 */
export async function listDecks(spotifyUserId: string, limit = 30): Promise<Deck[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("decks")
    .select("*")
    .eq("status", "ready")
    .eq("spotify_owner_id", spotifyUserId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(adaptDeck);
}

export async function listFeaturedDecks(limit = 30): Promise<Deck[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("decks")
    .select("*")
    .eq("status", "ready")
    .eq("is_public", true)
    .contains("report", { featured: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(adaptDeck);
}

/** Saját, már nem használt pakli törlése a hozzá tartozó hangfájlokkal együtt. */
export async function deleteDeck(deckId: string): Promise<{ ok: true; mode?: "hidden" }> {
  return invoke("delete_deck", { deckId });
}

export async function listDeckCards(
  deckId: string,
  options?: { page?: number; pageSize?: number; query?: string }
): Promise<DeckCardPreviewPage> {
  return invoke("list_deck_cards", {
    deckId,
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 50,
    query: options?.query ?? "",
  });
}

export async function updateDeckCardYear(
  deckId: string,
  cardId: string,
  year: number
): Promise<{ ok: true; cardId: string; year: number; yearUncertain: boolean; uncertainYearCount?: number }> {
  return invoke("update_deck_card_year", { deckId, cardId, year });
}

export async function renameDeck(deckId: string, name: string): Promise<{ ok: true; name: string }> {
  return invoke("rename_deck", { deckId, name });
}

/** Ugyanaz a playlist-id kinyerő logika, mint a generate_deck Edge Function _shared/util.ts-ében. */
function parsePlaylistIdFromUrl(urlOrId: string): string | null {
  const m = urlOrId.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9]{10,30}$/.test(urlOrId)) return urlOrId;
  return null;
}

/**
 * "Ajánlott playlistek" (H1 gyorsválasztó, ld. lib/featuredPlaylists.ts) — mielőtt
 * elindítanánk egy új generálást, megnézzük, van-e már KÉSZ pakli ugyanerre a
 * playlistre (bárkitől, a decks RLS is_public szabálya miatt látható) — ha
 * igen, azt azonnal újrahasználjuk, generálás/várakozás nélkül.
 */
export async function findReadyDeckByPlaylistUrl(url: string): Promise<Deck | null> {
  const playlistId = parsePlaylistIdFromUrl(url);
  if (!playlistId) return null;
  return findReadyDeckBySourceKey(playlistId);
}

export async function findReadyDeckBySourceKey(sourceKey: string): Promise<Deck | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("decks")
    .select("*")
    .eq("source_playlist_id", sourceKey)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? adaptDeck(data) : null;
}

/**
 * Pollingozza a decks táblát ~2 mp-enként (BACKEND-NOTES 4. javaslat), amíg status 'ready' vagy
 * 'failed' nem lesz. Az onProgress callback minden pollingnál meghívódik a friss állapottal, hogy a
 * GenerationProgress komponens élőben frissülhessen.
 *
 * `maxWaitMs` — védőháló, ha a decks sor valamiért sosem érné el a ready/failed állapotot (pl. a
 * self-chaining batch-lánc megszakadt — ld. generate_deck invokeNextBatch jsdoc). 45 perc bőven
 * a legrosszabb eset (Premium-módú, 500 track-es, teljesen újragenerált pakli) fölött van.
 */
export async function pollDeckUntilReady(
  deckId: string,
  onProgress?: (deck: Deck) => void,
  intervalMs = 2000,
  maxWaitMs = 45 * 60 * 1000
): Promise<Deck> {
  const deadline = Date.now() + maxWaitMs;
  while (true) {
    const deck = await pollDeckProgress(deckId);
    onProgress?.(deck);
    if (deck.status === "ready" || deck.status === "failed") return deck;
    if (Date.now() >= deadline) {
      throw new Error("A pakli generálása túl sokáig tartott (időtúllépés). Próbáld újra.");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * create_room (ARCHITECTURE 3.2).
 *
 * S20/S30 — a `spotifyPlaybackMode` KÉRÉS csak egy szándék-jelzés a
 * kliens felől ("van csatlakoztatott Spotify-fiókom, próbáld a premium
 * módot"); a szerver a create_room-ban mindig újra ellenőrzi a
 * spotify_connections táblát, mielőtt ténylegesen bekapcsolná — a válasz
 * `spotifyPlaybackMode` mezője a TÉNYLEGESEN beállított értéket adja vissza.
 */
export async function createRoom(
  deckId: string,
  settings: RoomSettings & { spotifyPlaybackMode?: "preview" | "premium" }
): Promise<{ roomId: string; code: string; status: string; spotifyPlaybackMode: "preview" | "premium" }> {
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
 * gyűjtött előadó/cím a LERAKOM gombbal együtt megy fel egy hívásban (F2-D1). A place_card
 * Edge Function eltárolja a nameGuess-t (kiértékelés nélkül — az csak resolveRound-ban történik,
 * anti-leak) és ír egy valós `steal_deadline`-t (now()+15s) — ld. supabase/functions/place_card/index.ts.
 */
export async function placeCard(
  roundId: string,
  position: number,
  nameGuess?: { artistGuess: string; titleGuess: string; yearGuess?: string } | null
): Promise<{ phase: RoundPhase; stealDeadline: string | null }> {
  return invoke("place_card", {
    roundId,
    position,
    ...(nameGuess ? { nameGuess } : {}),
  });
}

/**
 * register_steal (ARCHITECTURE 11.6.1) — a REDESIGN (2026-07-03) óta `position` az AKTÍV
 * JÁTÉKOS idővonalán megjelölt rés, nem a stealer sajátján (ld. supabase/functions/register_steal
 * jsdoc-ja a teljes indoklásért). Kimenet sikeres levonás után a hátralévő tokenek + a kör
 * aktuális steal-darabszáma (a host UI élő "X-en lopnak" számlálója ehelyett a
 * `steal_registered` broadcast payload-jából dolgozik, nem ebből a válaszból).
 */
export async function registerSteal(
  roundId: string,
  position: number
): Promise<{ ok: true; tokensLeft: number; stealCount: number }> {
  return invoke("register_steal", { roundId, position });
}

/**
 * use_token (ARCHITECTURE 11.6.4). Két akció: `skip` (1 token, F2-D3 — szám átugrása lerakás
 * előtt) és `draw3` (3 token, F2-D4 — azonnali felfedett +1 kártya, a `position` a bemenetben
 * kötelező ehhez az ághoz).
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
 * vitagomb). A tulaj kérésére: a bemondás (S21) automatikus kiértékelésének eredménye (helyes/
 * helytelen) manuálisan felülbírálható, ha a társaság közösen úgy dönt, hogy egy beírt érték
 * elfogadható (vagy visszavonandó). REDESIGN (2026-07-06): cím/előadó/évszám EGYMÁSTÓL FÜGGETLENÜL
 * pontozott, ezért itt is mezőnként (`field`) hívható a felülbírálás. A szerver a token-egyenleget
 * is ennek megfelelően módosítja (+1 ha helytelenből helyesre vált, -1 fordítva); ha már a kért
 * állapotban van, nincs token-hatás.
 */
export async function overrideGuess(
  roundId: string,
  field: "title" | "artist" | "year",
  correct: boolean
): Promise<{ ok: true; field: string; correct: boolean; tokensChanged: boolean; tokensLeft?: number }> {
  return invoke("override_guess", { roundId, field, correct });
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

export async function readyNextRound(roomId: string, roundId: string): Promise<ReadyNextRoundResponse> {
  return invoke<ReadyNextRoundResponse>("ready_next_round", { roomId, roundId });
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

export async function kickPlayer(
  roomId: string,
  playerId: string
): Promise<{ ok: true; playerId: string; kickedAt?: string; alreadyKicked?: boolean; roundResolved?: boolean; roundId?: string | null }> {
  return invoke("kick_player", { roomId, playerId });
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

/**
 * S41 (F4, statisztikák) — a parti végén (rooms.status='finished') a `rounds`
 * teljes történetéből számol játékosonkénti összesítőt. Direkt SELECT a
 * `rounds` táblán (RLS: rounds_member_select — is_room_member), nincs
 * anti-leak aggály: mire ez meghívódik, a parti már véget ért, minden kör
 * reveal-je megtörtént. Nincs Edge Function, mert nincs mutáció — tiszta
 * kliens-oldali aggregáció már látható adatokon.
 */
export async function computeGameStats(roomId: string): Promise<PlayerGameStats[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("rounds")
    .select("active_player_id, outcome, steals, name_guess")
    .eq("room_id", roomId);
  if (error) throw error;

  const byPlayer = new Map<string, PlayerGameStats>();
  const ensure = (playerId: string): PlayerGameStats => {
    let stats = byPlayer.get(playerId);
    if (!stats) {
      stats = { playerId, correctPlacements: 0, wrongPlacements: 0, timeouts: 0, successfulSteals: 0, correctGuesses: 0 };
      byPlayer.set(playerId, stats);
    }
    return stats;
  };

  for (const round of data ?? []) {
    const active = ensure(round.active_player_id);
    if (round.outcome === "correct") active.correctPlacements++;
    else if (round.outcome === "wrong") active.wrongPlacements++;
    else if (round.outcome === "timeout") active.timeouts++;

    // REDESIGN (2026-07-06): cím/előadó/évszám egymástól függetlenül pontozott — a
    // correctGuesses itt az összes eltalált MEZŐT számolja (nem csak a köröket), hiszen
    // egy körben akár 3 külön találat is lehet.
    const nameGuess = round.name_guess as {
      titleCorrect?: boolean | null;
      artistCorrect?: boolean | null;
      yearCorrect?: boolean | null;
    } | null;
    if (nameGuess) {
      if (nameGuess.titleCorrect) active.correctGuesses++;
      if (nameGuess.artistCorrect) active.correctGuesses++;
      if (nameGuess.yearCorrect) active.correctGuesses++;
    }

    const steals = (round.steals ?? []) as Array<{ playerId: string; won: boolean | null }>;
    for (const steal of steals) {
      if (steal.won) ensure(steal.playerId).successfulSteals++;
    }
  }

  return Array.from(byPlayer.values());
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
    .is("kicked_at", null)
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

/**
 * spotify_oauth_callback (S30) — a /host/spotify/callback oldal hívja, a
 * Spotify redirectből kapott `code`-dal + a PKCE code_verifier-rel. Nincs
 * roomId — a kapcsolat a hívó auth.uid()-jéhez kötött, nem egy szobához.
 */
export async function spotifyOauthCallback(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{
  connected: true;
  spotifyUserId: string;
  displayName: string | null;
  product: string | null;
  accessToken: string;
  expiresAt: string;
}> {
  return invoke("spotify_oauth_callback", { code, codeVerifier, redirectUri });
}

/** spotify_refresh_token (S30) — friss access token a hívó saját Spotify-kapcsolatára. */
export async function spotifyRefreshToken(): Promise<{
  accessToken: string;
  expiresAt: string;
  spotifyUserId: string;
  displayName: string | null;
  product: string | null;
}> {
  return invoke("spotify_refresh_token", {});
}

export async function spotifyDisconnect(): Promise<{ ok: true }> {
  return invoke("spotify_disconnect", {});
}

/** spotify_list_devices (S20) — a hívó Spotify Connect-eszközei (Connect API-s eszközválasztóhoz). */
export async function spotifyListDevices(): Promise<{
  devices: Array<{ id: string; name: string; type: string; isActive: boolean }>;
}> {
  return invoke("spotify_list_devices", {});
}

/**
 * spotify_playback_command (S20) — play/pause/resume/volume a megadott Spotify Connect
 * device-on. "play" mindig a kör elejéről indít (position_ms:0); "resume" a
 * korábban megállított pozíciótól folytat (playtest feedback, 2026-07-06).
 */
export async function spotifyPlaybackCommand(
  action: "play" | "pause" | "resume" | "volume",
  deviceId: string,
  spotifyUri?: string,
  volumePercent?: number
): Promise<{ ok: true }> {
  return invoke("spotify_playback_command", { action, deviceId, spotifyUri, volumePercent });
}

/**
 * add_manual_year_card (playtest feedback, 2026-07-06) — a "nincs évszám" miatt kimaradt,
 * de audio-forrással rendelkező trackhez a host utólag megadja a helyes évet a riport
 * képernyőn; a szerver ekkor letölti/feltölti a hangot és kártyaként hozzáadja a paklihoz.
 */
export async function addManualYearCard(
  deckId: string,
  trackIndex: number,
  year: number
): Promise<{
  ok: true;
  usableCount: number;
  coveragePct: number;
  meetsMinimum: boolean;
  spotifyOnlyCount?: number;
  excluded: CoverageExcludedTrack[];
}> {
  return invoke("add_manual_year_card", { deckId, trackIndex, year });
}
