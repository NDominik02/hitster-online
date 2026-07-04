// spotify_list_devices — S20 (F3, Spotify Web Playback SDK/Connect API).
// Caller: bármely bejelentkezett kliens, a SAJÁT Spotify-kapcsolatára
// (ugyanaz a "személyhez, nem szobához kötött" minta, mint
// spotify_refresh_token-nél). A host UI-nak a Connect API-s eszközválasztóhoz
// kell (GET /me/player/devices) — a Web Playback SDK a böngészőben saját
// device-ot regisztrál, de mobilon (ahol az SDK nem támogatott) a hostnak a
// SAJÁT telefonján/hangszóróján futó natív Spotify-appot kell kiválasztania.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { getValidSpotifyAccessToken } from '../_shared/spotify.ts';

interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  const supabase = adminClient();
  const token = await getValidSpotifyAccessToken(supabase, callerUid);
  if (!token) return errorResponse('no_spotify_connection', 'Nincs csatlakoztatott Spotify-fiók.', 404);

  const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  if (!res.ok) return errorResponse('spotify_api_error', 'Nem sikerült lekérdezni a Spotify-eszközöket.', 502);

  const body = (await res.json()) as { devices: SpotifyDevice[] };
  return jsonResponse({
    devices: (body.devices ?? []).filter((d) => !d.is_restricted).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      isActive: d.is_active,
    })),
  });
});
