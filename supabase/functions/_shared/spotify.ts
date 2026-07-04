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
