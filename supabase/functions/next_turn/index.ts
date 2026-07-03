// next_turn — ARCHITECTURE.md 3.9, bővítve F2.1-ben (11.6.6, S25)
// Caller: host / server-internal. Checks win condition (S14/D3), deck
// exhaustion (S16/D3), otherwise advances to the next seat and draws.
//
// F2 addition (F2-D9/F2-D10): before drawing, walk forward through the seat
// order skipping any player whose SERVER-SIDE players.connected flag is
// false (set by set_presence, driven by the host's Realtime Presence
// observation with a 15s timeout — AC25.7 explicitly requires the skip
// decision to be based on this persisted column, never a live per-call
// client claim). Unboundedly skips consecutive offline players (F2-D10 —
// no hard "max 1" cap); if literally everyone is offline, the room pauses
// instead of drawing for nobody.

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
  // BUGFIX (2026-07-03): a 'paused' állapot (F2-D10, "mindenki offline") korábban zsákutca volt
  // — ez a guard MINDEN következő hívást elutasított, mert csak 'playing'-et engedett át, holott
  // a kommentek (lásd lent) kifejezetten azt ígérték, hogy egy újabb next_turn hívás fel tudja
  // oldani a szünetet, ha időközben valaki visszatért. 'paused'-ból is engedjük a próbálkozást —
  // ha az alábbi skip-ellenőrzés ismét mindenkit offline-nak talál, egyszerűen 'paused' marad.
  if (room.status !== 'playing' && room.status !== 'paused') {
    return errorResponse('room_not_playing', 'A játék nincs folyamatban.', 409);
  }

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

  // F2 (11.6.6): walk forward skipping offline players (F2-D9/F2-D10).
  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, connected')
    .eq('room_id', room.id);
  const connectedById = new Map((allPlayers ?? []).map((p: { id: string; connected: boolean }) => [p.id, p.connected]));
  const totalPlayers = allPlayers?.length ?? 0;

  let nextPlayerId = await getNextPlayerId(supabase, room.id, currentPlayerId);
  if (!nextPlayerId) return errorResponse('no_players', 'Nincsenek játékosok.', 500);

  const skipped: string[] = [];
  // Bounded by totalPlayers iterations so an all-offline room can't loop
  // forever — F2-D10: if we skip everyone, the room pauses instead.
  while (connectedById.get(nextPlayerId) === false && skipped.length < totalPlayers) {
    skipped.push(nextPlayerId);
    const after = await getNextPlayerId(supabase, room.id, nextPlayerId);
    if (!after) break;
    nextPlayerId = after;
  }

  if (skipped.length >= totalPlayers) {
    // F2-D10: everyone is offline — pause the room rather than drawing for
    // an empty table. next_turn does NOT draw or advance current_round_id
    // in this branch; a subsequent next_turn call (once someone reconnects
    // and the host retries) will resume normally.
    await supabase.from('rooms').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', room.id);
    return jsonResponse({ next: 'paused', reason: 'all_offline' });
  }

  // Ha korábban 'paused'-ra állt (mindenki offline volt), de most sikerült legalább egy online
  // játékost találni, explicit visszaállítjuk 'playing'-re — a drawCard maga nem érinti a
  // rooms.status-t, ez itt a "feléledés" pillanata.
  if (room.status === 'paused') {
    await supabase.from('rooms').update({ status: 'playing', updated_at: new Date().toISOString() }).eq('id', room.id);
  }

  const draw = await drawCard(supabase, room.id, nextPlayerId);
  if (!draw.ok) return errorResponse('draw_failed', 'Nem sikerült kártyát húzni.', 500);

  if (draw.deckExhausted) {
    // S16/AC16: deck ran out before anyone hit winTarget — longest timeline
    // wins, ties share victory (D3).
    const result = await finishByDeckExhaustion(supabase, room.id);
    return jsonResponse({ next: 'finished', winnerPlayerIds: result.winnerPlayerIds });
  }

  return jsonResponse({ next: 'draw', roundId: draw.roundId, activePlayerId: nextPlayerId, skipped });
});
