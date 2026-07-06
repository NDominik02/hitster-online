// cleanup_old_rooms - deletes every room older than 10 hours.
//
// Intended for pg_cron/pg_net, authenticated with the service-role key in the
// Authorization bearer header. Deleting rooms cascades players, rounds, and
// timeline_cards; decks and deck_cards are intentionally kept.

import { adminClient } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse } from '../_shared/cors.ts';

const ROOM_TTL_HOURS = 10;
const BATCH_LIMIT = 200;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return errorResponse('unauthorized', undefined, 401);
  }

  const supabase = adminClient();
  const cutoff = new Date(Date.now() - ROOM_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const { data: oldRooms, error: selectError } = await supabase
    .from('rooms')
    .select('id')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (selectError) return errorResponse('db_error', 'Nem sikerult a regi szobak lekerdezese.', 500);

  const roomIds = (oldRooms ?? []).map((room: { id: string }) => room.id);
  if (roomIds.length === 0) {
    return jsonResponse({ ok: true, deletedRooms: 0, cutoff });
  }

  // rooms.current_round_id points back to rounds. The FK is ON DELETE SET NULL,
  // but clearing it first avoids any circular-delete surprises across clients.
  const { error: clearError } = await supabase
    .from('rooms')
    .update({ current_round_id: null })
    .in('id', roomIds);
  if (clearError) return errorResponse('db_error', 'Nem sikerult a regi szobak elo-keszitese torleshez.', 500);

  const { error: deleteError } = await supabase.from('rooms').delete().in('id', roomIds);
  if (deleteError) return errorResponse('db_error', 'Nem sikerult a regi szobak torlese.', 500);

  return jsonResponse({ ok: true, deletedRooms: roomIds.length, cutoff });
});
