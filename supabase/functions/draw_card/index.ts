// draw_card — ARCHITECTURE.md 3.5
// Caller: host only. This is the D7 anti-leak boundary: the signed audioUrl
// is returned ONLY in this response, and only to the host. Player clients
// never call this function and never see this response.
// Normally called internally by start_game/next_turn, but exposed as its
// own endpoint too (e.g. for the host to explicitly re-request the signed
// URL if the previous one expired without advancing the round).

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { drawCard, finishByDeckExhaustion, resolveCardPlayback } from '../_shared/round.ts';

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
    .select('id, host_uid, status, current_round_id, spotify_playback_mode')
    .eq('id', body.roomId)
    .single();

  if (roomError || !room) return errorResponse('room_not_found', 'A szoba nem található.', 404);
  if (room.host_uid !== callerUid) return errorResponse('not_host', 'Csak a host húzhat kártyát.', 403);
  if (room.status !== 'playing') return errorResponse('room_not_playing', 'A játék nincs folyamatban.', 409);

  // If there's already an active (non-done) round, just re-issue a fresh
  // signed URL for it rather than drawing a duplicate card.
  if (room.current_round_id) {
    const { data: currentRound } = await supabase
      .from('rounds')
      .select('id, round_no, active_player_id, phase, card_id, placing_deadline')
      .eq('id', room.current_round_id)
      .single();

    if (currentRound && currentRound.phase !== 'done') {
      const playback = await resolveCardPlayback(supabase, room, currentRound.card_id);
      return jsonResponse({
        roundId: currentRound.id,
        roundNo: currentRound.round_no,
        activePlayerId: currentRound.active_player_id,
        ...playback,
        placingDeadline: currentRound.placing_deadline,
      });
    }
  }

  const { data: players } = await supabase
    .from('players')
    .select('id, seat_order')
    .eq('room_id', room.id)
    .is('kicked_at', null)
    .order('seat_order', { ascending: true });

  if (!players || players.length === 0) return errorResponse('no_players', 'Nincsenek játékosok.', 422);

  const activePlayerId = players[0].id;
  const draw = await drawCard(supabase, room.id, activePlayerId);

  if (!draw.ok) return errorResponse('draw_failed', 'Nem sikerült kártyát húzni.', 500);

  if (draw.deckExhausted) {
    const result = await finishByDeckExhaustion(supabase, room.id);
    return jsonResponse({ next: 'finished', winnerPlayerIds: result.winnerPlayerIds });
  }

  return jsonResponse({
    roundId: draw.roundId,
    roundNo: draw.roundNo,
    activePlayerId: draw.activePlayerId,
    audioUrl: draw.audioUrl,
    spotifyUri: draw.spotifyUri,
    durationMs: draw.durationMs,
    placingDeadline: draw.placingDeadline,
  });
});
