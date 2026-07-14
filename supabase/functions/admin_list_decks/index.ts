import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { callerIsAdmin } from '../_shared/admin.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  const supabase = adminClient();
  if (!(await callerIsAdmin(supabase, callerUid))) {
    return errorResponse('admin_required', 'Csak kuratori joggal erheto el.', 403);
  }

  const { data, error } = await supabase
    .from('decks')
    .select('id, name, source_playlist_id, source_playlist_url, total_tracks, usable_count, coverage_pct, status, is_public, owner_id, spotify_owner_id, report, created_at')
    .in('status', ['ready', 'generating'])
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) return errorResponse('db_error', 'Nem sikerult lekerdezni a paklikat.', 500);

  return jsonResponse({
    decks: (data ?? []).map((deck) => {
      const report = (deck.report ?? {}) as Record<string, unknown>;
      return {
        id: deck.id,
        name: deck.name,
        sourcePlaylistId: deck.source_playlist_id,
        sourcePlaylistUrl: deck.source_playlist_url,
        totalTracks: deck.total_tracks,
        usableCount: deck.usable_count,
        coveragePct: Number(deck.coverage_pct ?? 0),
        status: deck.status,
        isPublic: deck.is_public,
        isFeatured: report.featured === true,
        isStarred: report.starred === true || report.audioPipeline === 'verified_audio',
        audioPipeline: typeof report.audioPipeline === 'string' ? report.audioPipeline : null,
        qualityStatus: typeof report.qualityStatus === 'string' ? report.qualityStatus : null,
        spotifyOnlyCount: typeof report.spotifyOnlyCount === 'number' ? report.spotifyOnlyCount : null,
        promotedFromDeckId: typeof report.promotedFromDeckId === 'string' ? report.promotedFromDeckId : null,
        createdAt: deck.created_at,
      };
    }),
  });
});
