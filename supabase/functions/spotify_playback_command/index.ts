// spotify_playback_command — S20 (F3, Spotify Web Playback SDK/Connect API).
// Caller: bármely bejelentkezett kliens, a SAJÁT Spotify-kapcsolatára — ez a
// proxy hívja meg ténylegesen a Spotify Connect API play/pause végpontjait a
// szerveren tárolt access tokennel (a kliens sosem látja/kezeli magát a
// tokent egy külön lépésben, csak azt kapja vissza, ami a Web Playback SDK
// getOAuthToken callback-jéhez amúgy is kell — ld. spotify_refresh_token).
//
// 'play' egyetlen hívással transzferálja ÉS elindítja a lejátszást a megadott
// device_id-n (a Spotify API ezt támogatja — nincs szükség külön "transfer"
// lépésre), 0 pozícióról, hogy minden kör elejéről szóljon a szám.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { getValidSpotifyAccessToken } from '../_shared/spotify.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { action?: string; deviceId?: string; spotifyUri?: string; volumePercent?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }

  if (body.action !== 'play' && body.action !== 'pause' && body.action !== 'resume' && body.action !== 'volume') {
    return errorResponse('invalid_action', 'Érvénytelen művelet.', 400);
  }
  if (!body.deviceId) return errorResponse('invalid_device', 'Hiányzó eszköz azonosító.', 400);
  if (body.action === 'play' && !body.spotifyUri) {
    return errorResponse('invalid_track', 'Hiányzó Spotify track URI.', 400);
  }
  if (
    body.action === 'volume' &&
    (typeof body.volumePercent !== 'number' || !Number.isFinite(body.volumePercent))
  ) {
    return errorResponse('invalid_volume', 'Érvénytelen hangerő.', 400);
  }

  const supabase = adminClient();
  const token = await getValidSpotifyAccessToken(supabase, callerUid);
  if (!token) return errorResponse('no_spotify_connection', 'Nincs csatlakoztatott Spotify-fiók.', 404);

  const encodedDeviceId = encodeURIComponent(body.deviceId);
  const url =
    body.action === 'pause'
      ? `https://api.spotify.com/v1/me/player/pause?device_id=${encodedDeviceId}`
      : body.action === 'volume'
        ? `https://api.spotify.com/v1/me/player/volume?device_id=${encodedDeviceId}&volume_percent=${Math.max(0, Math.min(100, Math.round(body.volumePercent)))}`
        : `https://api.spotify.com/v1/me/player/play?device_id=${encodedDeviceId}`;

  // Playtest feedback (2026-07-06) — 'resume' hívja UGYANEZT a play végpontot,
  // de body NÉLKÜL: a Spotify API ilyenkor a korábban megállított pozíciótól
  // folytatja a lejátszást ahelyett, hogy position_ms:0-ról újraindítaná (amit
  // a 'play' action explicit body-ja tesz, körönként az elejéről indulva).
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body.action === 'play' ? JSON.stringify({ uris: [body.spotifyUri], position_ms: 0 }) : undefined,
  });

  // Spotify 204 No Content on success. 403 = non-Premium or restricted
  // device, 404 = device_id no longer valid (e.g. Connect session ended) —
  // both are expected, recoverable states the frontend falls back from.
  if (!res.ok && res.status !== 204) {
    return errorResponse('spotify_playback_failed', 'Nem sikerült a Spotify-lejátszás vezérlése.', 502);
  }

  return jsonResponse({ ok: true });
});
