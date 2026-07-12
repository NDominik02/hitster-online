// place_card — ARCHITECTURE.md 3.6, bővítve F2.1-ben (11.3.3)
// Caller: the active player only. This is the ONLY writer of rounds.placement
// (AC9.3: the client never writes the table directly).
//
// F2 CHANGE FROM F1 (important for the Frontend — see docs/BACKEND-NOTES.md):
// place_card now writes a REAL steal_deadline (now()+15s, AC22.1) and the
// 'stealing' phase is no longer a 0-second pass-through. Callers must NOT
// immediately call resolve_round after a successful place_card response
// anymore — they must wait for stealDeadline to elapse (or for the server to
// close the window via the pg_cron safety net) before resolve_round will
// succeed. Calling resolve_round before stealDeadline now returns
// 409 steal_window_open.
//
// nameGuess (F2-D1, S21) is optional and — if present — is written verbatim
// (unevaluated) into rounds.name_guess in the SAME update as the placement.
// It is NEVER evaluated here: evaluateGuess() only ever runs inside
// resolveRound (anti-leak, 11.9 #1) — place_card doesn't even read
// deck_cards, so it has no way to check correctness even if it wanted to.
//
// REDESIGN (2026-07-06, playtest feedback): yearGuess is a third, fully
// optional field alongside artistGuess/titleGuess — the player may guess the
// track's release year for an extra +1 token (up to 3/round total), scored
// independently of the other two fields (see _shared/steal.ts evaluateGuess).

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

const STEAL_WINDOW_SEC = 15; // AC22.1

interface NameGuessInput {
  artistGuess?: string;
  titleGuess?: string;
  yearGuess?: string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { roundId?: string; position?: number; nameGuess?: NameGuessInput };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.roundId || typeof body.position !== 'number') {
    return errorResponse('invalid_request', 'Hiányzó kör vagy pozíció.', 400);
  }

  const supabase = adminClient();

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, room_id, active_player_id, phase')
    .eq('id', body.roundId)
    .single();

  if (roundError || !round) return errorResponse('round_not_found', 'A kör nem található.', 404);

  const { data: activePlayer } = await supabase
    .from('players')
    .select('auth_uid')
    .eq('id', round.active_player_id)
    .is('kicked_at', null)
    .single();

  if (!activePlayer || activePlayer.auth_uid !== callerUid) {
    return errorResponse('not_your_turn', 'Nem te vagy soron.', 403);
  }

  // AC21.2: nameGuess is optional. If present, stash it raw — the three
  // *Correct fields are filled in later by resolveRound, never here.
  let nameGuessRow: {
    artistGuess: string;
    titleGuess: string;
    yearGuess?: string;
    titleCorrect: null;
    artistCorrect: null;
    yearCorrect: null;
    createdAt: string;
  } | null = null;
  if (body.nameGuess && (body.nameGuess.artistGuess || body.nameGuess.titleGuess || body.nameGuess.yearGuess)) {
    nameGuessRow = {
      artistGuess: body.nameGuess.artistGuess ?? '',
      titleGuess: body.nameGuess.titleGuess ?? '',
      ...(body.nameGuess.yearGuess ? { yearGuess: body.nameGuess.yearGuess } : {}),
      titleCorrect: null,
      artistCorrect: null,
      yearCorrect: null,
      createdAt: new Date().toISOString(),
    };
  }

  const stealDeadline = new Date(Date.now() + STEAL_WINDOW_SEC * 1000).toISOString();

  // Optimistic lock: only succeeds if the round is still in a placeable phase.
  const { data: updated, error: updateError } = await supabase
    .from('rounds')
    .update({
      placement: body.position,
      phase: 'stealing',
      steal_deadline: stealDeadline,
      ...(nameGuessRow ? { name_guess: nameGuessRow } : {}),
    })
    .eq('id', body.roundId)
    .in('phase', ['playing', 'placing'])
    .select()
    .maybeSingle();

  if (updateError) return errorResponse('db_error', 'Nem sikerült a lerakás mentése.', 500);
  if (!updated) return errorResponse('phase_conflict', 'A kör már lezárult vagy lerakás megtörtént.', 409);

  return jsonResponse({ phase: updated.phase, stealDeadline: updated.steal_deadline });
});
