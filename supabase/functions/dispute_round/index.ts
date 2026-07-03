// dispute_round — ARCHITECTURE.md 11.6.5 (S24, the host "wrong year" button).
// Caller: host ONLY (AC24.1). Only valid while the round is still in
// 'reveal' phase, before next_turn has moved on (AC24.2/F2-D8).
//
// Effect (AC24.3/AC24.4 — F2-A4): the round is invalidated as if it never
// happened — the card is discarded (deck_cursor already advanced past it,
// so it can never be drawn again, per 11.1.4), any name-guess reward
// already credited in resolveRound is clawed back, any card already
// inserted into a timeline (the active player's correct placement OR a
// steal-winner's) is removed and the timeline re-indexed, and every steal's
// spent token is refunded. Net token change across all players from this
// round: 0.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import type { StealEntry, NameGuess } from '../_shared/steal.ts';
import { getNextPlayerId, drawCard, checkWinnersAndFinish, finishByDeckExhaustion } from '../_shared/round.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { roundId?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.roundId) return errorResponse('invalid_round', 'Hiányzó kör azonosító.', 400);

  const supabase = adminClient();

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, room_id, phase, outcome, placement, active_player_id, card_id, steals, name_guess, round_no')
    .eq('id', body.roundId)
    .single();

  if (roundError || !round) return errorResponse('round_not_found', 'A kör nem található.', 404);

  const { data: room } = await supabase.from('rooms').select('id, host_uid').eq('id', round.room_id).single();
  if (!room || room.host_uid !== callerUid) {
    return errorResponse('not_host', 'Csak a host érvénytelenítheti a kört.', 403);
  }

  // AC24.2: only reveal-phase rounds are disputable, and only rounds that
  // actually went through a normal resolve (correct/wrong/timeout) — skip
  // (use_token) rounds have no reveal, and draw3 rounds ARE disputable
  // (they reach phase='reveal' too — 11.6.5's closing note explicitly says
  // "a draw3 reveal-je diszputálható marad").
  if (round.phase !== 'reveal') {
    return errorResponse('not_disputable', 'Csak a felfedés fázisban lévő kör érvényteleníthető.', 409);
  }

  // Optimistic lock: claim the round before doing any refunds/removals, so a
  // race with next_turn (which flips reveal->done) can never double-process.
  const { data: claimed, error: claimError } = await supabase
    .from('rounds')
    .update({ phase: 'done', outcome: 'disputed' })
    .eq('id', body.roundId)
    .eq('phase', 'reveal')
    .select()
    .maybeSingle();

  if (claimError) return errorResponse('db_error', 'Nem sikerült a kör érvénytelenítése.', 500);
  if (!claimed) return errorResponse('already_advanced', 'A kör már továbblépett, nem érvényteleníthető.', 409);

  const refunded: Array<{ playerId: string; amount: number }> = [];

  // AC24.4 (a): refund every steal's spent token, regardless of correct/won.
  const steals: StealEntry[] = (round.steals ?? []) as StealEntry[];
  for (const entry of steals) {
    await supabase.rpc('adjust_tokens', { p_player_id: entry.playerId, p_delta: 1 });
    refunded.push({ playerId: entry.playerId, amount: 1 });
  }

  // AC24.4 (c) / F2-A4: claw back the name-guess +1 reward if resolveRound
  // already credited it (name_guess.correct === true).
  const nameGuess: NameGuess | null = (round.name_guess ?? null) as NameGuess | null;
  if (nameGuess && nameGuess.correct === true) {
    await supabase.rpc('adjust_tokens', { p_player_id: round.active_player_id, p_delta: -1 });
    refunded.push({ playerId: round.active_player_id, amount: -1 });
  }

  // AC24.4 (d) / F2-A4: undo any timeline insertion this round caused —
  // either the active player's own correct placement, or a steal-winner's.
  // Both cases insert exactly one timeline_cards row for this card_id; find
  // it (there's at most one, since a card can only ever be placed once) and
  // remove it, then re-index everything after it back down by one.
  const { data: insertedRow } = await supabase
    .from('timeline_cards')
    .select('id, player_id, position')
    .eq('card_id', round.card_id)
    .maybeSingle();

  if (insertedRow) {
    await supabase.from('timeline_cards').delete().eq('id', insertedRow.id);

    const { data: laterRows } = await supabase
      .from('timeline_cards')
      .select('id, position')
      .eq('player_id', insertedRow.player_id)
      .gt('position', insertedRow.position)
      .order('position', { ascending: true });

    for (const row of laterRows ?? []) {
      await supabase
        .from('timeline_cards')
        .update({ position: row.position - 1 })
        .eq('id', row.id);
    }
  }

  // AC24.5/F2-D8: move on to the NEXT player (does not repeat the disputed
  // player's turn) — mirrors next_turn's own advance-and-draw logic. We
  // don't call the next_turn Edge Function itself (that would re-check
  // room.current_round_id against a round we just set to 'done' ourselves,
  // which is fine, but duplicating the win-check/advance/draw sequence
  // in-process keeps this atomic within a single function invocation and
  // avoids an extra HTTP round-trip).
  const winCheck = await checkWinnersAndFinish(supabase, room.id);
  if (winCheck.finished) {
    return jsonResponse({ ok: true, outcome: 'disputed', refunded, next: 'finished', winnerPlayerIds: winCheck.winnerPlayerIds });
  }

  const nextPlayerId = await getNextPlayerId(supabase, room.id, round.active_player_id);
  if (!nextPlayerId) return errorResponse('no_players', 'Nincsenek játékosok.', 500);

  const draw = await drawCard(supabase, room.id, nextPlayerId);
  if (!draw.ok) return errorResponse('draw_failed', 'Nem sikerült kártyát húzni.', 500);

  if (draw.deckExhausted) {
    const result = await finishByDeckExhaustion(supabase, room.id);
    return jsonResponse({ ok: true, outcome: 'disputed', refunded, next: 'finished', winnerPlayerIds: result.winnerPlayerIds });
  }

  return jsonResponse({ ok: true, outcome: 'disputed', refunded, next: 'draw', roundId: draw.roundId });
});
