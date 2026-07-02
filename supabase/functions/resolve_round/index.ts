// resolve_round — ARCHITECTURE.md 3.8
// Caller: host / server-internal only (players never call this — they only
// read the outcome via the round_public view after reveal).
// THIS IS THE CRITICAL ANTI-LEAK MOMENT (2.6): phase='reveal' and
// revealed_card are written in the SAME update, so there is no window where
// phase says "reveal" but the data isn't there yet (or vice versa).
//
// The actual evaluation/outcome/reveal logic lives in _shared/round.ts
// (resolveRound) — shared with auto_resolve_expired_rounds (the pg_cron
// safety net, DECISIONS.md A2) so the two paths can never diverge on the
// result for the same round. This file is now just: auth + host-only
// authorization + calling the shared function + translating its result to
// an HTTP response.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { resolveRound } from '../_shared/round.ts';

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
    .select('id, room_id')
    .eq('id', body.roundId)
    .single();

  if (roundError || !round) return errorResponse('round_not_found', 'A kör nem található.', 404);

  const { data: room } = await supabase.from('rooms').select('host_uid').eq('id', round.room_id).single();
  if (!room || room.host_uid !== callerUid) {
    return errorResponse('not_host', 'Csak a host zárhatja le a kört.', 403);
  }

  // D6/A2: the host cannot fake an early timeout — resolveRound rejects a
  // null placement unless the server-computed deadline has actually passed.
  const result = await resolveRound(supabase, body.roundId, { requireDeadlinePassed: true });

  if (!result.ok) {
    if (result.error === 'deadline_not_reached') {
      return errorResponse('deadline_not_reached', 'Az időlimit még nem járt le.', 409);
    }
    if (result.error === 'phase_conflict' || result.conflict) {
      return errorResponse('phase_conflict', 'A kör már le van zárva.', 409);
    }
    if (result.error === 'round_not_found') {
      return errorResponse('round_not_found', 'A kör nem található.', 404);
    }
    if (result.error === 'card_not_found') {
      return errorResponse('card_not_found', 'A kártya nem található.', 500);
    }
    return errorResponse('db_error', 'Nem sikerült a kör lezárása.', 500);
  }

  return jsonResponse({ phase: result.phase, outcome: result.outcome, revealedCard: result.revealedCard });
});
