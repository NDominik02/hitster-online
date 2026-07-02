// next_turn — ARCHITECTURE.md 3.9
// Caller: host / server-internal. Checks win condition (S14/D3), deck
// exhaustion (S16/D3), otherwise advances to the next seat and draws.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { drawCard, checkWinnersAndFinish, finishByDeckExhaustion, getNextPlayerId } from '../_shared/round.ts';

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

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, host_uid, status, current_round_id')
    .eq('id', body.roomId)
    .single();

  if (roomError || !room) return errorResponse('room_not_found', 'A szoba nem található.', 404);
  if (room.host_uid !== callerUid) return errorResponse('not_host', 'Csak a host léptetheti a kört.', 403);
  if (room.status !== 'playing') return errorResponse('room_not_playing', 'A játék nincs folyamatban.', 409);

  // S14: win check first — a player may have just reached winTarget.
  const winCheck = await checkWinnersAndFinish(supabase, room.id);
  if (winCheck.finished) {
    return jsonResponse({ next: 'finished', winnerPlayerIds: winCheck.winnerPlayerIds });
  }

  // Close out the previous round.
  if (room.current_round_id) {
    await supabase.from('rounds').update({ phase: 'done' }).eq('id', room.current_round_id).eq('phase', 'reveal');
  }

  const { data: currentRound } = room.current_round_id
    ? await supabase.from('rounds').select('active_player_id').eq('id', room.current_round_id).single()
    : { data: null };

  const currentPlayerId = currentRound?.active_player_id;
  if (!currentPlayerId) return errorResponse('no_active_player', 'Nincs aktív játékos.', 500);

  const nextPlayerId = await getNextPlayerId(supabase, room.id, currentPlayerId);
  if (!nextPlayerId) return errorResponse('no_players', 'Nincsenek játékosok.', 500);

  const draw = await drawCard(supabase, room.id, nextPlayerId);
  if (!draw.ok) return errorResponse('draw_failed', 'Nem sikerült kártyát húzni.', 500);

  if (draw.deckExhausted) {
    // S16/AC16: deck ran out before anyone hit winTarget — longest timeline
    // wins, ties share victory (D3).
    const result = await finishByDeckExhaustion(supabase, room.id);
    return jsonResponse({ next: 'finished', winnerPlayerIds: result.winnerPlayerIds });
  }

  return jsonResponse({ next: 'draw', roundId: draw.roundId });
});
