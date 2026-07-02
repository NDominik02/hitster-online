// reconnect — ARCHITECTURE.md 3.10 + 7.
// Caller: player (or host, using the room code they created).
// Looks up an existing players row by (room, auth_uid). No new row is ever
// created here (AC15.3: no duplicates) — if there's no existing player, the
// client is told to go through join_room instead.

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
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  const code = (body.code ?? '').toUpperCase().trim();
  if (!code || code.length !== 4) return errorResponse('invalid_code', 'Érvénytelen szobakód.', 400);

  const supabase = adminClient();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, status, current_round_id')
    .eq('code', code)
    .neq('status', 'finished')
    .maybeSingle();

  if (roomError || !room) return errorResponse('room_not_found', 'Nem található ilyen kódú szoba.', 404);

  // Is the caller the host?
  const { data: hostRoom } = await supabase.from('rooms').select('id').eq('id', room.id).eq('host_uid', callerUid).maybeSingle();

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

  if (playerError) return errorResponse('db_error', 'Hiba a lekérdezés közben.', 500);
  if (!player) return errorResponse('not_a_member', 'Ehhez a szobához még nem csatlakoztál.', 404);

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
