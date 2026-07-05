/**
 * Spotify Authorization Code + PKCE helper — S30 (Spotify Premium mód).
 *
 * A code_verifier a böngészőben marad (sessionStorage), amíg a Spotify
 * redirect vissza nem tér — SOSEM megy a szerverre a `code_challenge`
 * elküldése előtt. A tényleges token-csere (spotify_oauth_callback) kapja
 * meg mindkettőt, hogy a Spotify ellenőrizhesse a párost.
 */

const CODE_VERIFIER_STORAGE_KEY = "spotify_pkce_code_verifier";

const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Elindítja a Spotify OAuth-folyamot: generál egy code_verifier/code_challenge
 * párt, a verifier-t sessionStorage-ban tartja, majd átirányít a Spotify
 * engedélyező oldalára. A `redirectUri`-nak pontosan egyeznie kell a Spotify
 * Developer Dashboardon regisztrált URI-val.
 */
export async function startSpotifyLogin(clientId: string, redirectUri: string): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem(CODE_VERIFIER_STORAGE_KEY, verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/** A callback oldalon hívandó — visszaadja és törli a tárolt code_verifier-t. */
export function consumeStoredCodeVerifier(): string | null {
  const verifier = sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY);
  sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);
  return verifier;
}
