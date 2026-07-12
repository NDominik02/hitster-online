// set_presence — ARCHITECTURE.md 11.6.6 (F2-D9, supporting piece for S25
// auto-skip). A lightweight mutation that writes the SERVER-SIDE
// players.connected flag, which next_turn's auto-skip loop reads (AC25.7:
// "nem bízik egyetlen kliens jelzésében sem" — the decision to skip is
// server-driven, based on this persisted column, not a live client signal
// at skip-time).
//
// Caller: the HOST client only. The host observes Supabase Realtime
// Presence for every player in the room (heartbeat/leave events) and, when
// a player's presence has been missing for the 15s timeout (F2-D9), calls
// this function to flip players.connected = false for that player. When
// the player's presence reappears, the host calls this again with
// connected = true (this mirrors/duplicates what reconnect() already does
// for the player's OWN reconnect call, but set_presence lets the HOST
// react immediately from presence events without waiting for that specific
// player to itself call reconnect — e.g. a background tab that never
// re-invokes reconnect but whose Presence heartbeat resumes).
//
// Why the host and not each player writing their own row: RLS on `players`
// only allows service-role writes via Edge Functions anyway (CLAUDE.md —
// no direct client writes to game tables), and centralizing this on the
// host avoids N players each needing their own authenticated call for a
// value that's really "am I still being heard from" — the host is already
// the just aggregation point for Presence in this architecture (D8: only
// the host mirrors live drag state, not player-to-player).
//
// This function deliberately does NOT require the caller to BE the
// affected player — the host reports on behalf of others. Authorization is
// simply "caller must be this room's host".

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { roomId?: string; playerId?: string; connected?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.roomId || !body.playerId || typeof body.connected !== 'boolean') {
    return errorResponse('invalid_request', 'Hiányzó szoba, játékos vagy állapot.', 400);
  }

  const supabase = adminClient();

  const { data: room } = await supabase.from('rooms').select('id, host_uid').eq('id', body.roomId).single();
  if (!room || room.host_uid !== callerUid) {
    return errorResponse('not_host', 'Csak a host frissítheti a jelenlét-állapotot.', 403);
  }

  const { data: player, error: updateError } = await supabase
    .from('players')
    .update({ connected: body.connected, last_seen_at: new Date().toISOString() })
    .eq('id', body.playerId)
    .eq('room_id', body.roomId)
    .is('kicked_at', null)
    .select('id, connected')
    .maybeSingle();

  if (updateError) return errorResponse('db_error', 'Nem sikerült a jelenlét frissítése.', 500);
  if (!player) return errorResponse('player_not_found', 'A játékos nem található ebben a szobában.', 404);

  return jsonResponse({ ok: true, playerId: player.id, connected: player.connected });
});
