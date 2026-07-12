// next_turn — host-triggered turn advance. The mutation itself lives in the
// shared advanceRoomTurn helper so host clicks and all-player-ready advance use
// exactly the same server-side path.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { advanceRoomTurn } from '../_shared/advance_turn.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { roomId?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Ervenytelen keres.', 400);
  }
  if (!body.roomId) return errorResponse('invalid_room', 'Hianyzo szoba azonosito.', 400);

  const supabase = adminClient();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, host_uid')
    .eq('id', body.roomId)
    .single();

  if (roomError || !room) return errorResponse('room_not_found', 'A szoba nem talalhato.', 404);
  if (room.host_uid !== callerUid) return errorResponse('not_host', 'Csak a host leptetheti a kort.', 403);

  const result = await advanceRoomTurn(supabase, room.id);
  if (!result.ok) return errorResponse(result.error, result.messageHu, result.status);

  return jsonResponse(result);
});
