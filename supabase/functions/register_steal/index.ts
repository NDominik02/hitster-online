// register_steal — ARCHITECTURE.md 11.6.1 (real implementation, replaces the
// F2-stub the F1 build intentionally shipped without — see docs/BACKEND-NOTES
// section 3, "register_steal szándékosan NINCS implementálva").
//
// Caller: any non-active player in the room (AC22.2 — you cannot steal from
// yourself), during the 15s steal window (AC22.1/AC22.3/AC22.4).
//
// REDESIGN (2026-07-03, tulaj request): `position` is now an index on the
// ACTIVE PLAYER's timeline (the same board they placed the card into,
// visible live via round_public.placement) — NOT the stealer's own
// timeline. Picking the exact same slot the active player already chose is
// rejected outright: it can never be a meaningful steal (if that slot is
// right, the active player already gets the card; if it's wrong, guessing
// the identical wrong slot is equally wrong).
//
// Anti-leak (AC22.10): the stealer only ever sends a POSITION on the active
// player's timeline — never anything about the hidden card itself. This
// function never reads deck_cards and never returns any correctness info;
// "were you right" is only ever knowable at reveal time (resolveRound).

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import type { StealEntry } from '../_shared/steal.ts';

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
  if (!body.roundId) return errorResponse('invalid_round', 'Hiányzó kör azonosító.', 400);
  if (typeof body.position !== 'number') {
    // AC22.4: position is mandatory — no steal without a marked gap.
    return errorResponse('position_required', 'Meg kell jelölnöd egy helyet az idővonaladon.', 400);
  }

  const supabase = adminClient();

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, room_id, active_player_id, phase, placement, steal_deadline, steals')
    .eq('id', body.roundId)
    .single();

  if (roundError || !round) return errorResponse('round_not_found', 'A kör nem található.', 404);

  // AC22.2: the caller must be a member player of this room, and NOT the
  // active player (can't steal from yourself). The host device has no
  // players row at all, so it naturally fails this lookup too.
  const { data: callerPlayer } = await supabase
    .from('players')
    .select('id, seat_order, auth_uid')
    .eq('room_id', round.room_id)
    .eq('auth_uid', callerUid)
    .is('kicked_at', null)
    .maybeSingle();

  if (!callerPlayer) return errorResponse('not_a_player', 'Csak a szoba játékosai lophatnak.', 403);
  if (callerPlayer.id === round.active_player_id) {
    return errorResponse('cannot_steal_self', 'A saját köröd nem lophatod meg.', 403);
  }

  // REDESIGN 2026-07-03: nem választhatod ugyanazt a rést, ahova a soron lévő már letette —
  // ha az helyes, úgyis ő kapja a kártyát, ha rossz, ugyanoda tippelni ugyanúgy rossz lenne.
  if (round.placement !== null && body.position === round.placement) {
    return errorResponse(
      'same_position',
      'Ugyanoda nem lophatsz, ahova már letette — válassz másik helyet.',
      400
    );
  }

  // AC22.1: only during 'stealing' phase, before steal_deadline.
  if (round.phase !== 'stealing') {
    return errorResponse('steal_window_closed', 'A lopási ablak nincs nyitva.', 409);
  }
  if (!round.steal_deadline || new Date(round.steal_deadline).getTime() <= Date.now()) {
    return errorResponse('steal_window_closed', 'A lopási ablak már lezárult.', 409);
  }

  // AC22.5: one steal per player per round.
  const existingSteals: StealEntry[] = (round.steals ?? []) as StealEntry[];
  if (existingSteals.some((s) => s.playerId === callerPlayer.id)) {
    return errorResponse('already_stole', 'Ebben a körben már loptál.', 409);
  }

  // AC22.3/AC20.4: deduct 1 token FIRST, atomically, via adjust_tokens.
  const { data: newBalance, error: adjustError } = await supabase.rpc('adjust_tokens', {
    p_player_id: callerPlayer.id,
    p_delta: -1,
  });

  if (adjustError) return errorResponse('db_error', 'Nem sikerült a token levonása.', 500);
  // adjust_tokens returns 0 rows (null/undefined data) when the balance
  // would go negative — that's the insufficient-tokens signal (11.4.2/AC20.7).
  if (newBalance === null || newBalance === undefined) {
    return errorResponse('insufficient_tokens', 'Nincs elég tokened a lopáshoz.', 409);
  }

  const newEntry: StealEntry = {
    playerId: callerPlayer.id,
    seatOrder: callerPlayer.seat_order,
    position: body.position,
    tokenSpent: true,
    correct: null,
    won: null,
    createdAt: new Date().toISOString(),
  };

  // Append under a phase+deadline+idempotency lock (11.6.1): if the round
  // moved on, or a duplicate/retry already appended this player's entry,
  // this UPDATE affects 0 rows and we must refund the token we just took.
  const { data: updated, error: updateError } = await supabase
    .from('rounds')
    .update({ steals: [...existingSteals, newEntry] })
    .eq('id', body.roundId)
    .eq('phase', 'stealing')
    .gt('steal_deadline', new Date().toISOString())
    .not('steals', 'cs', JSON.stringify([{ playerId: callerPlayer.id }]))
    .select('steals')
    .maybeSingle();

  if (updateError) {
    // Compensate: refund the token we deducted above, then report failure.
    await supabase.rpc('adjust_tokens', { p_player_id: callerPlayer.id, p_delta: 1 });
    return errorResponse('db_error', 'Nem sikerült a lopás rögzítése.', 500);
  }

  if (!updated) {
    // Window closed mid-flight, or a race produced a duplicate entry —
    // refund and report the appropriate error (11.6.1 compensation rule).
    await supabase.rpc('adjust_tokens', { p_player_id: callerPlayer.id, p_delta: 1 });

    // Re-check which case it was for a more precise error message.
    const { data: latestRound } = await supabase
      .from('rounds')
      .select('phase, steal_deadline, steals')
      .eq('id', body.roundId)
      .single();

    const latestSteals: StealEntry[] = (latestRound?.steals ?? []) as StealEntry[];
    if (latestSteals.some((s) => s.playerId === callerPlayer.id)) {
      return errorResponse('already_stole', 'Ebben a körben már loptál.', 409);
    }
    return errorResponse('steal_window_closed', 'A lopási ablak időközben lezárult.', 409);
  }

  const stealCount = (updated.steals as StealEntry[]).length;

  return jsonResponse({ ok: true, tokensLeft: newBalance, stealCount });
});
