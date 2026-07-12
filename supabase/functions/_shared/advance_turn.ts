import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { drawCard, checkWinnersAndFinish, finishByDeckExhaustion, getNextPlayerId } from './round.ts';

export type AdvanceTurnResult =
  | { ok: true; next: 'draw'; roundId: string; activePlayerId?: string; skipped: string[] }
  | { ok: true; next: 'finished'; winnerPlayerIds: string[] }
  | { ok: true; next: 'paused'; reason: 'no_active_players' }
  | { ok: false; error: string; messageHu: string; status: number };

export async function advanceRoomTurn(
  supabase: SupabaseClient,
  roomId: string
): Promise<AdvanceTurnResult> {
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, status, current_round_id')
    .eq('id', roomId)
    .single();

  if (roomError || !room) {
    return { ok: false, error: 'room_not_found', messageHu: 'A szoba nem talalhato.', status: 404 };
  }
  if (room.status !== 'playing' && room.status !== 'paused') {
    return { ok: false, error: 'room_not_playing', messageHu: 'A jatek nincs folyamatban.', status: 409 };
  }
  if (!room.current_round_id) {
    return { ok: false, error: 'no_current_round', messageHu: 'Nincs aktiv kor.', status: 409 };
  }

  // S14: win check first — a player may have just reached winTarget.
  const winCheck = await checkWinnersAndFinish(supabase, room.id);
  if (winCheck.finished) {
    return { ok: true, next: 'finished', winnerPlayerIds: winCheck.winnerPlayerIds };
  }

  const { data: currentRound } = await supabase
    .from('rounds')
    .select('id, active_player_id, phase')
    .eq('id', room.current_round_id)
    .single();

  if (!currentRound?.active_player_id) {
    return { ok: false, error: 'no_active_player', messageHu: 'Nincs aktiv jatekos.', status: 500 };
  }

  if (currentRound.phase === 'reveal') {
    const { data: closedRound } = await supabase
      .from('rounds')
      .update({ phase: 'done' })
      .eq('id', currentRound.id)
      .eq('phase', 'reveal')
      .select('id')
      .maybeSingle();
    if (!closedRound) {
      return { ok: false, error: 'round_already_advanced', messageHu: 'A kor mar tovabblepett.', status: 409 };
    }
  } else if (!(room.status === 'paused' && currentRound.phase === 'done')) {
    return { ok: false, error: 'round_not_ready', messageHu: 'A kor meg nem leptetheto.', status: 409 };
  }

  const currentPlayerId = currentRound.active_player_id;

  let nextPlayerId = await getNextPlayerId(supabase, room.id, currentPlayerId);
  if (!nextPlayerId) {
    await supabase.from('rooms').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', room.id);
    return { ok: true, next: 'paused', reason: 'no_active_players' };
  }

  if (room.status === 'paused') {
    await supabase.from('rooms').update({ status: 'playing', updated_at: new Date().toISOString() }).eq('id', room.id);
  }

  const draw = await drawCard(supabase, room.id, nextPlayerId);
  if (!draw.ok) {
    return { ok: false, error: 'draw_failed', messageHu: 'Nem sikerult kartyat huzni.', status: 500 };
  }

  if (draw.deckExhausted) {
    const result = await finishByDeckExhaustion(supabase, room.id);
    return { ok: true, next: 'finished', winnerPlayerIds: result.winnerPlayerIds };
  }

  return { ok: true, next: 'draw', roundId: draw.roundId!, activePlayerId: nextPlayerId, skipped: [] };
}
