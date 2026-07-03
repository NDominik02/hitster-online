// override_guess — host-only manual correction for the automatic bemondás
// (name-guess) evaluation. Requested by the tulaj: alongside the existing
// dispute_round "wrong year" override, the host+players may mutually agree
// that a guess the automatic fuzzy-matcher (evaluateGuess, GUESS_THRESHOLD
// 0.85) marked wrong should actually count (or, symmetrically, that a guess
// it accepted was too lenient) — this lets the host flip that single call
// either direction without invalidating the whole round.
//
// Caller: host ONLY, and only while the round is still in 'reveal' phase
// (same window as dispute_round — before next_turn moves on).
//
// Effect: sets round.name_guess.correct AND the player-visible
// revealed_card.guess.correct to the requested value, and adjusts the
// active player's token balance by the delta (+1 if flipping to correct,
// -1 if flipping to incorrect, 0/no-op if already at the requested value).
// If the round later gets disputed (dispute_round), that function's own
// refund logic reads round.name_guess.correct — since this function updates
// that field, a subsequent dispute clawback stays correct without any
// changes needed there.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import type { NameGuess } from '../_shared/steal.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { roundId?: string; correct?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.roundId || typeof body.correct !== 'boolean') {
    return errorResponse('invalid_request', 'Hiányzó kör vagy döntés.', 400);
  }

  const supabase = adminClient();

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, room_id, phase, active_player_id, name_guess, revealed_card')
    .eq('id', body.roundId)
    .single();

  if (roundError || !round) return errorResponse('round_not_found', 'A kör nem található.', 404);

  const { data: room } = await supabase.from('rooms').select('id, host_uid').eq('id', round.room_id).single();
  if (!room || room.host_uid !== callerUid) {
    return errorResponse('not_host', 'Csak a host módosíthatja a bemondás eredményét.', 403);
  }

  if (round.phase !== 'reveal') {
    return errorResponse('not_overridable', 'Csak a felfedés fázisban lévő kör bemondása módosítható.', 409);
  }

  const nameGuess: NameGuess | null = (round.name_guess ?? null) as NameGuess | null;
  if (!nameGuess) {
    return errorResponse('no_guess', 'Ebben a körben nem volt bemondás.', 409);
  }

  const previousCorrect = nameGuess.correct === true;
  const nextCorrect = body.correct;

  if (previousCorrect === nextCorrect) {
    // Already at the requested state — idempotent no-op, no token change.
    return jsonResponse({ ok: true, correct: nextCorrect, tokensChanged: false });
  }

  const updatedNameGuess: NameGuess = { ...nameGuess, correct: nextCorrect };
  const revealedCard = (round.revealed_card ?? {}) as Record<string, unknown>;
  const updatedRevealedCard = {
    ...revealedCard,
    guess: { correct: nextCorrect, byPlayerId: round.active_player_id },
  };

  // Optimistic lock: only while still in 'reveal' — a race with next_turn
  // (which flips reveal->done) must not silently apply a stale override.
  const { data: updated, error: updateError } = await supabase
    .from('rounds')
    .update({ name_guess: updatedNameGuess, revealed_card: updatedRevealedCard })
    .eq('id', body.roundId)
    .eq('phase', 'reveal')
    .select('id')
    .maybeSingle();

  if (updateError) return errorResponse('db_error', 'Nem sikerült a bemondás módosítása.', 500);
  if (!updated) return errorResponse('already_advanced', 'A kör már továbblépett, nem módosítható.', 409);

  const delta = nextCorrect ? 1 : -1;
  const { data: newBalance, error: adjustError } = await supabase.rpc('adjust_tokens', {
    p_player_id: round.active_player_id,
    p_delta: delta,
  });

  if (adjustError) {
    // Roll back the guess-correctness flip so the DB doesn't diverge from
    // the token balance — restore the previous state.
    await supabase
      .from('rounds')
      .update({ name_guess: nameGuess, revealed_card: round.revealed_card })
      .eq('id', body.roundId);
    return errorResponse('db_error', 'Nem sikerült a token módosítása.', 500);
  }
  if (newBalance === null || newBalance === undefined) {
    // Token balance would go negative (flipping correct->incorrect on a
    // player who has since spent the token elsewhere) — roll back the flip.
    await supabase
      .from('rounds')
      .update({ name_guess: nameGuess, revealed_card: round.revealed_card })
      .eq('id', body.roundId);
    return errorResponse('insufficient_tokens', 'A játékosnak már nincs elég tokenje a visszavonáshoz.', 409);
  }

  return jsonResponse({ ok: true, correct: nextCorrect, tokensChanged: true, tokensLeft: newBalance });
});
