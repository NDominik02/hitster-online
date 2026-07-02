// leave_room — ARCHITECTURE.md 3.10
// Explicit leave (rare in F1); marks connected=false. Actual disconnect
// detection is Presence-based on the client side, not this function.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

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
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.roomId) return errorResponse('invalid_room', 'Hiányzó szoba azonosító.', 400);

  const supabase = adminClient();

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', body.roomId)
    .eq('auth_uid', callerUid)
    .maybeSingle();

  if (playerError) return errorResponse('db_error', 'Hiba a lekérdezés közben.', 500);
  if (!player) return errorResponse('not_a_member', 'Nem vagy tagja ennek a szobának.', 404);

  await supabase.from('players').update({ connected: false }).eq('id', player.id);

  return jsonResponse({ ok: true });
});
