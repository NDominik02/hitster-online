// list_deck_cards - paginated, metadata-only deck preview for featured and owned decks.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { callerCanManageDeck } from '../_shared/deck_ownership.ts';
import { isProtectedDeckReport } from '../_shared/protected_decks.ts';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type RequestBody = {
  deckId?: string;
  page?: number;
  pageSize?: number;
  query?: string;
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function sanitizeSearch(value: unknown): string {
  if (typeof value !== 'string') return '';
  // PostgREST's `or` filter uses commas and parentheses as syntax, so keep the
  // searchable text plain before embedding it into the filter expression.
  return value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

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

  if (!body.deckId) return errorResponse('invalid_deck', 'Hianyzo pakli azonosito.', 400);

  const page = clampInt(body.page, 1, 1, 10_000);
  const pageSize = clampInt(body.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const search = sanitizeSearch(body.query);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = adminClient();

  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, owner_id, spotify_owner_id, status, is_public, report')
    .eq('id', body.deckId)
    .maybeSingle();

  if (deckError) return errorResponse('db_error', 'Hiba a pakli lekerdezese kozben.', 500);
  if (!deck || deck.status !== 'ready') return errorResponse('deck_not_found', 'A pakli nem talalhato.', 404);

  const isFeatured = deck.is_public === true && isProtectedDeckReport(deck.report);
  const canManage = await callerCanManageDeck(supabase, callerUid, deck);
  if (!isFeatured && !canManage) {
    return errorResponse('not_allowed', 'Ezt a paklit nem nyithatod meg.', 403);
  }

  let cardsQuery = supabase
    .from('deck_cards')
    .select('id, title, artist, year, artwork_url, audio_source, spotify_uri, year_uncertain', { count: 'exact' })
    .eq('deck_id', deck.id);

  if (search) {
    const pattern = `%${search}%`;
    cardsQuery = cardsQuery.or(`title.ilike.${pattern},artist.ilike.${pattern}`);
  }

  const { data: cards, count, error: cardsError } = await cardsQuery
    .order('year', { ascending: true })
    .order('artist', { ascending: true })
    .order('title', { ascending: true })
    .range(from, to);

  if (cardsError) return errorResponse('db_error', 'Hiba a pakli szamainak lekerdezese kozben.', 500);

  return jsonResponse({
    items: (cards ?? []).map((card) => ({
      id: card.id,
      title: card.title,
      artist: card.artist,
      year: card.year,
      artworkUrl: card.artwork_url,
      audioSource: card.audio_source,
      spotifyOnly: card.audio_source === 'spotify',
      yearUncertain: card.year_uncertain,
    })),
    page,
    pageSize,
    total: count ?? 0,
    query: search,
  });
});
