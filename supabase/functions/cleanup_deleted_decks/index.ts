// cleanup_deleted_decks - permanently removes hidden decks that no room still references.
//
// Intended for pg_cron/pg_net, authenticated with the service-role key in the
// Authorization bearer header. This keeps soft-deleted decks from piling up
// while preserving decks that may still be needed by existing rooms.

import { adminClient } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse } from '../_shared/cors.ts';

const BATCH_LIMIT = 50;
const STORAGE_BATCH_LIMIT = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return errorResponse('unauthorized', undefined, 401);
  }

  const supabase = adminClient();

  const { data: decks, error: decksError } = await supabase
    .from('decks')
    .select('id')
    .eq('status', 'deleted')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (decksError) return errorResponse('db_error', 'Nem sikerult a torolt paklik lekerdezese.', 500);

  let deletedDecks = 0;
  let deletedCards = 0;
  let deletedAudioFiles = 0;
  let skippedDecks = 0;
  const failedDecks: Array<{ deckId: string; reason: string }> = [];

  for (const deck of decks ?? []) {
    const deckId = deck.id as string;

    const { count: roomCount, error: roomError } = await supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId);

    if (roomError) {
      failedDecks.push({ deckId, reason: 'room_check_failed' });
      continue;
    }

    if ((roomCount ?? 0) > 0) {
      skippedDecks += 1;
      continue;
    }

    const { data: cards, error: cardsError } = await supabase
      .from('deck_cards')
      .select('audio_url')
      .eq('deck_id', deckId);

    if (cardsError) {
      failedDecks.push({ deckId, reason: 'cards_fetch_failed' });
      continue;
    }

    const audioPaths = Array.from(
      new Set((cards ?? []).map((card) => card.audio_url).filter((path): path is string => typeof path === 'string' && path.length > 0))
    );

    let storageFailed = false;
    for (const paths of chunk(audioPaths, STORAGE_BATCH_LIMIT)) {
      const { error: storageError } = await supabase.storage.from('deck-audio').remove(paths);
      if (storageError) {
        failedDecks.push({ deckId, reason: 'storage_delete_failed' });
        storageFailed = true;
        break;
      }
    }
    if (storageFailed) continue;

    const { error: cardsDeleteError } = await supabase.from('deck_cards').delete().eq('deck_id', deckId);
    if (cardsDeleteError) {
      failedDecks.push({ deckId, reason: 'cards_delete_failed' });
      continue;
    }

    const { error: deckDeleteError } = await supabase.from('decks').delete().eq('id', deckId);
    if (deckDeleteError) {
      failedDecks.push({ deckId, reason: 'deck_delete_failed' });
      continue;
    }

    deletedDecks += 1;
    deletedCards += cards?.length ?? 0;
    deletedAudioFiles += audioPaths.length;
  }

  return jsonResponse({
    ok: true,
    scannedDecks: decks?.length ?? 0,
    deletedDecks,
    deletedCards,
    deletedAudioFiles,
    skippedDecks,
    failedDecks,
  });
});
