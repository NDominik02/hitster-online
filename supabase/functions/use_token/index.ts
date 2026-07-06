// use_token — ARCHITECTURE.md 11.6.4. Two actions, both spent by the active
// player at the START of their own turn (F2-D3/F2-D4):
//   - "skip"  (1 token, AC20.5): discard the current mystery card, draw a
//     new one, same player continues with it.
//   - "draw3" (3 tokens, AC20.6/F2-D4): draw a REVEALED card that replaces
//     the mystery draw entirely (not an addition to it) and place it
//     immediately, no music/timer.
//
// Caller: the active player only, in 'playing' phase, before any placement.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { drawCard, evaluatePlacement, pickRandomUnusedDeckCard } from '../_shared/round.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { roundId?: string; action?: string; position?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.roundId) return errorResponse('invalid_round', 'Hiányzó kör azonosító.', 400);
  if (body.action !== 'skip' && body.action !== 'draw3') {
    return errorResponse('invalid_action', 'Ismeretlen művelet.', 400);
  }

  const supabase = adminClient();

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, room_id, active_player_id, phase, placement')
    .eq('id', body.roundId)
    .single();

  if (roundError || !round) return errorResponse('round_not_found', 'A kör nem található.', 404);

  const { data: activePlayer } = await supabase
    .from('players')
    .select('id, auth_uid, tokens')
    .eq('id', round.active_player_id)
    .single();

  if (!activePlayer || activePlayer.auth_uid !== callerUid) {
    return errorResponse('not_your_turn', 'Nem te vagy soron.', 403);
  }

  // F2-D3/F2-D4: only at the START of the active player's own turn — phase
  // must still be 'playing' (mystery card drawn, music running) and no
  // placement has been made yet.
  if (round.phase !== 'playing' || round.placement !== null) {
    return errorResponse('not_turn_start', 'Ez a művelet csak a köröd elején elérhető.', 409);
  }

  if (body.action === 'skip') {
    return handleSkip(supabase, round, activePlayer);
  }
  return handleDraw3(supabase, round, activePlayer, body.position);
});

async function handleSkip(
  supabase: ReturnType<typeof adminClient>,
  round: { id: string; room_id: string; active_player_id: string },
  activePlayer: { id: string; tokens: number }
): Promise<Response> {
  // AC20.5/F2-D3: 1 token, no per-round limit (the 2 starting tokens are the
  // natural scarcity — F2-D3).
  const { data: newBalance, error: adjustError } = await supabase.rpc('adjust_tokens', {
    p_player_id: activePlayer.id,
    p_delta: -1,
  });
  if (adjustError) return errorResponse('db_error', 'Nem sikerült a token levonása.', 500);
  if (newBalance === null || newBalance === undefined) {
    return errorResponse('insufficient_tokens', 'Nincs elég tokened az átugráshoz.', 409);
  }

  // Close out the current mystery round with no card outcome (not a
  // dispute, not a timeout — simply skipped) under the same optimistic lock
  // used everywhere else in the phase machine.
  const { data: closedRound, error: closeError } = await supabase
    .from('rounds')
    .update({ phase: 'done' })
    .eq('id', round.id)
    .eq('phase', 'playing')
    .select()
    .maybeSingle();

  if (closeError) {
    await supabase.rpc('adjust_tokens', { p_player_id: activePlayer.id, p_delta: 1 });
    return errorResponse('db_error', 'Nem sikerült a kör lezárása.', 500);
  }
  if (!closedRound) {
    await supabase.rpc('adjust_tokens', { p_player_id: activePlayer.id, p_delta: 1 });
    return errorResponse('phase_conflict', 'A kör időközben megváltozott.', 409);
  }

  // F2-D3: same player, new card — drawCard() creates a fresh rounds row
  // and advances room.deck_cursor exactly like a normal turn would.
  const draw = await drawCard(supabase, round.room_id, activePlayer.id);
  if (!draw.ok) {
    if (draw.deckExhausted) {
      return jsonResponse({ action: 'skip', deckExhausted: true, tokensLeft: newBalance });
    }
    return errorResponse('draw_failed', 'Nem sikerült új kártyát húzni.', 500);
  }

  // F2-A1: audioUrl is host-only (D7). use_token is called by the PLAYER,
  // so we deliberately withhold audioUrl here even though drawCard()
  // resolved one — the host retrieves it the normal way (a draw_card call,
  // which re-issues the signed URL for the room's current_round_id, exactly
  // like reconnect/refresh already does).
  return jsonResponse({
    action: 'skip',
    roundId: draw.roundId,
    roundNo: draw.roundNo,
    placingDeadline: draw.placingDeadline,
    tokensLeft: newBalance,
  });
}

async function handleDraw3(
  supabase: ReturnType<typeof adminClient>,
  round: { id: string; room_id: string; active_player_id: string },
  activePlayer: { id: string; tokens: number },
  position: number | undefined
): Promise<Response> {
  // AC20.6: position is required — the card is revealed, so the player
  // places it immediately as part of this same call.
  if (typeof position !== 'number') {
    return errorResponse('position_required', 'Meg kell adnod a kártya helyét.', 400);
  }

  const { data: newBalance, error: adjustError } = await supabase.rpc('adjust_tokens', {
    p_player_id: activePlayer.id,
    p_delta: -3,
  });
  if (adjustError) return errorResponse('db_error', 'Nem sikerült a token levonása.', 500);
  if (newBalance === null || newBalance === undefined) {
    return errorResponse('insufficient_tokens', 'Nincs elég tokened az azonnali kártyához.', 409);
  }

  // Close out the current mystery round the same way as skip (F2-D4: draw3
  // REPLACES the mystery draw, it doesn't run alongside it).
  const { data: closedRound, error: closeError } = await supabase
    .from('rounds')
    .update({ phase: 'done' })
    .eq('id', round.id)
    .eq('phase', 'playing')
    .select()
    .maybeSingle();

  if (closeError || !closedRound) {
    await supabase.rpc('adjust_tokens', { p_player_id: activePlayer.id, p_delta: 3 });
    return closeError
      ? errorResponse('db_error', 'Nem sikerült a kör lezárása.', 500)
      : errorResponse('phase_conflict', 'A kör időközben megváltozott.', 409);
  }

  // F2-A3: draw3 gets its OWN rounds row, created already revealed — pull
  // the next card off the deck cursor directly (no signed audio URL, no
  // placing_deadline: this is a face-up, immediate-placement draw).
  const { data: room } = await supabase.from('rooms').select('id, deck_id, deck_cursor').eq('id', round.room_id).single();
  if (!room) {
    await supabase.rpc('adjust_tokens', { p_player_id: activePlayer.id, p_delta: 3 });
    return errorResponse('room_not_found', 'A szoba nem található.', 404);
  }

  const pick = await pickRandomUnusedDeckCard<{
    id: string;
    title: string;
    artist: string;
    year: number;
    artwork_url: string | null;
  }>(supabase, room, 'id, title, artist, year, artwork_url');
  if (!pick.ok) {
    await supabase.rpc('adjust_tokens', { p_player_id: activePlayer.id, p_delta: 3 });
    return errorResponse('draw_failed', 'Nem sikerült kártyát húzni.', 500);
  }
  if ('deckExhausted' in pick) {
    await supabase.rpc('adjust_tokens', { p_player_id: activePlayer.id, p_delta: 3 });
    return jsonResponse({ action: 'draw3', deckExhausted: true, tokensLeft: newBalance });
  }

  const card = pick.card;

  const { count: roundCount } = await supabase
    .from('rounds')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', round.room_id);
  const roundNo = (roundCount ?? 0) + 1;

  // AC20.6: evaluate the placement immediately — the card is face-up, the
  // player already saw it before choosing `position`, so this is NOT an
  // anti-leak violation (11.6.4: "a draw3 szándékosan felfedett húzás").
  const { data: timeline } = await supabase
    .from('timeline_cards')
    .select('id, position, card_id')
    .eq('player_id', activePlayer.id)
    .order('position', { ascending: true });

  const timelineRows = timeline ?? [];
  const timelineYears: number[] = [];
  if (timelineRows.length > 0) {
    const cardIds = timelineRows.map((t: { card_id: string }) => t.card_id);
    const { data: timelineCardData } = await supabase.from('deck_cards').select('id, year').in('id', cardIds);
    const yearById = new Map((timelineCardData ?? []).map((c: { id: string; year: number }) => [c.id, c.year]));
    for (const t of timelineRows) timelineYears.push(yearById.get(t.card_id) as number);
  }

  const placementCorrect = evaluatePlacement(position, card.year, timelineYears);
  const outcome = placementCorrect ? 'correct' : 'wrong';

  const revealedCard = {
    title: card.title,
    artist: card.artist,
    year: card.year,
    artworkUrl: card.artwork_url,
    guess: null,
    steals: [] as unknown[],
  };

  const { data: newRound, error: roundInsertError } = await supabase
    .from('rounds')
    .insert({
      room_id: round.room_id,
      round_no: roundNo,
      card_id: card.id,
      active_player_id: activePlayer.id,
      phase: 'reveal',
      placement: position,
      outcome,
      revealed_card: revealedCard,
    })
    .select()
    .single();

  if (roundInsertError || !newRound) {
    await supabase.rpc('adjust_tokens', { p_player_id: activePlayer.id, p_delta: 3 });
    return errorResponse('round_insert_failed', 'Nem sikerült az azonnali kör létrehozása.', 500);
  }

  await supabase
    .from('rooms')
    .update({ deck_cursor: pick.nextCursor, current_round_id: newRound.id, updated_at: new Date().toISOString() })
    .eq('id', round.room_id);

  // AC20.6: correct → the card joins the timeline; wrong → it's lost, and
  // the 3 tokens are NOT refunded (adjust_tokens already deducted them and
  // stays deducted — no compensating call here).
  if (placementCorrect) {
    const toShift = timelineRows.filter((t: { position: number }) => t.position >= position);
    for (const t of toShift.sort((a: { position: number }, b: { position: number }) => b.position - a.position)) {
      await supabase
        .from('timeline_cards')
        .update({ position: t.position + 1 })
        .eq('id', t.id);
    }
    await supabase.from('timeline_cards').insert({
      player_id: activePlayer.id,
      card_id: card.id,
      position,
      is_start: false,
      placed_round_no: roundNo,
    });
  }

  return jsonResponse({
    action: 'draw3',
    roundId: newRound.id,
    outcome,
    revealedCard,
    tokensLeft: newBalance,
    phase: 'reveal',
  });
}
