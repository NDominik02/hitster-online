// rename_deck - owner-only deck rename, with featured deck protection.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { callerCanManageDeck } from '../_shared/deck_ownership.ts';

function normalizeDeckName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 120);
  return name.length > 0 ? name : null;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { deckId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Ervenytelen keres.', 400);
  }

  if (!body.deckId) return errorResponse('invalid_deck', 'Hianyzo pakli azonosito.', 400);
  const name = normalizeDeckName(body.name);
  if (!name) return errorResponse('invalid_name', 'Adj meg egy paklinevet.', 400);

  const supabase = adminClient();
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, owner_id, spotify_owner_id, report')
    .eq('id', body.deckId)
    .maybeSingle();

  if (deckError) return errorResponse('db_error', 'Hiba a pakli lekerdezese kozben.', 500);
  if (!deck) return errorResponse('deck_not_found', 'A pakli nem talalhato.', 404);
  if (!(await callerCanManageDeck(supabase, callerUid, deck))) {
    return errorResponse('not_owner', 'Csak a sajat paklidat nevezheted at.', 403);
  }

  const { error: updateError } = await supabase.from('decks').update({ name }).eq('id', deck.id);
  if (updateError) return errorResponse('db_error', 'Hiba a pakli atnevezese kozben.', 500);

  return jsonResponse({ ok: true, name });
});
