// kick_player - host-only roster removal. Unlike connected/offline presence,
// this is an explicit game decision: kicked players are removed from future
// turn order and ready checks, but their existing timeline/history remains.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { resolveRound } from '../_shared/round.ts';

type RequestBody = {
  roomId?: string;
  playerId?: string;
};

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Ervenytelen keres.', 400);
  }
  if (!body.roomId || !body.playerId) return errorResponse('invalid_body', 'Hianyzo szoba vagy jatekos azonosito.', 400);

  const supabase = adminClient();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, host_uid, current_round_id, status')
    .eq('id', body.roomId)
    .single();
  if (roomError || !room) return errorResponse('room_not_found', 'A szoba nem talalhato.', 404);
  if (room.host_uid !== callerUid) return errorResponse('not_host', 'Csak a host tud jatekost kidobni.', 403);
  if (room.status === 'finished') return errorResponse('room_finished', 'A jatek mar veget ert.', 409);

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, room_id, kicked_at')
    .eq('id', body.playerId)
    .eq('room_id', room.id)
    .single();
  if (playerError || !player) return errorResponse('player_not_found', 'A jatekos nem talalhato.', 404);
  if (player.kicked_at) return jsonResponse({ ok: true, playerId: player.id, alreadyKicked: true });

  const kickedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('players')
    .update({ kicked_at: kickedAt, connected: false, last_seen_at: kickedAt })
    .eq('id', player.id);
  if (updateError) return errorResponse('db_error', 'Nem sikerult kidobni a jatekost.', 500);

  let roundResolved = false;
  let resolvedRoundId: string | null = null;
  if (room.current_round_id) {
    const { data: currentRound } = await supabase
      .from('rounds')
      .select('id, active_player_id, phase')
      .eq('id', room.current_round_id)
      .maybeSingle();

    if (
      currentRound &&
      currentRound.active_player_id === player.id &&
      ['playing', 'placing', 'stealing'].includes(currentRound.phase)
    ) {
      const resolved = await resolveRound(supabase, currentRound.id, { requireDeadlinePassed: false });
      if (resolved.ok) {
        roundResolved = true;
        resolvedRoundId = currentRound.id;
      }
    }
  }

  return jsonResponse({
    ok: true,
    playerId: player.id,
    kickedAt,
    roundResolved,
    roundId: resolvedRoundId,
  });
});
