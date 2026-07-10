// spotify_oauth_callback — S30 (Spotify Premium mód), System Architect terv.
// Caller: bármely bejelentkezett (anon auth) kliens, a Spotify OAuth redirect
// után a /host/spotify/callback oldalon. Ez a kapcsolódás a H1 (Létrehozás)
// képernyőn történik, MIELŐTT bármilyen szoba létezne — a spotify_connections
// sor a caller `auth.uid()`-jéhez kötött, míg a paklik stabil tulajdonosa a
// Spotify profile id. Ugyanazzal a Spotify-fiókkal másik eszközön is elérhető
// ugyanaz a privát paklikönyvtár. Nincs
// roomId-alapú jogosultság-ellenőrzés: a kapcsolódás a "csatlakoztatom a
// SAJÁT Spotify-fiókomat" művelet, ehhez elég egy érvényes Supabase JWT.
//
// Exchanges the code for tokens via the Authorization Code + PKCE flow (no
// Client Secret needed — that's the whole point of PKCE for public clients).
//
// The refresh_token NEVER leaves this function — only a short-lived
// access_token goes back to the host client (same anti-leak pattern as
// draw_card's signed audio URL: the sensitive credential stays server-side,
// the caller gets a short-lived, purpose-limited value).

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { exchangeSpotifyCode, fetchSpotifyProfile } from '../_shared/spotify.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { code?: string; codeVerifier?: string; redirectUri?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.code || !body.codeVerifier || !body.redirectUri) {
    return errorResponse('invalid_request', 'Hiányzó paraméter.', 400);
  }

  const supabase = adminClient();

  const tokenResponse = await exchangeSpotifyCode(body.code, body.redirectUri, body.codeVerifier);
  if (!tokenResponse || !tokenResponse.refresh_token) {
    return errorResponse('spotify_token_exchange_failed', 'Nem sikerült a Spotify-hitelesítés.', 502);
  }

  const profile = await fetchSpotifyProfile(tokenResponse.access_token);
  if (!profile) {
    return errorResponse('spotify_profile_failed', 'Nem sikerült lekérdezni a Spotify-profilt.', 502);
  }

  const accessExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();

  const { error: upsertError } = await supabase
    .from('spotify_connections')
    .upsert(
      {
        host_uid: callerUid,
        spotify_user_id: profile.id,
        display_name: profile.display_name ?? null,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        access_expires_at: accessExpiresAt,
        scope: tokenResponse.scope,
        product: profile.product ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'host_uid' }
    );

  if (upsertError) return errorResponse('db_error', 'Nem sikerült a Spotify-kapcsolat mentése.', 500);

  const { error: claimError } = await supabase
    .from('decks')
    .update({ spotify_owner_id: profile.id })
    .eq('owner_id', callerUid)
    .is('spotify_owner_id', null);

  if (claimError) {
    return errorResponse('deck_claim_failed', 'A Spotify-fiók csatlakozott, de a korábbi paklik átvétele nem sikerült.', 500);
  }

  return jsonResponse({
    connected: true,
    spotifyUserId: profile.id,
    displayName: profile.display_name ?? null,
    product: profile.product ?? null,
    accessToken: tokenResponse.access_token,
    expiresAt: accessExpiresAt,
  });
});
