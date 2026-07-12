// reconnect - room-code based host/player resume.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Ervenytelen keres.', 400);
  }
  const code = (body.code ?? '').toUpperCase().trim();
  if (!code || code.length !== 4) return errorResponse('invalid_code', 'Ervenytelen szobakod.', 400);

  const supabase = adminClient();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, status, current_round_id')
    .eq('code', code)
    .neq('status', 'finished')
    .maybeSingle();

  if (roomError || !room) return errorResponse('room_not_found', 'Nem talalhato ilyen kodu szoba.', 404);

  const { data: hostRoom } = await supabase
    .from('rooms')
    .select('id')
    .eq('id', room.id)
    .eq('host_uid', callerUid)
    .maybeSingle();

  if (hostRoom) {
    return jsonResponse({
      roomId: room.id,
      role: 'host',
      status: room.status,
      currentRoundId: room.current_round_id,
    });
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', room.id)
    .eq('auth_uid', callerUid)
    .maybeSingle();

  if (playerError) return errorResponse('db_error', 'Hiba a lekerdezes kozben.', 500);
  if (!player) return errorResponse('not_a_member', 'Ehhez a szobahoz meg nem csatlakoztal.', 404);
  if (player.kicked_at) return errorResponse('player_kicked', 'A host eltavolitott ebbol a szobabol.', 403);

  await supabase
    .from('players')
    .update({ connected: true, last_seen_at: new Date().toISOString() })
    .eq('id', player.id);

  return jsonResponse({
    roomId: room.id,
    role: 'player',
    playerId: player.id,
    seatOrder: player.seat_order,
    status: room.status,
    currentRoundId: room.current_round_id,
  });
});
