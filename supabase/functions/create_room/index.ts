// create_room — ARCHITECTURE.md 3.2
// Caller: host. auth.uid() becomes rooms.host_uid (D5: host is not a player).

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

const MIN_USABLE_CARDS = 60; // D4
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function randomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { deckId?: string; settings?: { winTarget?: number; timeLimitSec?: number; stealEnabled?: boolean } };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }

  if (!body.deckId) return errorResponse('invalid_deck', 'Hiányzó pakli azonosító.', 400);

  const supabase = adminClient();

  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, usable_count, status')
    .eq('id', body.deckId)
    .single();

  if (deckError || !deck) return errorResponse('deck_not_found', 'A pakli nem található.', 404);
  if (deck.status !== 'ready') return errorResponse('deck_not_ready', 'A pakli még generálódik vagy hibás.', 409);
  if (deck.usable_count < MIN_USABLE_CARDS) {
    return errorResponse('deck_too_small', `A paklinak legalább ${MIN_USABLE_CARDS} kártyát kell tartalmaznia.`, 422);
  }

  const settings = {
    winTarget: body.settings?.winTarget ?? 10,
    timeLimitSec: body.settings?.timeLimitSec ?? 90,
    stealEnabled: body.settings?.stealEnabled ?? false,
  };

  // Generate a unique 4-letter code among active (non-finished) rooms.
  let code = randomCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: existing } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code)
      .neq('status', 'finished')
      .maybeSingle();
    if (!existing) break;
    code = randomCode();
  }

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({
      code,
      host_uid: callerUid,
      deck_id: body.deckId,
      status: 'lobby',
      settings,
    })
    .select()
    .single();

  if (roomError || !room) return errorResponse('db_error', 'Nem sikerült a szoba létrehozása.', 500);

  return jsonResponse({ roomId: room.id, code: room.code, status: room.status });
});
