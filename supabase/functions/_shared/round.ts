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

// ---------------------------------------------------------------------------
// resolveRound — ARCHITECTURE.md 3.8, the critical anti-leak reveal step.
//
// Extracted so BOTH the host-triggered path (resolve_round Edge Function)
// and the server-side safety net (auto_resolve_expired_rounds, pg_cron) run
// the EXACT same evaluation/outcome/timeline logic. There must never be two
// implementations of "how a round resolves" that could drift apart.
//
// Concurrency: the caller decides whether the deadline-check applies (the
// host path always requires deadlinePassed when placement is null; the cron
// path only ever looks at rounds whose deadline has already passed, since
// that's the WHERE clause it queries with — see auto_resolve_expired_rounds).
// The actual protection against double-processing is the optimistic lock in
// the final UPDATE ... WHERE phase IN (...) below: whichever caller's UPDATE
// lands first flips the phase to 'reveal' and the other gets 0 rows back
// (ResolveRoundResult.conflict = true), matching the pre-existing pattern in
// place_card / resolve_round's original optimistic lock.
// ---------------------------------------------------------------------------

export interface ResolveRoundResult {
  ok: boolean;
  conflict?: boolean; // 0 rows updated — round was already resolved elsewhere (race, handled)
  error?: string;
  phase?: 'reveal';
  outcome?: 'correct' | 'wrong' | 'timeout';
  revealedCard?: { title: string; artist: string; year: number; artworkUrl: string | null };
}

// Resolves a single round: evaluates the placement, writes phase='reveal' +
// outcome + revealed_card in one UPDATE (2.6: no leak window), and — if
// correct — inserts the card into the active player's timeline.
//
// `requireDeadlinePassed`: when true (host path), a null placement is only
// accepted as a timeout if the deadline has actually lapsed server-side
// (D6/A2 — the host cannot fake an early timeout). The cron path always
// queries only rounds whose deadline has already passed, so it does not need
// this guard, but passes true anyway defensively.
export async function resolveRound(
  supabase: SupabaseClient,
  roundId: string,
  opts: { requireDeadlinePassed?: boolean } = {}
): Promise<ResolveRoundResult> {
  const requireDeadlinePassed = opts.requireDeadlinePassed ?? true;

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, room_id, card_id, active_player_id, phase, placement, placing_deadline')
    .eq('id', roundId)
    .single();

  if (roundError || !round) return { ok: false, error: 'round_not_found' };

  if (!['playing', 'placing', 'stealing'].includes(round.phase)) {
    return { ok: false, error: 'phase_conflict' };
  }

  const deadlinePassed = round.placing_deadline ? new Date(round.placing_deadline).getTime() <= Date.now() : true;
  if (round.placement === null && requireDeadlinePassed && !deadlinePassed) {
    return { ok: false, error: 'deadline_not_reached' };
  }

  const { data: card, error: cardError } = await supabase
    .from('deck_cards')
    .select('id, title, artist, year, artwork_url')
    .eq('id', round.card_id)
    .single();

  if (cardError || !card) return { ok: false, error: 'card_not_found' };

  // Fetch the active player's current timeline, ordered by position.
  const { data: timeline, error: timelineError } = await supabase
    .from('timeline_cards')
    .select('id, position, card_id')
    .eq('player_id', round.active_player_id)
    .order('position', { ascending: true });

  if (timelineError || !timeline) return { ok: false, error: 'db_error' };

  const timelineYears: number[] = [];
  if (timeline.length > 0) {
    const cardIds = timeline.map((t: { card_id: string }) => t.card_id);
    const { data: timelineCardData } = await supabase.from('deck_cards').select('id, year').in('id', cardIds);
    const yearById = new Map((timelineCardData ?? []).map((c: { id: string; year: number }) => [c.id, c.year]));
    for (const t of timeline) timelineYears.push(yearById.get(t.card_id) as number);
  }

  let outcome: 'correct' | 'wrong' | 'timeout';
  if (round.placement === null) {
    outcome = 'timeout'; // D6: no finalized placement when the deadline lapsed
  } else {
    outcome = evaluatePlacement(round.placement, card.year, timelineYears) ? 'correct' : 'wrong';
  }

  const revealedCard = {
    title: card.title,
    artist: card.artist,
    year: card.year,
    artworkUrl: card.artwork_url,
  };

  // Single UPDATE writing phase + outcome + revealed_card together (2.6: no
  // leak window). The `in('phase', [...])` clause is the optimistic lock:
  // this is what makes it safe for the host path and the cron path to race
  // — only one of them will affect a row.
  const { data: updatedRound, error: updateError } = await supabase
    .from('rounds')
    .update({ phase: 'reveal', outcome, revealed_card: revealedCard })
    .eq('id', roundId)
    .in('phase', ['playing', 'placing', 'stealing'])
    .select()
    .maybeSingle();

  if (updateError) return { ok: false, error: 'db_error' };
  if (!updatedRound) return { ok: false, conflict: true, error: 'phase_conflict' };

  // S12: if correct, the card joins the timeline at the placed position,
  // shifting later cards. If wrong/timeout, it's simply discarded (F1, no steal).
  if (outcome === 'correct' && round.placement !== null) {
    const toShift = timeline.filter((t: { position: number }) => t.position >= round.placement!);
    for (const t of toShift.sort((a: { position: number }, b: { position: number }) => b.position - a.position)) {
      await supabase
        .from('timeline_cards')
        .update({ position: t.position + 1 })
        .eq('id', t.id);
    }
    await supabase.from('timeline_cards').insert({
      player_id: round.active_player_id,
      card_id: card.id,
      position: round.placement,
      is_start: false,
      placed_round_no: null,
    });
  }

  return { ok: true, phase: 'reveal', outcome, revealedCard };
}

// S12/S13: a placement at index `pos` is correct if the card's year fits
// between its neighbors on the (pre-insertion) timeline. Equal-year
// neighbors count as correct on both sides (S13 tie-smoothing).
function evaluatePlacement(pos: number, year: number, timelineYears: number[]): boolean {
  const left = pos > 0 ? timelineYears[pos - 1] : null;
  const right = pos < timelineYears.length ? timelineYears[pos] : null;

  if (left !== null && year < left) return false;
  if (right !== null && year > right) return false;
  return true;
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
