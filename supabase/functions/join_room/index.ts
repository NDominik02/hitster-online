// join_room — ARCHITECTURE.md 3.3
// Caller: player. Looks up the room by code via service-role (the joining
// client isn't a member yet, so RLS wouldn't let them see the room row).

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

const MAX_PLAYERS = 8; // AC5.5
const MAX_PLAYERS_PASS_AND_PLAY = 6; // Pass-and-play PRD: szűkebb létszámkorlát egyetlen körbeadott eszközön

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { code?: string; name?: string; color?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }

  const code = (body.code ?? '').toUpperCase().trim();
  const name = (body.name ?? '').trim();
  const color = (body.color ?? '').trim();

  if (!code || code.length !== 4) return errorResponse('invalid_code', 'Érvénytelen szobakód.', 400);
  if (!name) return errorResponse('invalid_name', 'Adj meg egy nevet.', 400);
  if (!color) return errorResponse('invalid_color', 'Válassz egy színt.', 400);

  const supabase = adminClient();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, status, settings')
    .eq('code', code)
    .neq('status', 'finished')
    .maybeSingle();

  if (roomError || !room) return errorResponse('room_not_found', 'Nem található ilyen kódú szoba.', 404);
  if (room.status !== 'lobby') return errorResponse('room_not_joinable', 'A játék már elindult.', 409);

  const isPassAndPlay = (room.settings as { mode?: string } | null)?.mode === 'pass_and_play';

  // Reconnect-friendly (csak "shared_screen" módban): ha ez az auth_uid már
  // tag ebben a szobában, a meglévő sort adjuk vissza duplikáció helyett
  // (AC15.3). Pass-and-play módban EZ SZÁNDÉKOSAN KIMARAD — egyetlen eszközön
  // (egy auth_uid) körbeadva minden névre külön players sort kell létrehozni
  // (a players_room_uid_idx UNIQUE megkötést emiatt migrációval eltávolítottuk,
  // ld. 009_pass_and_play_multi_player_per_auth — a duplikáció-védelem itt,
  // kódszinten marad a shared_screen ágra korlátozva).
  if (!isPassAndPlay) {
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .eq('auth_uid', callerUid)
      .maybeSingle();

    if (existingPlayer) {
      return jsonResponse({
        roomId: room.id,
        playerId: existingPlayer.id,
        seatOrder: existingPlayer.seat_order,
        status: room.status,
      });
    }
  }

  const { count: playerCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', room.id);

  const maxPlayers = isPassAndPlay ? MAX_PLAYERS_PASS_AND_PLAY : MAX_PLAYERS;

  if ((playerCount ?? 0) >= maxPlayers) {
    return errorResponse(
      'room_full',
      isPassAndPlay ? `A szoba megtelt (max. ${MAX_PLAYERS_PASS_AND_PLAY} játékos ebben a módban).` : 'A szoba megtelt (max. 8 játékos).',
      409
    );
  }

  const { data: colorTaken } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', room.id)
    .eq('color', color)
    .maybeSingle();

  if (colorTaken) return errorResponse('color_taken', 'Ezt a színt már választották.', 409);

  const { data: maxSeatRow } = await supabase
    .from('players')
    .select('seat_order')
    .eq('room_id', room.id)
    .order('seat_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const seatOrder = maxSeatRow ? maxSeatRow.seat_order + 1 : 0;

  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({
      room_id: room.id,
      auth_uid: callerUid,
      name,
      color,
      seat_order: seatOrder,
    })
    .select()
    .single();

  if (insertError || !player) {
    // Most likely a race on the color/seat unique index — ask the client to retry.
    return errorResponse('join_conflict', 'Ütközés csatlakozáskor, próbáld újra.', 409);
  }

  return jsonResponse({ roomId: room.id, playerId: player.id, seatOrder: player.seat_order, status: room.status });
});
