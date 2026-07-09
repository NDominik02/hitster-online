// create_room — ARCHITECTURE.md 3.2
// Caller: host. auth.uid() becomes rooms.host_uid (D5: host is not a player).

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { getValidSpotifyAccessToken } from '../_shared/spotify.ts';

const MIN_USABLE_CARDS = 60; // D4
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function randomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: {
    deckId?: string;
    settings?: {
      winTarget?: number;
      timeLimitSec?: number;
      stealEnabled?: boolean;
      mode?: string;
      spotifyPlaybackMode?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }

  if (!body.deckId) return errorResponse('invalid_deck', 'Hiányzó pakli azonosító.', 400);

  // Pass-and-play (2026-07): egyetlen eszköz, host-gép nélkül — a mód a
  // létrehozáskor rögzül, menet közben nem váltható (US-PP1). Ismeretlen
  // érték csendben 'shared_screen'-re esik vissza, nem hiba.
  const mode = body.settings?.mode === 'pass_and_play' ? 'pass_and_play' : 'shared_screen';

  const supabase = adminClient();

  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, usable_count, status')
    .eq('id', body.deckId)
    .single();

  if (deckError || !deck) return errorResponse('deck_not_found', 'A pakli nem található.', 404);
  if (deck.status !== 'ready') return errorResponse('deck_not_ready', 'A pakli még generálódik vagy hibás.', 409);
  if (deck.usable_count < MIN_USABLE_CARDS) {
    return errorResponse('deck_too_small', `A paklinak legalább ${MIN_USABLE_CARDS} kártyát kell tartalmaznia.`, 422);
  }

  const { count: spotifyOnlyCount, error: spotifyOnlyCountError } = await supabase
    .from('deck_cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', body.deckId)
    .is('audio_url', null);
  if (spotifyOnlyCountError) return errorResponse('db_error', 'Nem sikerült a pakli ellenőrzése.', 500);
  const requiresPremiumPlayback = (spotifyOnlyCount ?? 0) > 0;

  // S20/S30 (F3, Spotify Premium): a kliens KÉRHETI a 'premium' módot, de a
  // szerver sosem bízik ebben vakon — csak akkor kapcsoljuk be ténylegesen,
  // ha a hívónak (a leendő host_uid-nak) van érvényes, Premium Spotify-
  // kapcsolata. Enélkül csendben visszaesik 'preview'-re (F1/F2-től ismert
  // 30 mp-es viselkedés) — soha nem hibázik emiatt a szoba-létrehozás.
  let spotifyPlaybackMode: 'preview' | 'premium' = 'preview';
  if (body.settings?.spotifyPlaybackMode === 'premium') {
    const { data: connection } = await supabase
      .from('spotify_connections')
      .select('product')
      .eq('host_uid', callerUid)
      .maybeSingle();
    if (connection?.product === 'premium') {
      const token = await getValidSpotifyAccessToken(supabase, callerUid);
      if (token) spotifyPlaybackMode = 'premium';
    }
  }

  if (requiresPremiumPlayback && spotifyPlaybackMode !== 'premium') {
    return errorResponse(
      'premium_required',
      'Ez a pakli tartalmaz teljes Spotify-lejátszást igénylő számokat. Kapcsold össze a Spotify Premium fiókot, majd indítsd Premium módban.',
      409
    );
  }

  const settings = {
    winTarget: body.settings?.winTarget ?? 10,
    timeLimitSec: body.settings?.timeLimitSec ?? 90,
    // Pass-and-play-ban a lopás kikényszerítve kikapcsolt (US-PP6) — akkor is,
    // ha a kliens véletlenül mást küldene; nincs "másik játékos", aki lophatna
    // egyetlen körbeadott eszközön.
    stealEnabled: mode === 'pass_and_play' ? false : (body.settings?.stealEnabled ?? false),
    mode,
  };

  // Generate a unique 4-letter code among active (non-finished) rooms.
  let code = randomCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: existing } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code)
      .neq('status', 'finished')
      .maybeSingle();
    if (!existing) break;
    code = randomCode();
  }

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({
      code,
      host_uid: callerUid,
      deck_id: body.deckId,
      status: 'lobby',
      settings,
      spotify_playback_mode: spotifyPlaybackMode,
    })
    .select()
    .single();

  if (roomError || !room) return errorResponse('db_error', 'Nem sikerült a szoba létrehozása.', 500);

  return jsonResponse({
    roomId: room.id,
    code: room.code,
    status: room.status,
    spotifyPlaybackMode,
  });
});
