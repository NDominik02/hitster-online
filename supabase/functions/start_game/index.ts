// start_game — ARCHITECTURE.md 3.4
// Caller: host only. Deals starting cards (S7), flips rooms.status to
// 'playing', then draws the first round.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { drawCard } from '../_shared/round.ts';

const MIN_PLAYERS = 2; // D5

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { roomId?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.roomId) return errorResponse('invalid_room', 'Hiányzó szoba azonosító.', 400);

  const supabase = adminClient();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, host_uid, status, deck_id, deck_cursor')
    .eq('id', body.roomId)
    .single();

  if (roomError || !room) return errorResponse('room_not_found', 'A szoba nem található.', 404);
  if (room.host_uid !== callerUid) return errorResponse('not_host', 'Csak a host indíthatja a játékot.', 403);
  if (room.status !== 'lobby') return errorResponse('room_not_in_lobby', 'A játék már elindult.', 409);

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, seat_order')
    .eq('room_id', room.id)
    .is('kicked_at', null)
    .order('seat_order', { ascending: true });

  if (playersError || !players) return errorResponse('db_error', 'Nem sikerült a játékosok lekérdezése.', 500);
  if (players.length < MIN_PLAYERS) {
    return errorResponse('not_enough_players', `Legalább ${MIN_PLAYERS} játékos szükséges az induláshoz.`, 409);
  }

  const { data: deckCards, error: cardsError } = await supabase
    .from('deck_cards')
    .select('id')
    .eq('deck_id', room.deck_id)
    .order('sort_seed', { ascending: true });

  if (cardsError || !deckCards || deckCards.length < players.length) {
    return errorResponse('deck_too_small', 'A pakli nem elég nagy az induláshoz.', 422);
  }

  // S7: deal one revealed starting card per player from a fresh shuffled order.
  let cursor = 0;
  const shuffledDeckCards = shuffle(deckCards);
  const startingCardRows = players.map((p: { id: string }) => {
    const card = shuffledDeckCards[cursor];
    cursor++;
    return { player_id: p.id, card_id: card.id, position: 0, is_start: true };
  });

  const { error: timelineInsertError } = await supabase.from('timeline_cards').insert(startingCardRows);
  if (timelineInsertError) return errorResponse('db_error', 'Nem sikerült a kezdőkártyák kiosztása.', 500);

  const { error: updateError } = await supabase
    .from('rooms')
    .update({ status: 'playing', deck_cursor: cursor, updated_at: new Date().toISOString() })
    .eq('id', room.id);
  if (updateError) return errorResponse('db_error', 'Nem sikerült a szoba indítása.', 500);

  // AC20.1 (ARCHITECTURE.md 11.1.1): tokens are explicitly reset to 2 at the
  // Start moment, not just relied upon as the column default — this
  // guarantees no lobby-time drift can leak into the game (F2: nothing
  // moves tokens before Start anyway, but this makes the invariant explicit
  // and future-proof).
  await supabase
    .from('players')
    .update({ tokens: 2 })
    .eq('room_id', room.id)
    .is('kicked_at', null);

  const firstPlayerId = players[0].id;
  const draw = await drawCard(supabase, room.id, firstPlayerId);
  if (!draw.ok) return errorResponse('draw_failed', 'Nem sikerült az első kör indítása.', 500);

  return jsonResponse({
    status: 'playing',
    roundId: draw.roundId,
    activePlayerId: firstPlayerId,
  });
});
