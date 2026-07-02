// generate_deck — Edge Function port of tools/deck-pipeline/ (01-fetch-playlist.js,
// 02-resolve-years.js, 03-match-previews.js), ported to Deno, NOT rewritten from
// scratch (ARCHITECTURE.md 3.1 + 9.6). Adds:
//   - D12 Storage upload of the audio preview (Spotify embed primary, iTunes fallback)
//   - iTunes-year cross-check on EVERY track (F0-REPORT 2./6.: this was the gap that
//     made playlist 3 score 76.9% instead of ~95%+ — must run on every playlist now,
//     not only when there's no Spotify embed source)
//   - global mb_year_cache table instead of a local JSON cache file
//
// The generation is synchronous within the function invocation (EdgeRuntime.waitUntil
// is not used for the MVP — see notes below); the deck row is created with
// status='generating' immediately and flipped to 'ready'/'failed' at the end, with
// progress written incrementally into decks.report so the host can poll it.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { corsHeaders, jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { normalize, primaryArtist, similarity, parsePlaylistId, sleep } from '../_shared/util.ts';

const SPOTIFY_EMBED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MB_USER_AGENT = 'HitsterOnline/0.1 (nemethdominik02@gmail.com)';
const MB_MIN_INTERVAL_MS = 1100; // stay under MusicBrainz's 1 req/s limit
const ITUNES_INTERVAL_MS = 1500; // Deno function has a wall-clock budget; kept as tight as the F0 prototype allows
const ITUNES_MIN_MATCH_SCORE = 0.55;
const MIN_USABLE_CARDS = 60; // D4
const YEAR_DISAGREEMENT_THRESHOLD = 3; // F0-REPORT 4.: |MB - iTunes| >= 3 -> uncertain flag

// ---------------------------------------------------------------------------
// Step 1: playlist -> track list via anonymous fetch of the Spotify embed page
// (ported from 01-fetch-playlist.js, unchanged logic)
// ---------------------------------------------------------------------------

interface RawTrack {
  index: number;
  uri: string | null;
  title: string;
  artist: string;
  durationMs: number | null;
  spotifyPreviewUrl: string | null;
  isPlayable: boolean;
}

interface FetchPlaylistResult {
  ok: boolean;
  reason?: string;
  playlistId?: string;
  playlistName?: string;
  trackCount?: number;
  possiblyTruncatedAt100?: boolean;
  tracks?: RawTrack[];
}

function extractNextData(html: string): any | null {
  const marker = '__NEXT_DATA__" type="application/json">';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  const end = html.indexOf('</script>', start);
  const json = html.slice(start, end);
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function fetchPlaylistViaEmbed(playlistId: string): Promise<FetchPlaylistResult> {
  const url = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const res = await fetch(url, { headers: { 'User-Agent': SPOTIFY_EMBED_USER_AGENT } });
  const html = await res.text();
  const nextData = extractNextData(html);

  if (!nextData) {
    return { ok: false, reason: `no __NEXT_DATA__ found (http ${res.status})` };
  }

  const pageProps = nextData.props?.pageProps;
  if (pageProps?.status === 404) {
    return {
      ok: false,
      reason: 'playlist not found via anonymous embed (likely private/unlisted) — needs authenticated browser fetch',
    };
  }

  const entity = pageProps?.state?.data?.entity;
  if (!entity || !entity.trackList) {
    return { ok: false, reason: 'unexpected NEXT_DATA shape, no trackList found' };
  }

  const tracks: RawTrack[] = entity.trackList.map((t: any, i: number) => ({
    index: i,
    uri: t.uri,
    title: t.title,
    artist: t.subtitle, // embed API gives artist names joined as "subtitle", no album/year here
    durationMs: t.duration ?? null,
    spotifyPreviewUrl: t.audioPreview ? t.audioPreview.url : null,
    isPlayable: t.isPlayable,
  }));

  return {
    ok: true,
    playlistId,
    playlistName: entity.name,
    trackCount: tracks.length,
    possiblyTruncatedAt100: tracks.length === 100,
    tracks,
  };
}

// ---------------------------------------------------------------------------
// Step 2: MusicBrainz year resolution (ported from 02-resolve-years.js),
// using the global mb_year_cache table instead of a local JSON file.
// ---------------------------------------------------------------------------

interface YearResolution {
  year: number | null;
  yearSource: 'musicbrainz' | 'none';
  mbMatchScore?: number;
}

function buildMbQuery(title: string, artist: string): string {
  const t = title.replace(/"/g, '');
  const a = primaryArtist(artist).replace(/"/g, '');
  return `recording:"${t}" AND artist:"${a}"`;
}

let mbLastRequestAt = 0;
async function mbThrottledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = mbLastRequestAt + MB_MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  mbLastRequestAt = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' } });
  if (res.status === 503) {
    await sleep(2000);
    mbLastRequestAt = Date.now();
    return fetch(url, { headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' } });
  }
  return res;
}

function pickEarliestYear(mbData: any, title: string, artist: string): { year: number | null; matchScore: number } {
  if (!mbData.recordings || mbData.recordings.length === 0) return { year: null, matchScore: 0 };

  let best: any = null;
  let bestScore = 0;
  for (const rec of mbData.recordings) {
    const recArtist = (rec['artist-credit'] || []).map((ac: any) => ac.name).join(' ');
    const score = similarity(rec.title, title) * 0.6 + similarity(recArtist, artist) * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = rec;
    }
  }

  if (!best || bestScore < 0.5) return { year: null, matchScore: bestScore };

  let earliest: number | null = null;
  const releases = best.releases || [];
  for (const rel of releases) {
    let dateStr = rel.date;
    if (!dateStr && rel['release-group']?.['first-release-date']) {
      dateStr = rel['release-group']['first-release-date'];
    }
    if (dateStr) {
      const year = parseInt(dateStr.slice(0, 4), 10);
      if (!isNaN(year) && (earliest === null || year < earliest)) earliest = year;
    }
  }
  if (best['first-release-date']) {
    const y = parseInt(best['first-release-date'].slice(0, 4), 10);
    if (!isNaN(y) && (earliest === null || y < earliest)) earliest = y;
  }

  return { year: earliest, matchScore: Math.round(bestScore * 100) / 100 };
}

async function resolveMbYear(
  title: string,
  artist: string,
  cacheGet: (key: string) => YearResolution | undefined,
  cacheSet: (key: string, val: YearResolution) => void
): Promise<YearResolution> {
  const cacheKey = normalize(title) + '|' + normalize(artist);
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const query = buildMbQuery(title, artist);
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
  let resolution: YearResolution;
  try {
    const res = await mbThrottledFetch(url);
    if (!res.ok) {
      resolution = { year: null, yearSource: 'none' };
    } else {
      const data = await res.json();
      const picked = pickEarliestYear(data, title, artist);
      resolution = picked.year
        ? { year: picked.year, yearSource: 'musicbrainz', mbMatchScore: picked.matchScore }
        : { year: null, yearSource: 'none', mbMatchScore: picked.matchScore };
    }
  } catch {
    resolution = { year: null, yearSource: 'none' };
  }

  cacheSet(cacheKey, resolution);
  return resolution;
}

// ---------------------------------------------------------------------------
// Step 3: iTunes preview + year cross-check (ported from 03-match-previews.js).
// Runs on EVERY track now (F0-REPORT 2./6. fix), not just as a preview fallback.
// ---------------------------------------------------------------------------

interface ItunesMatch {
  previewUrl: string | null;
  matchScore: number;
  releaseYear: number | null;
}

let itunesLastRequestAt = 0;
async function itunesThrottledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = itunesLastRequestAt + ITUNES_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  itunesLastRequestAt = Date.now();
  return fetch(url);
}

async function searchItunes(title: string, artist: string): Promise<ItunesMatch> {
  const term = `${primaryArtist(artist)} ${title}`;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=5`;
  try {
    const res = await itunesThrottledFetch(url);
    if (!res.ok) return { previewUrl: null, matchScore: 0, releaseYear: null };
    const data = await res.json();
    const results = data.results || [];
    let best: any = null;
    let bestScore = 0;
    for (const r of results) {
      const score = similarity(r.trackName, title) * 0.6 + similarity(r.artistName, artist) * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (!best || bestScore < ITUNES_MIN_MATCH_SCORE) {
      return { previewUrl: null, matchScore: Math.round(bestScore * 100) / 100, releaseYear: null };
    }
    const releaseYear = best.releaseDate ? parseInt(String(best.releaseDate).slice(0, 4), 10) : null;
    return {
      previewUrl: best.previewUrl ?? null,
      matchScore: Math.round(bestScore * 100) / 100,
      releaseYear: !isNaN(releaseYear as number) ? releaseYear : null,
    };
  } catch {
    return { previewUrl: null, matchScore: 0, releaseYear: null };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Csak POST kérés engedélyezett.', 405);
  }

  const callerUid = await getCallerUid(req);
  if (!callerUid) {
    return errorResponse('unauthorized', 'Be kell jelentkezni a pakli generálásához.', 401);
  }

  let body: { playlistUrl?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }

  if (!body.playlistUrl) {
    return errorResponse('invalid_url', 'Adj meg egy Spotify playlist URL-t.', 400);
  }

  let playlistId: string;
  try {
    playlistId = parsePlaylistId(body.playlistUrl);
  } catch {
    return errorResponse('invalid_url', 'Nem sikerült felismerni a Spotify playlist URL-t.', 400);
  }

  const supabase = adminClient();

  // Create the deck row immediately with status='generating' so the host can
  // poll decks.report for progress (3.1: "the host client polls this").
  const { data: deckRow, error: insertError } = await supabase
    .from('decks')
    .insert({
      name: playlistId,
      source_playlist_id: playlistId,
      source_playlist_url: body.playlistUrl,
      owner_id: callerUid,
      status: 'generating',
      report: { processed: 0, total: 0, step: 'fetching_playlist' },
    })
    .select()
    .single();

  if (insertError || !deckRow) {
    return errorResponse('db_error', 'Nem sikerült a pakli létrehozása.', 500);
  }

  const deckId = deckRow.id as string;

  // Step 1: fetch playlist
  const step1 = await fetchPlaylistViaEmbed(playlistId);
  if (!step1.ok || !step1.tracks) {
    const isPrivate = (step1.reason || '').includes('private');
    await supabase
      .from('decks')
      .update({
        status: 'failed',
        report: { step: 'failed', reason: step1.reason },
      })
      .eq('id', deckId);
    return errorResponse(
      isPrivate ? 'playlist_not_public' : 'playlist_fetch_failed',
      isPrivate
        ? 'Csak nyilvános playlist használható. Tedd a playlistet nyilvánossá, majd próbáld újra.'
        : 'Nem sikerült elérni a playlistet. Ellenőrizd a linket.',
      422
    );
  }

  const tracks = step1.tracks;
  const total = tracks.length;

  await supabase
    .from('decks')
    .update({
      name: step1.playlistName ?? playlistId,
      total_tracks: total,
      report: { processed: 0, total, step: 'resolving_years' },
    })
    .eq('id', deckId);

  // Load the global MB year cache for all the normalized keys we need.
  const cacheKeys = tracks.map((t) => normalize(t.title) + '|' + normalize(t.artist));
  const { data: cacheRows } = await supabase
    .from('mb_year_cache')
    .select('norm_key, year, year_source, match_score')
    .in('norm_key', cacheKeys);

  const mbCacheMap = new Map<string, YearResolution>();
  for (const row of cacheRows ?? []) {
    mbCacheMap.set(row.norm_key, {
      year: row.year,
      yearSource: (row.year_source as 'musicbrainz' | 'none') ?? 'none',
      mbMatchScore: row.match_score ?? undefined,
    });
  }
  const newCacheEntries: Array<{ norm_key: string; year: number | null; year_source: string; match_score: number | null }> = [];

  interface ProcessedTrack {
    raw: RawTrack;
    mbYear: number | null;
    mbSource: 'musicbrainz' | 'none';
    itunesPreviewUrl: string | null;
    itunesYear: number | null;
    finalYear: number | null;
    finalYearSource: string;
    yearUncertain: boolean;
    excludeReason: 'no_preview' | 'no_year' | null;
  }

  const processed: ProcessedTrack[] = [];

  // Step 2 + 3 combined per track: MB year, then iTunes preview + year
  // cross-check runs on EVERY track (F0-REPORT fix — not just as a fallback).
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const cacheKey = normalize(track.title) + '|' + normalize(track.artist);

    const mbRes = await resolveMbYear(
      track.title,
      track.artist,
      (k) => mbCacheMap.get(k),
      (k, v) => {
        mbCacheMap.set(k, v);
        newCacheEntries.push({
          norm_key: k,
          year: v.year,
          year_source: v.yearSource,
          match_score: v.mbMatchScore ?? null,
        });
      }
    );

    const itunesRes = await searchItunes(track.title, track.artist);

    // Cross-check (F0-REPORT 4.): if both sources have a year and they
    // disagree by >= 3, prefer the earlier one and flag uncertain.
    let finalYear: number | null = mbRes.year;
    let finalYearSource = mbRes.yearSource;
    let yearUncertain = false;

    if (mbRes.year && itunesRes.releaseYear) {
      if (Math.abs(mbRes.year - itunesRes.releaseYear) >= YEAR_DISAGREEMENT_THRESHOLD) {
        finalYear = Math.min(mbRes.year, itunesRes.releaseYear);
        finalYearSource = 'crosschecked';
        yearUncertain = true;
      }
    } else if (!mbRes.year && itunesRes.releaseYear) {
      // iTunes-year fallback — this is the fix for the 76.9% -> ~95%+ gap
      // documented in F0-REPORT.md 2./6.: bind the iTunes year fallback to
      // every playlist, not only when there's no Spotify embed source.
      finalYear = itunesRes.releaseYear;
      finalYearSource = 'itunes';
    }

    const preview = track.spotifyPreviewUrl ?? itunesRes.previewUrl; // D12: Spotify embed primary, iTunes fallback
    let excludeReason: 'no_preview' | 'no_year' | null = null;
    if (!finalYear) excludeReason = 'no_year';
    else if (!preview) excludeReason = 'no_preview';

    processed.push({
      raw: track,
      mbYear: mbRes.year,
      mbSource: mbRes.yearSource,
      itunesPreviewUrl: itunesRes.previewUrl,
      itunesYear: itunesRes.releaseYear,
      finalYear,
      finalYearSource,
      yearUncertain,
      excludeReason,
    });

    // Persist progress + cache incrementally so a mid-run failure doesn't lose work.
    if (i % 5 === 0 || i === tracks.length - 1) {
      await supabase
        .from('decks')
        .update({ report: { processed: i + 1, total, step: 'resolving_years' } })
        .eq('id', deckId);
      if (newCacheEntries.length > 0) {
        await supabase.from('mb_year_cache').upsert(newCacheEntries, { onConflict: 'norm_key' });
        newCacheEntries.length = 0;
      }
    }
  }

  if (newCacheEntries.length > 0) {
    await supabase.from('mb_year_cache').upsert(newCacheEntries, { onConflict: 'norm_key' });
  }

  await supabase
    .from('decks')
    .update({ report: { processed: total, total, step: 'uploading_audio' } })
    .eq('id', deckId);

  // Step 4 (D12): upload the audio preview to Storage for every usable track.
  const usableTracks = processed.filter((t) => !t.excludeReason);
  const excluded = processed
    .filter((t) => t.excludeReason)
    .map((t) => ({ title: t.raw.title, artist: t.raw.artist, reason: t.excludeReason }));

  let uploaded = 0;
  const deckCardRows: any[] = [];

  for (const t of usableTracks) {
    const sourceUrl = t.raw.spotifyPreviewUrl ?? t.itunesPreviewUrl;
    if (!sourceUrl) continue; // shouldn't happen given excludeReason check above, but stay safe

    const cardId = crypto.randomUUID();
    const audioSource = t.raw.spotifyPreviewUrl ? 'spotify_embed' : 'itunes';

    try {
      const audioRes = await fetch(sourceUrl);
      if (!audioRes.ok) throw new Error(`audio fetch failed: ${audioRes.status}`);
      const audioBuf = await audioRes.arrayBuffer();
      const path = `${deckId}/${cardId}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('deck-audio')
        .upload(path, audioBuf, { contentType: 'audio/mpeg', upsert: true });
      if (uploadError) throw uploadError;

      deckCardRows.push({
        id: cardId,
        deck_id: deckId,
        title: t.raw.title,
        artist: t.raw.artist,
        year: t.finalYear,
        year_source: t.finalYearSource,
        year_uncertain: t.yearUncertain,
        audio_url: path, // Storage PATH, not a public URL — resolved to a signed URL by draw_card (6.4)
        audio_source: audioSource,
        artwork_url: null,
        spotify_uri: t.raw.uri,
        duration_ms: t.raw.durationMs,
      });
      uploaded++;
    } catch (e) {
      // If the audio upload fails for a track, exclude it rather than fail the whole deck.
      excluded.push({ title: t.raw.title, artist: t.raw.artist, reason: 'no_preview' });
    }

    if (uploaded % 5 === 0) {
      await supabase
        .from('decks')
        .update({ report: { processed: uploaded, total: usableTracks.length, step: 'uploading_audio' } })
        .eq('id', deckId);
    }
  }

  if (deckCardRows.length > 0) {
    const { error: cardsInsertError } = await supabase.from('deck_cards').insert(deckCardRows);
    if (cardsInsertError) {
      await supabase
        .from('decks')
        .update({ status: 'failed', report: { step: 'failed', reason: 'deck_cards_insert_failed' } })
        .eq('id', deckId);
      return errorResponse('db_error', 'Nem sikerült a kártyák mentése.', 500);
    }
  }

  const usableCount = deckCardRows.length;
  const coveragePct = total > 0 ? Math.round((usableCount / total) * 1000) / 10 : 0;
  const uncertainYearCount = deckCardRows.filter((c) => c.year_uncertain).length;
  const meetsMinimum = usableCount >= MIN_USABLE_CARDS;

  const report = {
    processed: total,
    total,
    step: 'done',
    excluded,
    uncertainYearCount,
    possiblyTruncatedAt100: step1.possiblyTruncatedAt100 ?? false,
    spotifyEmbedAvailable: tracks.some((t) => t.spotifyPreviewUrl),
  };

  await supabase
    .from('decks')
    .update({
      status: 'ready',
      usable_count: usableCount,
      coverage_pct: coveragePct,
      report,
    })
    .eq('id', deckId);

  return jsonResponse({
    deckId,
    name: step1.playlistName ?? playlistId,
    totalTracks: total,
    usableCount,
    coveragePct,
    meetsMinimum,
    excluded,
    uncertainYearCount,
  });
});
