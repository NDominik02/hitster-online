// delete_deck - owner-only deck deletion with storage cleanup.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { deckId?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Ervenytelen keres.', 400);
  }
  if (!body.deckId) return errorResponse('invalid_deck', 'Hianyzo pakli azonosito.', 400);

  const supabase = adminClient();

  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, owner_id, status')
    .eq('id', body.deckId)
    .maybeSingle();

  if (deckError) return errorResponse('db_error', 'Hiba a pakli lekerdezese kozben.', 500);
  if (!deck) return errorResponse('deck_not_found', 'A pakli nem talalhato.', 404);
  if (deck.owner_id !== callerUid) return errorResponse('not_owner', 'Csak a sajat paklidat torolheted.', 403);
  if (deck.status === 'generating') return errorResponse('deck_generating', 'Generalo pakli meg nem torolheto.', 409);

  const { count: roomCount, error: roomError } = await supabase
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deck.id);
  if (roomError) return errorResponse('db_error', 'Hiba a szobak ellenorzese kozben.', 500);
  if ((roomCount ?? 0) > 0) {
    return errorResponse('deck_in_use', 'Ezt a paklit mar hasznalja egy szoba, ezert nem torolheto.', 409);
  }

  const { data: cards, error: cardsError } = await supabase
    .from('deck_cards')
    .select('audio_url')
    .eq('deck_id', deck.id);
  if (cardsError) return errorResponse('db_error', 'Hiba a pakli kartyainak lekerdezese kozben.', 500);

  const audioPaths = Array.from(
    new Set((cards ?? []).map((card) => card.audio_url).filter((path): path is string => typeof path === 'string' && path.length > 0))
  );
  for (const paths of chunk(audioPaths, 100)) {
    const { error: storageError } = await supabase.storage.from('deck-audio').remove(paths);
    if (storageError) return errorResponse('storage_delete_failed', 'Nem sikerult torolni a pakli hangfajljait.', 500);
  }

  const { error: cardsDeleteError } = await supabase.from('deck_cards').delete().eq('deck_id', deck.id);
  if (cardsDeleteError) return errorResponse('db_error', 'Hiba a pakli kartyainak torlese kozben.', 500);

  const { error: deckDeleteError } = await supabase.from('decks').delete().eq('id', deck.id);
  if (deckDeleteError) return errorResponse('db_error', 'Hiba a pakli torlese kozben.', 500);

  return jsonResponse({ ok: true });
});
