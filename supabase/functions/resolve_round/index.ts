// resolve_round — ARCHITECTURE.md 3.8
// Caller: host / server-internal only (players never call this — they only
// read the outcome via the round_public view after reveal).
// THIS IS THE CRITICAL ANTI-LEAK MOMENT (2.6): phase='reveal' and
// revealed_card are written in the SAME update, so there is no window where
// phase says "reveal" but the data isn't there yet (or vice versa).

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

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
    .select('id, room_id, card_id, active_player_id, phase, placement, placing_deadline')
    .eq('id', body.roundId)
    .single();

  if (roundError || !round) return errorResponse('round_not_found', 'A kör nem található.', 404);

  const { data: room } = await supabase.from('rooms').select('host_uid').eq('id', round.room_id).single();
  if (!room || room.host_uid !== callerUid) {
    return errorResponse('not_host', 'Csak a host zárhatja le a kört.', 403);
  }

  if (!['playing', 'placing', 'stealing'].includes(round.phase)) {
    return errorResponse('phase_conflict', 'A kör már le van zárva.', 409);
  }

  // D6: if there's no placement and the deadline hasn't actually passed yet,
  // reject early timeout claims — the server, not the host client, is the
  // source of truth on timing (A2).
  const deadlinePassed = round.placing_deadline ? new Date(round.placing_deadline).getTime() <= Date.now() : true;
  if (round.placement === null && !deadlinePassed) {
    return errorResponse('deadline_not_reached', 'Az időlimit még nem járt le.', 409);
  }

  const { data: card, error: cardError } = await supabase
    .from('deck_cards')
    .select('id, title, artist, year, artwork_url')
    .eq('id', round.card_id)
    .single();

  if (cardError || !card) return errorResponse('card_not_found', 'A kártya nem található.', 500);

  // Fetch the active player's current timeline, ordered by position.
  const { data: timeline, error: timelineError } = await supabase
    .from('timeline_cards')
    .select('id, position, card_id')
    .eq('player_id', round.active_player_id)
    .order('position', { ascending: true });

  if (timelineError || !timeline) return errorResponse('db_error', 'Nem sikerült az idővonal lekérdezése.', 500);

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

  // Single UPDATE writing phase + outcome + revealed_card together (2.6: no leak window).
  const { data: updatedRound, error: updateError } = await supabase
    .from('rounds')
    .update({ phase: 'reveal', outcome, revealed_card: revealedCard })
    .eq('id', body.roundId)
    .in('phase', ['playing', 'placing', 'stealing'])
    .select()
    .maybeSingle();

  if (updateError) return errorResponse('db_error', 'Nem sikerült a kör lezárása.', 500);
  if (!updatedRound) return errorResponse('phase_conflict', 'A kör már le lett zárva közben.', 409);

  // S12: if correct, the card joins the timeline at the placed position,
  // shifting later cards. If wrong/timeout, it's simply discarded (F1, no steal).
  if (outcome === 'correct' && round.placement !== null) {
    // Shift existing cards at/after the placement position to make room.
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

  return jsonResponse({ phase: 'reveal', outcome, revealedCard });
});

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
