// Spotify Premium (S30, F3) shared constants/helpers.
//
// SPOTIFY_CLIENT_ID is intentionally a plain constant, not a secret env var:
// the Authorization Code + PKCE flow is specifically designed so public
// clients (SPAs, mobile apps) never need a Client Secret — the Client ID is
// meant to be visible in client-side code (it already is, as
// NEXT_PUBLIC_SPOTIFY_CLIENT_ID in the frontend). Keeping the same literal
// value here avoids needing a Supabase secret just for a non-secret value.
export const SPOTIFY_CLIENT_ID = '37c5f553e7644e4c95a8ec3215401de5';

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export async function exchangeSpotifyCode(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<SpotifyTokenResponse | null> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as SpotifyTokenResponse;
}

export async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokenResponse | null> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as SpotifyTokenResponse;
}

export interface SpotifyProfile {
  id: string;
  product?: string; // 'premium' | 'free' | 'open'
}

export async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfile | null> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as SpotifyProfile;
}

const EXPIRY_SAFETY_MARGIN_MS = 60_000; // refresh a bit before actual expiry

// S30/S20 (F3, Web Playback SDK) — shared by spotify_refresh_token (client-facing)
// AND internally by drawCard/spotify_list_devices/spotify_playback_command, so
// those never need an extra internal HTTP hop just to get a fresh token.
// Deletes the stored connection and returns null if the refresh token itself
// is no longer usable (revoked on Spotify's side) — callers fall back to
// preview mode silently in that case (Architect plan: no hard failures).
export async function getValidSpotifyAccessToken(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  hostUid: string
): Promise<{ accessToken: string; expiresAt: string } | null> {
  const { data: connection } = await supabase
    .from('spotify_connections')
    .select('access_token, refresh_token, access_expires_at')
    .eq('host_uid', hostUid)
    .maybeSingle();

  if (!connection) return null;

  const expiresAt = new Date(connection.access_expires_at).getTime();
  if (expiresAt - Date.now() > EXPIRY_SAFETY_MARGIN_MS) {
    return { accessToken: connection.access_token, expiresAt: connection.access_expires_at };
  }

  const refreshed = await refreshSpotifyToken(connection.refresh_token);
  if (!refreshed) {
    await supabase.from('spotify_connections').delete().eq('host_uid', hostUid);
    return null;
  }

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from('spotify_connections')
    .update({
      access_token: refreshed.access_token,
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
      access_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('host_uid', hostUid);

  return { accessToken: refreshed.access_token, expiresAt: newExpiresAt };
}
