// spotify_refresh_token — S30 (Spotify Premium mód). Caller: bármely
// bejelentkezett kliens, a SAJÁT Spotify-kapcsolatára (host_uid = a hívó
// auth.uid()-je) — nincs roomId-alapú jogosultság-ellenőrzés, ugyanazon
// okból, mint a spotify_oauth_callback-nél (a kapcsolat a személyhez, nem
// egy adott szobához kötött). Returns a currently-valid access token,
// refreshing via Spotify if the stored one is expired or about to expire —
// the client (Web Playback SDK's getOAuthToken callback, or draw_card
// internally) never sees/handles the refresh_token itself.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { getValidSpotifyAccessToken } from '../_shared/spotify.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  const supabase = adminClient();

  const { data: connection } = await supabase
    .from('spotify_connections')
    .select('id, spotify_user_id, display_name, product')
    .eq('host_uid', callerUid)
    .maybeSingle();
  if (!connection) return errorResponse('no_spotify_connection', 'Nincs csatlakoztatott Spotify-fiók.', 404);

  const token = await getValidSpotifyAccessToken(supabase, callerUid);
  if (!token) {
    return errorResponse('spotify_refresh_failed', 'A Spotify-kapcsolat lejárt, csatlakoztasd újra.', 502);
  }

  return jsonResponse({
    accessToken: token.accessToken,
    expiresAt: token.expiresAt,
    spotifyUserId: connection.spotify_user_id,
    displayName: connection.display_name ?? null,
    product: connection.product ?? null,
  });
});
