// add_manual_year_card — playtest feedback (2026-07-06): a generálás során "nincs évszám"
// miatt kimaradt trackekhez (ha volt hozzájuk elérhető audio-forrás — ld. generate_deck
// runAudioUploadPhase, ahol ezt eltároljuk a decks.report.excluded bejegyzésben) a host itt,
// a riport képernyőn, utólag megadhatja a helyes évet — ekkor a track ugyanúgy letöltésre/
// feltöltésre kerül és bekerül a pakliba, mint a normál pipeline-on átment kártyák.
//
// Csak a pakli tulajdonosa hívhatja (owner_id === callerUid), és csak akkor sikeres, ha az
// adott index alatt tényleg egy 'no_year' kizárás van, aminek van elmentett audio-forrása
// (hasSource) — 'no_preview' kizárásoknál vagy audio nélküli 'no_year'-nél nincs mit menteni.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

interface ExcludedEntry {
  title: string;
  artist: string;
  reason: 'no_preview' | 'no_year';
  index?: number;
  hasSource?: boolean;
  spotifyPreviewUrl?: string | null;
  itunesPreviewUrl?: string | null;
  spotifyUri?: string | null;
  durationMs?: number | null;
  itunesArtworkUrl?: string | null;
  audioSource?: 'spotify_embed' | 'itunes';
}

async function fetchSpotifyOembedArtwork(spotifyUri: string | null | undefined): Promise<string | null> {
  if (!spotifyUri) return null;
  const trackId = spotifyUri.split(':').pop();
  if (!trackId) return null;
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.thumbnail_url ?? null;
  } catch {
    return null;
  }
}

function inferAudioStorage(contentType: string | null, sourceUrl: string): { extension: 'mp3' | 'm4a'; contentType: string } {
  const type = (contentType ?? '').toLowerCase();
  const url = sourceUrl.toLowerCase();
  if (type.includes('mpeg') || type.includes('mp3') || url.includes('.mp3')) {
    return { extension: 'mp3', contentType: 'audio/mpeg' };
  }
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a') || url.includes('.m4a')) {
    return { extension: 'm4a', contentType: 'audio/mp4' };
  }
  if (url.includes('audio-ssl.itunes.apple.com')) {
    return { extension: 'm4a', contentType: 'audio/mp4' };
  }
  return { extension: 'mp3', contentType: 'audio/mpeg' };
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { deckId?: string; trackIndex?: number; year?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.deckId) return errorResponse('invalid_deck', 'Hiányzó pakli azonosító.', 400);
  if (typeof body.trackIndex !== 'number') return errorResponse('invalid_track', 'Hiányzó track index.', 400);
  if (typeof body.year !== 'number' || !Number.isFinite(body.year)) {
    return errorResponse('invalid_year', 'Add meg a szám évét egy számmal.', 400);
  }
  const year = Math.trunc(body.year);

  const supabase = adminClient();

  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, owner_id, report, usable_count, total_tracks')
    .eq('id', body.deckId)
    .single();

  if (deckError || !deck) return errorResponse('deck_not_found', 'A pakli nem található.', 404);
  if (deck.owner_id !== callerUid) return errorResponse('not_owner', 'Csak a pakli létrehozója egészítheti ki.', 403);

  const report = (deck.report ?? {}) as { excluded?: ExcludedEntry[]; meetsMinimum?: boolean };
  const excludedList = report.excluded ?? [];
  const entry = excludedList.find((e) => e.index === body.trackIndex && e.reason === 'no_year');

  if (!entry) return errorResponse('track_not_found', 'A track nem található a kimaradt listában.', 404);
  if (!entry.hasSource) {
    return errorResponse('no_audio_source', 'Ehhez a számhoz nincs elérhető hangforrás, nem menthető.', 409);
  }

  const sourceUrl = entry.spotifyPreviewUrl ?? entry.itunesPreviewUrl;
  if (!sourceUrl) return errorResponse('no_audio_source', 'Ehhez a számhoz nincs elérhető hangforrás, nem menthető.', 409);

  const cardId = crypto.randomUUID();

  try {
    const [audioRes, artworkUrl] = await Promise.all([
      fetch(sourceUrl),
      entry.itunesArtworkUrl ? Promise.resolve(entry.itunesArtworkUrl) : fetchSpotifyOembedArtwork(entry.spotifyUri),
    ]);
    if (!audioRes.ok) throw new Error(`audio fetch failed: ${audioRes.status}`);
    const audioBuf = await audioRes.arrayBuffer();
    const audioStorage = inferAudioStorage(audioRes.headers.get('content-type'), sourceUrl);
    const path = `${deck.id}/${cardId}.${audioStorage.extension}`;
    const { error: uploadError } = await supabase.storage
      .from('deck-audio')
      .upload(path, audioBuf, { contentType: audioStorage.contentType, upsert: true });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from('deck_cards').insert({
      id: cardId,
      deck_id: deck.id,
      title: entry.title,
      artist: entry.artist,
      year,
      year_source: 'host_manual',
      year_uncertain: false,
      audio_url: path,
      audio_source: entry.audioSource ?? 'itunes',
      artwork_url: artworkUrl,
      spotify_uri: entry.spotifyUri ?? null,
      duration_ms: entry.durationMs ?? null,
    });
    if (insertError) throw insertError;
  } catch (err) {
    return errorResponse('save_failed', 'Nem sikerült a szám mentése: ' + String(err), 500);
  }

  const usableCount = (deck.usable_count ?? 0) + 1;
  const totalTracks = deck.total_tracks ?? usableCount;
  const coveragePct = totalTracks > 0 ? Math.round((usableCount / totalTracks) * 1000) / 10 : 0;
  const remainingExcluded = excludedList.filter((e) => !(e.index === body.trackIndex && e.reason === 'no_year'));
  const meetsMinimum = usableCount >= 60;

  await supabase
    .from('decks')
    .update({
      usable_count: usableCount,
      coverage_pct: coveragePct,
      report: { ...report, excluded: remainingExcluded, meetsMinimum },
    })
    .eq('id', deck.id);

  return jsonResponse({
    ok: true,
    usableCount,
    coveragePct,
    meetsMinimum,
    excluded: remainingExcluded,
  });
});
