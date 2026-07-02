// place_card — ARCHITECTURE.md 3.6
// Caller: the active player only. This is the ONLY writer of rounds.placement
// (AC9.3: the client never writes the table directly).
// F1: stealEnabled is always false, so the 'stealing' phase is a 0-second
// pass-through — the schema/phase machine supports it for F2 but nothing
// waits on it here.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { roundId?: string; position?: number };
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
    .single();

  if (!activePlayer || activePlayer.auth_uid !== callerUid) {
    return errorResponse('not_your_turn', 'Nem te vagy soron.', 403);
  }

  // Optimistic lock: only succeeds if the round is still in a placeable phase.
  const { data: updated, error: updateError } = await supabase
    .from('rounds')
    .update({ placement: body.position, phase: 'stealing' })
    .eq('id', body.roundId)
    .in('phase', ['playing', 'placing'])
    .select()
    .maybeSingle();

  if (updateError) return errorResponse('db_error', 'Nem sikerült a lerakás mentése.', 500);
  if (!updated) return errorResponse('phase_conflict', 'A kör már lezárult vagy lerakás megtörtént.', 409);

  return jsonResponse({ phase: updated.phase, stealDeadline: updated.steal_deadline });
});
