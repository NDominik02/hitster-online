// update_deck_card_year - owner-only year override for cards already in a deck.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { callerCanManageDeck } from '../_shared/deck_ownership.ts';

type UpdateYearBody = {
  deckId?: string;
  cardId?: string;
  year?: number;
};

function normalizeYear(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const year = Math.trunc(value);
  if (year < 1800 || year > 2100) return null;
  return year;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: UpdateYearBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Ervenytelen keres.', 400);
  }

  if (!body.deckId) return errorResponse('invalid_deck', 'Hianyzo pakli azonosito.', 400);
  if (!body.cardId) return errorResponse('invalid_card', 'Hianyzo kartya azonosito.', 400);
  const year = normalizeYear(body.year);
  if (!year) return errorResponse('invalid_year', 'Adj meg egy ervenyes evszamot.', 400);

  const supabase = adminClient();
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, owner_id, spotify_owner_id, report, status')
    .eq('id', body.deckId)
    .maybeSingle();

  if (deckError) return errorResponse('db_error', 'Hiba a pakli lekerdezese kozben.', 500);
  if (!deck) return errorResponse('deck_not_found', 'A pakli nem talalhato.', 404);
  if (deck.status !== 'ready') return errorResponse('deck_not_ready', 'Csak kesz pakli modosithato.', 409);
  if (!(await callerCanManageDeck(supabase, callerUid, deck))) {
    return errorResponse('not_owner', 'Csak a sajat paklidat modosithatod.', 403);
  }

  const { data: card, error: cardError } = await supabase
    .from('deck_cards')
    .select('id, year_uncertain')
    .eq('id', body.cardId)
    .eq('deck_id', deck.id)
    .maybeSingle();

  if (cardError) return errorResponse('db_error', 'Hiba a kartya lekerdezese kozben.', 500);
  if (!card) return errorResponse('card_not_found', 'A kartya nem talalhato ebben a pakliban.', 404);

  const { error: updateError } = await supabase
    .from('deck_cards')
    .update({ year, year_source: 'host_manual', year_uncertain: false })
    .eq('id', card.id)
    .eq('deck_id', deck.id);

  if (updateError) return errorResponse('db_error', 'Hiba az evszam mentese kozben.', 500);

  let uncertainYearCount: number | undefined;
  if (card.year_uncertain) {
    const report = deck.report && typeof deck.report === 'object' ? (deck.report as Record<string, unknown>) : {};
    const currentCount = typeof report.uncertainYearCount === 'number' ? report.uncertainYearCount : 0;
    uncertainYearCount = Math.max(0, currentCount - 1);
    const { error: reportError } = await supabase
      .from('decks')
      .update({ report: { ...report, uncertainYearCount } })
      .eq('id', deck.id);

    if (reportError) return errorResponse('db_error', 'Az evszam mentve, de a riport frissitese sikertelen.', 500);
  }

  return jsonResponse({ ok: true, cardId: card.id, year, yearUncertain: false, uncertainYearCount });
});
