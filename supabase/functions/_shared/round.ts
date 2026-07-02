// Shared round/draw logic used by start_game, draw_card, and next_turn.
// Kept here so the "draw next card" behavior (ARCHITECTURE.md 3.5) is
// implemented once and reused, per CLAUDE.md ("the server is the source of
// truth" — one code path for mutating rounds/rooms).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface DrawResult {
  ok: boolean;
  deckExhausted?: boolean;
  roundId?: string;
  roundNo?: number;
  activePlayerId?: string;
  audioUrl?: string; // signed URL — ONLY ever returned to the host caller (D7/6.4)
  placingDeadline?: string;
  error?: string;
}

const SIGNED_URL_TTL_SEC = 60 * 5; // timeLimitSec (usually 90s) + buffer, capped generously at 5 min

// Draws the next card for a room and creates a new `rounds` row.
// `activePlayerId` must be resolved by the caller (start_game: first seat;
// next_turn: next seat in turn order).
export async function drawCard(
  supabase: SupabaseClient,
  roomId: string,
  activePlayerId: string
): Promise<DrawResult> {
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, deck_id, deck_cursor, settings, status')
    .eq('id', roomId)
    .single();

  if (roomError || !room) return { ok: false, error: 'room_not_found' };

  const { data: deckCards, error: cardsError } = await supabase
    .from('deck_cards')
    .select('id')
    .eq('deck_id', room.deck_id)
    .order('sort_seed', { ascending: true });

  if (cardsError || !deckCards) return { ok: false, error: 'deck_cards_fetch_failed' };

  if (room.deck_cursor >= deckCards.length) {
    return { ok: true, deckExhausted: true };
  }

  const card = deckCards[room.deck_cursor];

  const { count: roundCount } = await supabase
    .from('rounds')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId);

  const roundNo = (roundCount ?? 0) + 1;
  const timeLimitSec = (room.settings as any)?.timeLimitSec ?? 90;
  const placingDeadline = new Date(Date.now() + timeLimitSec * 1000).toISOString();

  const { data: newRound, error: roundError } = await supabase
    .from('rounds')
    .insert({
      room_id: roomId,
      round_no: roundNo,
      card_id: card.id,
      active_player_id: activePlayerId,
      phase: 'playing',
      placing_deadline: placingDeadline,
    })
    .select()
    .single();

  if (roundError || !newRound) return { ok: false, error: 'round_insert_failed' };

  await supabase
    .from('rooms')
    .update({ deck_cursor: room.deck_cursor + 1, current_round_id: newRound.id, updated_at: new Date().toISOString() })
    .eq('id', roomId);

  // D7/6.4: get the audio_url PATH from deck_cards (service-role bypasses RLS
  // here — this is the ONLY place the raw path is read) and issue a
  // short-lived signed URL. This response is only ever returned to the host.
  const { data: fullCard } = await supabase.from('deck_cards').select('audio_url').eq('id', card.id).single();

  let audioUrl: string | undefined;
  if (fullCard?.audio_url) {
    const { data: signed } = await supabase.storage
      .from('deck-audio')
      .createSignedUrl(fullCard.audio_url, SIGNED_URL_TTL_SEC);
    audioUrl = signed?.signedUrl;
  }

  return {
    ok: true,
    roundId: newRound.id,
    roundNo,
    activePlayerId,
    audioUrl,
    placingDeadline,
  };
}

// Resolves the game-end condition (D3 shared victory, AC16 deck exhaustion).
export async function checkWinnersAndFinish(
  supabase: SupabaseClient,
  roomId: string
): Promise<{ finished: boolean; winnerPlayerIds?: string[] }> {
  const { data: room } = await supabase.from('rooms').select('settings').eq('id', roomId).single();
  const winTarget = (room?.settings as any)?.winTarget ?? 10;

  const { data: players } = await supabase.from('players').select('id').eq('room_id', roomId);
  if (!players || players.length === 0) return { finished: false };

  const counts = await Promise.all(
    players.map(async (p: { id: string }) => {
      const { count } = await supabase
        .from('timeline_cards')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', p.id);
      return { playerId: p.id, count: count ?? 0 };
    })
  );

  const maxCount = Math.max(...counts.map((c) => c.count));
  if (maxCount >= winTarget) {
    const winners = counts.filter((c) => c.count === maxCount).map((c) => c.playerId);
    await supabase
      .from('rooms')
      .update({ status: 'finished', winner_player_ids: winners, updated_at: new Date().toISOString() })
      .eq('id', roomId);
    return { finished: true, winnerPlayerIds: winners };
  }

  return { finished: false };
}

// Deck-exhaustion game end (AC16): winner = longest timeline, ties share victory (D3).
export async function finishByDeckExhaustion(
  supabase: SupabaseClient,
  roomId: string
): Promise<{ winnerPlayerIds: string[] }> {
  const { data: players } = await supabase.from('players').select('id').eq('room_id', roomId);
  const counts = await Promise.all(
    (players ?? []).map(async (p: { id: string }) => {
      const { count } = await supabase
        .from('timeline_cards')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', p.id);
      return { playerId: p.id, count: count ?? 0 };
    })
  );

  const maxCount = counts.length > 0 ? Math.max(...counts.map((c) => c.count)) : 0;
  const winners = counts.filter((c) => c.count === maxCount).map((c) => c.playerId);

  await supabase
    .from('rooms')
    .update({ status: 'finished', winner_player_ids: winners, updated_at: new Date().toISOString() })
    .eq('id', roomId);

  return { winnerPlayerIds: winners };
}

// Turn order: next seat_order after the given player's, wrapping around.
export async function getNextPlayerId(supabase: SupabaseClient, roomId: string, currentPlayerId: string): Promise<string | null> {
  const { data: players } = await supabase
    .from('players')
    .select('id, seat_order')
    .eq('room_id', roomId)
    .order('seat_order', { ascending: true });

  if (!players || players.length === 0) return null;
  const idx = players.findIndex((p: { id: string }) => p.id === currentPlayerId);
  if (idx === -1) return players[0].id;
  return players[(idx + 1) % players.length].id;
}
