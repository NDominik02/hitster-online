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
import { refreshSpotifyToken } from '../_shared/spotify.ts';

const EXPIRY_SAFETY_MARGIN_MS = 60_000; // refresh a bit before actual expiry

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  const supabase = adminClient();

  const { data: connection } = await supabase
    .from('spotify_connections')
    .select('access_token, refresh_token, access_expires_at')
    .eq('host_uid', callerUid)
    .maybeSingle();

  if (!connection) {
    return errorResponse('no_spotify_connection', 'Nincs csatlakoztatott Spotify-fiók.', 404);
  }

  const expiresAt = new Date(connection.access_expires_at).getTime();
  if (expiresAt - Date.now() > EXPIRY_SAFETY_MARGIN_MS) {
    // Still valid — no need to call Spotify again.
    return jsonResponse({ accessToken: connection.access_token, expiresAt: connection.access_expires_at });
  }

  const refreshed = await refreshSpotifyToken(connection.refresh_token);
  if (!refreshed) {
    // The refresh token itself is no longer usable (e.g. the user revoked
    // access on Spotify's side) — drop the stale connection so the next
    // draw_card call falls back to preview mode instead of retrying forever.
    await supabase.from('spotify_connections').delete().eq('host_uid', callerUid);
    return errorResponse('spotify_refresh_failed', 'A Spotify-kapcsolat lejárt, csatlakoztasd újra.', 502);
  }

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from('spotify_connections')
    .update({
      access_token: refreshed.access_token,
      // Spotify doesn't always issue a new refresh_token — keep the old one if absent.
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
      access_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('host_uid', callerUid);

  return jsonResponse({ accessToken: refreshed.access_token, expiresAt: newExpiresAt });
});
