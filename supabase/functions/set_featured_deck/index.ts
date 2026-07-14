import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { getAdminContext } from '../_shared/admin.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { deckId?: string; featured?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Ervenytelen keres.', 400);
  }
  if (!body.deckId) return errorResponse('invalid_deck', 'Hianyzo pakli azonosito.', 400);

  const supabase = adminClient();
  const admin = await getAdminContext(supabase, callerUid);
  if (!admin.isAdmin) return errorResponse('admin_required', 'Csak kuratori joggal erheto el.', 403);

  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, status, usable_count, report')
    .eq('id', body.deckId)
    .maybeSingle();

  if (deckError) return errorResponse('db_error', 'Hiba a pakli lekerdezese kozben.', 500);
  if (!deck) return errorResponse('deck_not_found', 'A pakli nem talalhato.', 404);

  const currentReport = (deck.report ?? {}) as Record<string, unknown>;
  const nextReport: Record<string, unknown> = { ...currentReport };
  const shouldFeature = body.featured === true;

  if (shouldFeature) {
    if (deck.status !== 'ready') {
      return errorResponse('deck_not_ready', 'Csak elkeszult pakli teheto ajanlottba.', 409);
    }
    if ((deck.usable_count ?? 0) < 60) {
      return errorResponse('deck_too_small', 'Legalabb 60 hasznalhato kartya kell az ajanlott paklihoz.', 409);
    }
    if (currentReport.starred !== true && currentReport.audioPipeline !== 'verified_audio') {
      return errorResponse('deck_not_starred', 'Csak csillagozott pakli jelenhet meg ajanlottkent.', 409);
    }
    if (currentReport.audioPipeline === 'spotify_only') {
      return errorResponse('deck_not_starred', 'Csak csillagozott pakli jelenhet meg ajanlottkent.', 409);
    }
    if (typeof currentReport.spotifyOnlyCount === 'number' && currentReport.spotifyOnlyCount > 0) {
      return errorResponse('deck_has_spotify_only_cards', 'Az ajanlott pakliban nem maradhat Spotify-only kartya.', 409);
    }

    nextReport.featured = true;
    nextReport.starred = true;
    nextReport.featuredAt = new Date().toISOString();
    nextReport.featuredBy = admin.spotifyUserId ?? callerUid;
    nextReport.qualityStatus = currentReport.qualityStatus ?? 'verified';
  } else {
    delete nextReport.featured;
    delete nextReport.featuredAt;
    delete nextReport.featuredBy;
  }

  const { data: updated, error: updateError } = await supabase
    .from('decks')
    .update({
      is_public: shouldFeature,
      report: nextReport,
    })
    .eq('id', deck.id)
    .select('id, name, source_playlist_id, source_playlist_url, total_tracks, usable_count, coverage_pct, status, is_public, report, created_at')
    .single();

  if (updateError) return errorResponse('db_error', 'Nem sikerult menteni az ajanlott allapotot.', 500);

  return jsonResponse({ ok: true, deck: updated });
});
