// ready_next_round - player-side reveal confirmation. A host can still advance
// immediately via next_turn; players advance collectively when every active
// (not kicked) player has marked the current reveal round ready.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { advanceRoomTurn } from '../_shared/advance_turn.ts';
import { computeGameStats } from '../_shared/game_stats.ts';

type RequestBody = {
  roomId?: string;
  roundId?: string;
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
  if (!body.roomId || !body.roundId) return errorResponse('invalid_body', 'Hianyzo szoba vagy kor azonosito.', 400);

  const supabase = adminClient();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, status, current_round_id')
    .eq('id', body.roomId)
    .single();
  if (roomError || !room) return errorResponse('room_not_found', 'A szoba nem talalhato.', 404);
  if (room.status !== 'playing') return errorResponse('room_not_playing', 'A jatek nincs folyamatban.', 409);
  if (room.current_round_id !== body.roundId) return errorResponse('stale_round', 'Ez mar nem az aktualis kor.', 409);

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', room.id)
    .eq('auth_uid', callerUid)
    .is('kicked_at', null)
    .maybeSingle();
  if (playerError) return errorResponse('db_error', 'Nem sikerult a jatekos ellenorzese.', 500);
  if (!player) return errorResponse('not_player', 'Csak a szoba jatekosai jelezhetnek kesz allapotot.', 403);

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, phase, next_ready_player_ids')
    .eq('id', body.roundId)
    .eq('room_id', room.id)
    .single();
  if (roundError || !round) return errorResponse('round_not_found', 'A kor nem talalhato.', 404);
  if (round.phase !== 'reveal') return errorResponse('round_not_ready', 'Csak felfedes utan lehet tovabblepest jelezni.', 409);

  const { data: readyIds, error: readyError } = await supabase.rpc('mark_next_round_ready', {
    p_round_id: round.id,
    p_player_id: player.id,
  });
  if (readyError) return errorResponse('db_error', 'Nem sikerult menteni a kesz allapotot.', 500);

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', room.id)
    .is('kicked_at', null);
  if (playersError || !players) return errorResponse('db_error', 'Nem sikerult a jatekosok lekerdezese.', 500);

  const eligiblePlayerIds = players
    .map((p: { id: string }) => p.id);
  const readySet = new Set<string>((readyIds ?? []) as string[]);
  const waitingPlayerIds = eligiblePlayerIds.filter((id: string) => !readySet.has(id));

  if (waitingPlayerIds.length > 0) {
    return jsonResponse({
      ok: true,
      readyPlayerIds: Array.from(readySet),
      waitingPlayerIds,
      allReady: false,
    });
  }

  const advance = await advanceRoomTurn(supabase, room.id);
  if (!advance.ok) {
    // Another ready click may have already moved the room forward. Treat that
    // as converged state; the successful caller's broadcast will refresh peers.
    if (advance.error === 'round_already_advanced' || advance.error === 'round_not_ready') {
      return jsonResponse({
        ok: true,
        readyPlayerIds: Array.from(readySet),
        waitingPlayerIds: [],
        allReady: true,
      });
    }
    return errorResponse(advance.error, advance.messageHu, advance.status);
  }

  const stats = advance.next === 'finished' ? await computeGameStats(supabase, room.id) : undefined;

  return jsonResponse({
    ok: true,
    readyPlayerIds: Array.from(readySet),
    waitingPlayerIds: [],
    allReady: true,
    advance: {
      ...advance,
      ...(stats ? { stats } : {}),
    },
  });
});
