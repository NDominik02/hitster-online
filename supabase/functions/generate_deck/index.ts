// generate_deck — Edge Function port of tools/deck-pipeline/ (01-fetch-playlist.js,
// 02-resolve-years.js, 03-match-previews.js), ported to Deno, NOT rewritten from
// scratch (ARCHITECTURE.md 3.1 + 9.6). Adds:
//   - D12 Storage upload of the audio preview (Spotify embed primary, iTunes fallback)
//   - iTunes-year cross-check on EVERY track (F0-REPORT 2./6.: this was the gap that
//     made playlist 3 score 76.9% instead of ~95%+ — must run on every playlist now,
//     not only when there's no Spotify embed source)
//   - global mb_year_cache table instead of a local JSON cache file
//
// TIMEOUT FIX (2026-07-02, post-launch bug): the original implementation ran
// fully synchronously inside the HTTP request/response cycle. Free-tier Edge
// Functions have a hard 150s WALL CLOCK limit that EdgeRuntime.waitUntil()
// does NOT extend — it only keeps the worker alive after the response is
// sent, within the SAME wall-clock window the request started in. At ~2.6s/
// track (1.1s MusicBrainz throttle + 1.5s iTunes throttle, sequential), even
// 60 tracks (D4 minimum) already exceeds 150s before the audio-upload phase
// even starts. Reproduced 3/3 times on a 100-track playlist: HTTP 546 at
// exactly ~150.1s, decks stuck at status='generating' forever (no real
// background continuation existed).
//
// Fix, two parts:
//   1. Per-track MusicBrainz + iTunes calls now run IN PARALLEL (Promise.all)
//      instead of sequentially — this is safe because the two APIs are
//      independent and each has its own separate rate limiter/throttle
//      state, so the ~2.6s/track drops to ~max(1.1s, 1.5s) = ~1.5s/track.
//   2. The real fix: the function now returns the HTTP response IMMEDIATELY
//      after creating the `decks` row and validating the input (a few
//      hundred ms), then does the actual work in a self-chaining background
//      task via EdgeRuntime.waitUntil(). Each invocation only processes one
//      time-boxed BATCH of tracks (bounded well under the 150s wall clock,
//      leaving headroom for audio upload of that batch), and if there's
//      more work left, it re-invokes itself over HTTP (fetch to its own
//      function URL, service-role authenticated) to continue with the next
//      batch — so arbitrarily large playlists complete via a chain of
//      short-lived invocations instead of one long-lived one.

import { adminClient } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import { normalize, primaryArtist, similarity, parsePlaylistId, sleep } from '../_shared/util.ts';
import { getValidSpotifyAccessToken } from '../_shared/spotify.ts';
import { callerIsAdmin } from '../_shared/admin.ts';

const SPOTIFY_EMBED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MB_USER_AGENT = 'HitsterOnline/0.1 (nemethdominik02@gmail.com)';
const MB_MIN_INTERVAL_MS = 1100; // stay under MusicBrainz's 1 req/s limit
const ITUNES_INTERVAL_MS = 1500; // kept as tight as the F0 prototype allows
const ITUNES_MIN_MATCH_SCORE = 0.55;
const ITUNES_CACHE_VERSION = 'v2';
const ITUNES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_USABLE_CARDS = 60; // D4
const YEAR_DISAGREEMENT_THRESHOLD = 3; // F0-REPORT 4.: |MB - iTunes| >= 3 -> uncertain flag
// Spotify's playlist item pagination max is 50. Asking for 100 makes the
// authenticated widen fetch fail and silently leaves us with the 100-item embed.
const SPOTIFY_PLAYLIST_PAGE_LIMIT = 50;
// S20-bővítés (F3): a Premium-kapcsolattal rendelkező hostoknál a hitelesített
// Web API-val a 100-as embed-korlát fölé is lapozunk, de van egy józan felső
// határ — a MusicBrainz 1 req/s throttle miatt 500 track már hosszú,
// generálást jelent (a meglévő self-chaining batch-logika ezt kezeli, csak
// nem szabad a hostot a végtelenségig várakoztatni egyetlen playlistért).
const MAX_TRACKS_PREMIUM = 500;

// Time-boxing for the self-chaining background worker. Free tier wall clock
// is 150s; we budget well under that per invocation so there's headroom for
// the audio-download+upload step (which is itself per-track I/O) and so a
// slow MusicBrainz response near the boundary doesn't blow the 150s wall.
const BATCH_TIME_BUDGET_MS = 90_000; // stop picking up new tracks after this much wall time in one invocation
const SELF_INVOKE_HEADROOM_MS = 5_000; // leave this much slack before actually hitting BATCH_TIME_BUDGET_MS
const RESOLVE_CONCURRENCY = 4;
const AUDIO_UPLOAD_CONCURRENCY = 4;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FUNCTION_SELF_URL = `${SUPABASE_URL}/functions/v1/generate_deck`;

type AudioPipeline = 'spotify_only' | 'accurate_spotify' | 'verified_audio';

function normalizeAudioPipeline(value: unknown): AudioPipeline {
  if (value === 'spotify_only') return 'spotify_only';
  if (value === 'accurate_spotify') return 'accurate_spotify';
  return 'verified_audio';
}

function normalizeRequestedAudioPipeline(value: unknown): AudioPipeline {
  if (value === 'accurate_spotify') return 'accurate_spotify';
  return value === 'verified_audio' ? 'verified_audio' : 'spotify_only';
}

function qualityStatusForPipeline(audioPipeline: AudioPipeline): string {
  if (audioPipeline === 'spotify_only') return 'fast_spotify';
  if (audioPipeline === 'accurate_spotify') return 'accurate_spotify';
  return 'verified';
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

function finalGenerationDiagnostics(report: Record<string, any>): Record<string, unknown> {
  return {
    ...(typeof report.audioPipeline === 'string' ? { audioPipeline: report.audioPipeline } : {}),
    ...(typeof report.qualityStatus === 'string' ? { qualityStatus: report.qualityStatus } : {}),
    ...(report.starred === true ? { starred: true } : {}),
    ...(report.promotedFromDeckId ? { promotedFromDeckId: report.promotedFromDeckId } : {}),
    ...(report.playlistName ? { playlistName: report.playlistName } : {}),
    ...(Array.isArray(report.sourcePlaylistIds) ? { sourcePlaylistIds: report.sourcePlaylistIds } : {}),
    ...(Array.isArray(report.sourceReports) ? { sourceReports: report.sourceReports } : {}),
    ...(typeof report.mergedTrackCountBeforeDedupe === 'number'
      ? { mergedTrackCountBeforeDedupe: report.mergedTrackCountBeforeDedupe }
      : {}),
    ...(typeof report.possiblyTruncatedAt100 === 'boolean' ? { possiblyTruncatedAt100: report.possiblyTruncatedAt100 } : {}),
    ...(typeof report.playlistImportWarning === 'string'
      ? { playlistImportWarning: report.playlistImportWarning }
      : {}),
    ...(Array.isArray(report.tracksCache) ? { fetchedTrackCount: report.tracksCache.length } : {}),
  };
}

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
  spotifyReleaseYear: number | null;
  spotifyReleaseDatePrecision: string | null;
  spotifyArtworkUrl: string | null;
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

function parseReleaseYear(releaseDate: unknown): number | null {
  if (typeof releaseDate !== 'string' || releaseDate.length < 4) return null;
  const year = parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) && year >= 1900 && year <= new Date().getUTCFullYear() + 1 ? year : null;
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
    spotifyReleaseYear: null,
    spotifyReleaseDatePrecision: null,
    spotifyArtworkUrl: null,
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

// S20-bővítés (F3): a Premium-kapcsolattal rendelkező host hitelesített
// tokenjével lapozva lekéri a TELJES track-listát (a Spotify Web API
// /playlists/{id}/items végpontja lapozható, nincs 100-as korlátja — az
// anonim embed oldal viszont MAGA a Spotify vágja le 100-nál). A
// preview_url mezőt a hitelesített API 2024 november óta nem adja vissza
// megbízhatóan új appoknak (F0-REPORT 5. szakasz) — ezért ez a fetch szinte
// biztosan null preview_url-lel tér vissza minden trackre; a hívó fél
// (runGenerationWork) ráfedi az embed 100 track-nyi audioPreview adatát
// URI alapján, 100 fölött pedig egyszerűen iTunes-fallbackre esik a track.
async function fetchPlaylistTracksAuthenticated(
  playlistId: string,
  accessToken: string,
  maxTracks: number
): Promise<{
  ok: boolean;
  tracks?: RawTrack[];
  playlistName?: string;
  reason?: string;
  spotifyTotal?: number;
  pagesFetched?: number;
  stopReason?: string;
}> {
  try {
    const metaRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      const text = await metaRes.text().catch(() => '');
      return { ok: false, reason: `playlist meta fetch failed (${metaRes.status}) ${text}`.trim() };
    }
    const meta = await metaRes.json();

    const tracks: RawTrack[] = [];
    let spotifyTotal: number | undefined;
    let pagesFetched = 0;
    let offset = 0;
    let stopReason = 'done';

    while (tracks.length < maxTracks) {
      // Keep this request intentionally narrow. Newer Spotify apps can get
      // 403s for some catalog/playability fields; for widening beyond the
      // embed's first 100 tracks we need identity metadata plus album release
      // year as a soft fallback when MusicBrainz/iTunes find no year.
      const buildPageUrl = (includeAlbumRelease: boolean) =>
        `https://api.spotify.com/v1/playlists/${playlistId}/items` +
        `?fields=${
          includeAlbumRelease
            ? 'items(item(uri,name,artists(name),duration_ms,type,album(release_date,release_date_precision,images(url,width,height)))),total'
            : 'items(item(uri,name,artists(name),duration_ms,type)),total'
        }&limit=${SPOTIFY_PLAYLIST_PAGE_LIMIT}&offset=${offset}`;

      let url = buildPageUrl(true);
      let res: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      let albumFieldFailure = '';
      if (!res.ok && res.status === 403) {
        albumFieldFailure = await res.text().catch(() => '');
        const fallbackUrl = buildPageUrl(false);
        const fallbackRes = await fetch(fallbackUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (fallbackRes.ok) {
          console.log(
            `[premium-widen] album release fields forbidden, retried without album fields afterTracks=${tracks.length} url=${url} body=${albumFieldFailure}`
          );
          url = fallbackUrl;
          res = fallbackRes;
        } else {
          res = fallbackRes;
          url = fallbackUrl;
        }
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const albumFailureDetail = albumFieldFailure ? ` album fields 403: ${albumFieldFailure}` : '';
        const failureReason = `page fetch failed (${res.status}) ${text}${albumFailureDetail}`.trim();
        console.log(
          `[premium-widen] page fetch failed status=${res.status} afterTracks=${tracks.length} url=${url} body=${text}`
        );
        stopReason = failureReason;
        if (tracks.length === 0) {
          return {
            ok: false,
            reason: failureReason,
            tracks,
            playlistName: meta.name,
            spotifyTotal,
            pagesFetched,
            stopReason,
          };
        }
        break; // a partial list is still more useful than bailing entirely
      }
      const page = await res.json();
      pagesFetched++;
      if (typeof page.total === 'number') spotifyTotal = page.total;
      const items = page.items ?? [];
      if (items.length === 0) {
        stopReason = `empty page at offset ${offset}`;
        break;
      }

      for (const item of page.items ?? []) {
        const t = item.track ?? item.item;
        if (!t || t.type === 'episode') continue;
        tracks.push({
          index: tracks.length,
          uri: t.uri ?? null,
          title: t.name,
          artist: (t.artists ?? []).map((a: { name: string }) => a.name).join(', '),
          durationMs: t.duration_ms ?? null,
          spotifyPreviewUrl: t.preview_url ?? null,
          spotifyReleaseYear: parseReleaseYear(t.album?.release_date),
          spotifyReleaseDatePrecision: t.album?.release_date_precision ?? null,
          spotifyArtworkUrl:
            (t.album?.images ?? [])
              .slice()
              .sort((a: { width?: number }, b: { width?: number }) => (a.width ?? 0) - (b.width ?? 0))
              .find((image: { url?: string }) => typeof image.url === 'string')?.url ?? null,
          isPlayable: t.is_playable ?? true,
        });
        if (tracks.length >= maxTracks) break;
      }

      offset += SPOTIFY_PLAYLIST_PAGE_LIMIT;
      if (typeof spotifyTotal === 'number' && offset >= spotifyTotal) break;
    }

    if (tracks.length >= maxTracks && typeof spotifyTotal === 'number' && spotifyTotal > maxTracks) {
      stopReason = `maxTracks ${maxTracks} reached before spotifyTotal ${spotifyTotal}`;
    }

    return { ok: true, tracks, playlistName: meta.name, spotifyTotal, pagesFetched, stopReason };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

function dedupeRawTracks(tracks: RawTrack[]): RawTrack[] {
  const seen = new Set<string>();
  const deduped: RawTrack[] = [];

  for (const track of tracks) {
    const key = track.uri ?? `${normalize(track.title)}|${normalize(track.artist)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...track, index: deduped.length });
  }

  return deduped;
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

// MusicBrainz and iTunes each get their OWN independent throttle clock, so
// a track's two lookups can run concurrently (Promise.all in processTrack)
// instead of stacking sequentially — this is the main per-track speedup.
let mbNextRequestAt = 0;
async function reserveMbRequestSlot(): Promise<void> {
  const now = Date.now();
  const scheduledAt = Math.max(now, mbNextRequestAt);
  mbNextRequestAt = scheduledAt + MB_MIN_INTERVAL_MS;
  if (scheduledAt > now) await sleep(scheduledAt - now);
}

async function mbThrottledFetch(url: string): Promise<Response> {
  await reserveMbRequestSlot();
  const res = await fetch(url, { headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' } });
  if (res.status === 503) {
    await sleep(2000);
    await reserveMbRequestSlot();
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
  cacheGet: (key: string) => YearResolution | undefined
): Promise<YearResolution> {
  const cacheKey = normalize(title) + '|' + normalize(artist);
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const query = buildMbQuery(title, artist);
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
  try {
    const res = await mbThrottledFetch(url);
    if (!res.ok) return { year: null, yearSource: 'none' };
    const data = await res.json();
    const picked = pickEarliestYear(data, title, artist);
    return picked.year
      ? { year: picked.year, yearSource: 'musicbrainz', mbMatchScore: picked.matchScore }
      : { year: null, yearSource: 'none', mbMatchScore: picked.matchScore };
  } catch {
    return { year: null, yearSource: 'none' };
  }
}

// ---------------------------------------------------------------------------
// Step 3: iTunes preview + year cross-check (ported from 03-match-previews.js).
// Runs on EVERY track now (F0-REPORT 2./6. fix), not just as a preview fallback.
// ---------------------------------------------------------------------------

interface ItunesMatch {
  previewUrl: string | null;
  matchScore: number;
  releaseYear: number | null;
  artworkUrl: string | null;
  matchedTitle: string | null;
  matchedArtist: string | null;
  status: 'matched' | 'no_match' | 'request_failed';
}

let itunesNextRequestAt = 0;
async function reserveItunesRequestSlot(): Promise<void> {
  const now = Date.now();
  const scheduledAt = Math.max(now, itunesNextRequestAt);
  itunesNextRequestAt = scheduledAt + ITUNES_INTERVAL_MS;
  if (scheduledAt > now) await sleep(scheduledAt - now);
}

async function itunesThrottledFetch(url: string): Promise<Response> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await reserveItunesRequestSlot();
    response = await fetch(url);
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt < 2) await sleep(500 * (attempt + 1));
  }
  return response!;
}

function emptyItunesMatch(status: ItunesMatch['status'], matchScore = 0): ItunesMatch {
  return {
    previewUrl: null,
    matchScore: Math.round(matchScore * 100) / 100,
    releaseYear: null,
    artworkUrl: null,
    matchedTitle: null,
    matchedArtist: null,
    status,
  };
}

interface ScoredItunesResult {
  best: any | null;
  score: number;
  titleScore: number;
  artistScore: number;
}

function pickBestItunesResult(results: any[], title: string, artist: string): ScoredItunesResult {
  let best: any = null;
  let bestScore = 0;
  let bestTitleScore = 0;
  let bestArtistScore = 0;
  for (const result of results) {
    const titleScore = similarity(result.trackName, title);
    const artistScore = Math.max(similarity(result.artistName, artist), similarity(result.artistName, primaryArtist(artist)));
    const score = titleScore * 0.6 + artistScore * 0.4;
    if (score > bestScore) {
      bestScore = score;
      bestTitleScore = titleScore;
      bestArtistScore = artistScore;
      best = result;
    }
  }
  return { best, score: bestScore, titleScore: bestTitleScore, artistScore: bestArtistScore };
}

function isAcceptableItunesResult(result: ScoredItunesResult): boolean {
  return Boolean(
    result.best?.previewUrl &&
      result.score >= ITUNES_MIN_MATCH_SCORE &&
      result.titleScore >= 0.6 &&
      result.artistScore >= 0.45
  );
}

async function fetchItunesResults(term: string, attribute?: 'songTerm'): Promise<any[] | null> {
  const params = new URLSearchParams({ term, media: 'music', entity: 'song', limit: attribute ? '25' : '10', country: 'HU' });
  if (attribute) params.set('attribute', attribute);
  const res = await itunesThrottledFetch(`https://itunes.apple.com/search?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results ?? [];
}

async function searchItunes(title: string, artist: string): Promise<ItunesMatch> {
  try {
    const primaryResults = await fetchItunesResults(`${primaryArtist(artist)} ${title}`);
    if (primaryResults === null) return emptyItunesMatch('request_failed');

    let picked = pickBestItunesResult(primaryResults, title, artist);
    if (!isAcceptableItunesResult(picked)) {
      const titleResults = await fetchItunesResults(title, 'songTerm');
      if (titleResults === null) return emptyItunesMatch('request_failed', picked.score);
      const titlePicked = pickBestItunesResult(titleResults, title, artist);
      if (titlePicked.score > picked.score) picked = titlePicked;
    }

    if (!isAcceptableItunesResult(picked)) {
      return emptyItunesMatch('no_match', picked.score);
    }

    const releaseYear = picked.best.releaseDate ? parseInt(String(picked.best.releaseDate).slice(0, 4), 10) : null;
    const artworkUrl = picked.best.artworkUrl100
      ? String(picked.best.artworkUrl100).replace('100x100bb', '600x600bb')
      : null;
    return {
      previewUrl: picked.best.previewUrl,
      matchScore: Math.round(picked.score * 100) / 100,
      releaseYear: !isNaN(releaseYear as number) ? releaseYear : null,
      artworkUrl,
      matchedTitle: picked.best.trackName ?? null,
      matchedArtist: picked.best.artistName ?? null,
      status: 'matched',
    };
  } catch {
    return emptyItunesMatch('request_failed');
  }
}

// ---------------------------------------------------------------------------
// Per-track processing: MB year + iTunes preview/year run IN PARALLEL.
// ---------------------------------------------------------------------------

interface ProcessedTrack {
  raw: RawTrack;
  finalYear: number | null;
  finalYearSource: string;
  yearUncertain: boolean;
  itunesPreviewUrl: string | null;
  itunesArtworkUrl: string | null;
  excludeReason: 'no_preview' | 'no_year' | null;
  newCacheEntry?: { norm_key: string; year: number | null; year_source: string; match_score: number | null };
  newItunesCacheEntry?: {
    norm_key: string;
    preview_url: string | null;
    match_score: number;
    release_year: number | null;
    artwork_url: string | null;
    matched_title: string | null;
    matched_artist: string | null;
    cached_at: string;
  };
}

function itunesCacheKey(title: string, artist: string): string {
  return `${ITUNES_CACHE_VERSION}|${normalize(title)}|${normalize(artist)}`;
}

async function processTrack(
  track: RawTrack,
  mbCacheMap: Map<string, YearResolution>,
  itunesCacheMap: Map<string, ItunesMatch>
): Promise<ProcessedTrack> {
  const cacheKey = normalize(track.title) + '|' + normalize(track.artist);
  const cachedItunes = itunesCacheMap.get(itunesCacheKey(track.title, track.artist));

  // The two providers remain independent. A fresh iTunes cache hit removes
  // one throttled network request without changing the matching rules.
  const [mbRes, itunesRes] = await Promise.all([
    resolveMbYear(track.title, track.artist, (k) => mbCacheMap.get(k)),
    cachedItunes ? Promise.resolve(cachedItunes) : searchItunes(track.title, track.artist),
  ]);

  let newCacheEntry: ProcessedTrack['newCacheEntry'];
  if (!mbCacheMap.has(cacheKey)) {
    mbCacheMap.set(cacheKey, mbRes);
    newCacheEntry = {
      norm_key: cacheKey,
      year: mbRes.year,
      year_source: mbRes.yearSource,
      match_score: mbRes.mbMatchScore ?? null,
    };
  }

  let newItunesCacheEntry: ProcessedTrack['newItunesCacheEntry'];
  if (!cachedItunes && itunesRes.status !== 'request_failed') {
    itunesCacheMap.set(itunesCacheKey(track.title, track.artist), itunesRes);
    newItunesCacheEntry = {
      norm_key: itunesCacheKey(track.title, track.artist),
      preview_url: itunesRes.previewUrl,
      match_score: itunesRes.matchScore,
      release_year: itunesRes.releaseYear,
      artwork_url: itunesRes.artworkUrl,
      matched_title: itunesRes.matchedTitle,
      matched_artist: itunesRes.matchedArtist,
      cached_at: new Date().toISOString(),
    };
  }

  let finalYear: number | null = mbRes.year;
  let finalYearSource: string = mbRes.yearSource;
  let yearUncertain = false;

  if (mbRes.year && itunesRes.releaseYear) {
    if (Math.abs(mbRes.year - itunesRes.releaseYear) >= YEAR_DISAGREEMENT_THRESHOLD) {
      finalYear = Math.min(mbRes.year, itunesRes.releaseYear);
      finalYearSource = 'crosschecked';
      yearUncertain = true;
    }
  } else if (!mbRes.year && itunesRes.releaseYear) {
    // iTunes-year fallback — the F0-REPORT 2./6. fix: bind this to every
    // playlist, not only when there's no Spotify embed source.
    finalYear = itunesRes.releaseYear;
    finalYearSource = 'itunes';
  }

  if (!finalYear && track.spotifyReleaseYear) {
    // Spotify album release dates are excellent coverage fallbacks, but they
    // can point at album/remaster/compilation dates instead of the original
    // single release. Use them only when MB+iTunes found no year, and mark
    // them uncertain so the report still surfaces that this was a softer hit.
    finalYear = track.spotifyReleaseYear;
    finalYearSource = 'spotify_album';
    yearUncertain = true;
  }

  const preview = track.spotifyPreviewUrl ?? itunesRes.previewUrl; // D12: Spotify embed primary, iTunes fallback
  const hasPlayableSource = Boolean(preview || track.uri);
  let excludeReason: 'no_preview' | 'no_year' | null = null;
  if (!finalYear) excludeReason = 'no_year';
  else if (!hasPlayableSource) excludeReason = 'no_preview';

  return {
    raw: track,
    finalYear,
    finalYearSource,
    yearUncertain,
    itunesPreviewUrl: itunesRes.previewUrl,
    itunesArtworkUrl: itunesRes.artworkUrl,
    excludeReason,
    newCacheEntry,
    newItunesCacheEntry,
  };
}

async function finalizeSpotifyOnlyDeck(
  supabase: ReturnType<typeof adminClient>,
  deckId: string,
  tracks: RawTrack[],
  playlistName: string,
  possiblyTruncatedAt100: boolean,
  playlistImportWarning?: string
): Promise<void> {
  const deckCardRows: any[] = [];
  const excluded: any[] = [];

  for (const track of tracks) {
    if (!track.spotifyReleaseYear) {
      excluded.push({
        title: track.title,
        artist: track.artist,
        reason: 'no_year',
        index: track.index,
        hasSource: Boolean(track.uri),
        ...(track.uri
          ? {
              spotifyUri: track.uri,
              durationMs: track.durationMs,
              spotifyArtworkUrl: track.spotifyArtworkUrl,
              audioSource: 'spotify',
            }
          : {}),
      });
      continue;
    }

    if (!track.uri) {
      excluded.push({
        title: track.title,
        artist: track.artist,
        reason: 'no_preview',
        index: track.index,
        detail: 'missing_spotify_uri',
      });
      continue;
    }

    deckCardRows.push({
      id: crypto.randomUUID(),
      deck_id: deckId,
      title: track.title,
      artist: track.artist,
      year: track.spotifyReleaseYear,
      year_source: 'spotify_album',
      year_uncertain: true,
      audio_url: null,
      audio_source: 'spotify',
      artwork_url: track.spotifyArtworkUrl,
      spotify_uri: track.uri,
      duration_ms: track.durationMs,
    });
  }

  if (deckCardRows.length > 0) {
    const { error: cardsInsertError } = await supabase.from('deck_cards').insert(deckCardRows);
    if (cardsInsertError) {
      await supabase
        .from('decks')
        .update({ status: 'failed', report: { step: 'failed', reason: 'deck_cards_insert_failed: ' + cardsInsertError.message } })
        .eq('id', deckId);
      return;
    }
  }

  const total = tracks.length;
  const usableCount = deckCardRows.length;
  const coveragePct = total > 0 ? Math.round((usableCount / total) * 1000) / 10 : 0;
  const { data: deckRow } = await supabase.from('decks').select('report').eq('id', deckId).single();
  const report = (deckRow?.report ?? {}) as Record<string, any>;

  await supabase
    .from('decks')
    .update({
      status: 'ready',
      usable_count: usableCount,
      coverage_pct: coveragePct,
      report: {
        ...finalGenerationDiagnostics(report),
        audioPipeline: 'spotify_only',
        qualityStatus: 'fast_spotify',
        processed: total,
        total,
        step: 'done',
        playlistName,
        possiblyTruncatedAt100,
        ...(playlistImportWarning ? { playlistImportWarning } : {}),
        fetchedTrackCount: tracks.length,
        excluded,
        uncertainYearCount: usableCount,
        spotifyOnlyCount: usableCount,
        downloadedPreviewCount: 0,
        previewFallbackCount: 0,
        meetsMinimum: usableCount >= MIN_USABLE_CARDS,
      },
    })
    .eq('id', deckId);
}

// ---------------------------------------------------------------------------
// Background worker: processes ONE time-boxed batch, persists progress, and
// self-chains (re-invokes itself over HTTP) if there's more to do. This is
// what actually runs inside EdgeRuntime.waitUntil() — kept well under the
// 150s wall clock per invocation, unlike the old fully-synchronous version.
// ---------------------------------------------------------------------------

async function runGenerationWork(deckId: string, playlistId: string, resumeCursor: number): Promise<void> {
  const supabase = adminClient();
  const startedAt = Date.now();

  try {
    const { data: deckRow } = await supabase.from('decks').select('owner_id, report').eq('id', deckId).single();
    let tracks: RawTrack[];
    let playlistName: string;
    let possiblyTruncatedAt100 = false;
    let playlistImportWarning: string | undefined;

    // Playlist fetch only needs to happen once — cache it in decks.report so
    // resumed invocations (self-chained batches) don't re-fetch it.
    const existingReport = (deckRow?.report ?? {}) as any;
    const audioPipeline = normalizeAudioPipeline(existingReport.audioPipeline);
    if (existingReport.tracksCache) {
      tracks = existingReport.tracksCache;
      playlistName = existingReport.playlistName ?? playlistId;
      possiblyTruncatedAt100 = existingReport.possiblyTruncatedAt100 ?? false;
      playlistImportWarning = existingReport.playlistImportWarning;
    } else {
      const sourcePlaylistIds =
        Array.isArray(existingReport.sourcePlaylistIds) && existingReport.sourcePlaylistIds.length > 0
          ? (existingReport.sourcePlaylistIds as string[])
          : [playlistId];

      if (audioPipeline === 'spotify_only') {
        const ownerId = deckRow?.owner_id as string | undefined;
        const token = ownerId ? await getValidSpotifyAccessToken(supabase, ownerId) : null;
        if (!token) {
          await supabase
            .from('decks')
            .update({
              status: 'failed',
              report: {
                ...existingReport,
                step: 'failed',
                reason: 'spotify_connection_required',
                errorCode: 'spotify_connection_required',
              },
            })
            .eq('id', deckId);
          return;
        }

        const sourceNames: string[] = [];
        const sourceReports: Array<{
          playlistId: string;
          name: string;
          trackCount: number;
          possiblyTruncatedAt100: boolean;
          spotifyTotal?: number;
        }> = [];
        const mergedTracks: RawTrack[] = [];
        const sourceWarnings: string[] = [];

        for (const sourcePlaylistId of sourcePlaylistIds) {
          const full = await fetchPlaylistTracksAuthenticated(sourcePlaylistId, token.accessToken, MAX_TRACKS_PREMIUM);
          if (!full.ok || !full.tracks) {
            await supabase
              .from('decks')
              .update({
                status: 'failed',
                report: {
                  ...existingReport,
                  step: 'failed',
                  reason: full.reason ?? 'playlist_fetch_failed',
                  errorCode: 'playlist_fetch_failed',
                  sourcePlaylistId,
                },
              })
              .eq('id', deckId);
            return;
          }

          const sourceName = full.playlistName ?? sourcePlaylistId;
          const sourcePossiblyTruncatedAt100 =
            full.tracks.length >= MAX_TRACKS_PREMIUM &&
            typeof full.spotifyTotal === 'number' &&
            full.spotifyTotal > full.tracks.length;
          if (sourcePossiblyTruncatedAt100) {
            sourceWarnings.push(`${sourceName}: a Spotify playlist nagyon hosszú, ezért az első ${MAX_TRACKS_PREMIUM} számot importáltuk.`);
          }

          sourceNames.push(sourceName);
          sourceReports.push({
            playlistId: sourcePlaylistId,
            name: sourceName,
            trackCount: full.tracks.length,
            possiblyTruncatedAt100: sourcePossiblyTruncatedAt100,
            spotifyTotal: full.spotifyTotal,
          });
          mergedTracks.push(...full.tracks);
        }

        tracks = dedupeRawTracks(mergedTracks);
        playlistName = existingReport.deckName ?? sourceNames.join(' + ');
        possiblyTruncatedAt100 = sourceReports.some((source) => source.possiblyTruncatedAt100);
        playlistImportWarning =
          sourceWarnings.length > 0
            ? sourceWarnings.length === 1
              ? sourceWarnings[0]
              : `${sourceWarnings.length} playlist importkorlátba futott. Részletek: ${sourceWarnings.join(' ')}`
            : undefined;

        await supabase
          .from('decks')
          .update({
            name: playlistName,
            total_tracks: tracks.length,
            report: {
              ...existingReport,
              audioPipeline,
              qualityStatus: qualityStatusForPipeline(audioPipeline),
              processed: 0,
              total: tracks.length,
              step: 'building_spotify_only_cards',
              tracksCache: tracks,
              playlistName,
              possiblyTruncatedAt100,
              playlistImportWarning,
              sourcePlaylistIds,
              sourceReports,
              mergedTrackCountBeforeDedupe: mergedTracks.length,
            },
          })
          .eq('id', deckId);
      } else if (sourcePlaylistIds.length > 1) {
        const ownerId = deckRow?.owner_id as string | undefined;
        const sourceNames: string[] = [];
        const sourceReports: Array<{ playlistId: string; name: string; trackCount: number; possiblyTruncatedAt100: boolean }> = [];
        const mergedTracks: RawTrack[] = [];
        const sourceWarnings: string[] = [];

        for (const sourcePlaylistId of sourcePlaylistIds) {
          const step1 = await fetchPlaylistViaEmbed(sourcePlaylistId);
          if (!step1.ok || !step1.tracks) {
            const isPrivate = (step1.reason || '').includes('private');
            await supabase
              .from('decks')
              .update({
                status: 'failed',
                report: {
                  step: 'failed',
                  reason: step1.reason,
                  errorCode: isPrivate ? 'playlist_not_public' : 'playlist_fetch_failed',
                  sourcePlaylistId,
                },
              })
              .eq('id', deckId);
            return;
          }

          let sourceTracks = step1.tracks;
          let sourcePossiblyTruncatedAt100 = step1.possiblyTruncatedAt100 ?? false;
          const sourceName = step1.playlistName ?? sourcePlaylistId;

          if (sourcePossiblyTruncatedAt100) {
            console.log(`[premium-widen] deck=${deckId} source=${sourcePlaylistId} ownerId=${ownerId ?? 'MISSING'}`);
            if (ownerId) {
              const token = await getValidSpotifyAccessToken(supabase, ownerId);
              console.log(`[premium-widen] token=${token ? 'valid' : 'MISSING/invalid'}`);
              if (token) {
                const full = await fetchPlaylistTracksAuthenticated(sourcePlaylistId, token.accessToken, MAX_TRACKS_PREMIUM);
                console.log(
                  `[premium-widen] fetch ok=${full.ok} reason=${full.reason ?? 'n/a'} fetchedTracks=${full.tracks?.length ?? 0} embedTracks=${sourceTracks.length} spotifyTotal=${full.spotifyTotal ?? 'unknown'} pages=${full.pagesFetched ?? 0} stop=${full.stopReason ?? 'n/a'}`
                );
                if (full.ok && full.tracks && full.tracks.length > sourceTracks.length) {
                  const previewByUri = new Map(
                    sourceTracks.filter((t) => t.uri).map((t) => [t.uri as string, t.spotifyPreviewUrl])
                  );
                  sourceTracks = full.tracks.map((t) => ({
                    ...t,
                    spotifyPreviewUrl: t.uri ? (previewByUri.get(t.uri) ?? t.spotifyPreviewUrl) : t.spotifyPreviewUrl,
                  }));
                  sourcePossiblyTruncatedAt100 = full.tracks.length >= MAX_TRACKS_PREMIUM;
                  if (sourcePossiblyTruncatedAt100) {
                    sourceWarnings.push(`${sourceName}: a Spotify playlist nagyon hosszú, ezért az első ${MAX_TRACKS_PREMIUM} számot importáltuk.`);
                  }
                  console.log(`[premium-widen] widened source=${sourcePlaylistId} to ${sourceTracks.length} tracks`);
                } else {
                  const reason = full.reason
                    ? ` (${full.reason})`
                    : ` (Spotify total: ${full.spotifyTotal ?? 'ismeretlen'}, oldalak: ${full.pagesFetched ?? 0}, beolvasott: ${full.tracks?.length ?? 0}, stop: ${full.stopReason ?? 'ismeretlen'})`;
                  const scopeHint = token.scope ? ` Token scope: ${token.scope}.` : '';
                  sourceWarnings.push(`${sourceName}: a Spotify Web API nem adott 100-nál több számot, ezért csak az első 100-at importáltuk.${reason}${scopeHint}`);
                }
              } else {
                sourceWarnings.push(`${sourceName}: nincs érvényes Spotify-kapcsolat, ezért csak az első 100 számot importáltuk.`);
              }
            } else {
              sourceWarnings.push(`${sourceName}: nincs paklitulajdonos azonosító, ezért csak az első 100 számot importáltuk.`);
            }
          }

          sourceNames.push(sourceName);
          sourceReports.push({
            playlistId: sourcePlaylistId,
            name: sourceName,
            trackCount: sourceTracks.length,
            possiblyTruncatedAt100: sourcePossiblyTruncatedAt100,
          });
          mergedTracks.push(...sourceTracks);
        }

        tracks = dedupeRawTracks(mergedTracks);
        playlistName = existingReport.deckName ?? sourceNames.join(' + ');
        possiblyTruncatedAt100 = sourceReports.some((source) => source.possiblyTruncatedAt100);
        playlistImportWarning =
          sourceWarnings.length > 0
            ? sourceWarnings.length === 1
              ? sourceWarnings[0]
              : `${sourceWarnings.length} playlist importkorlátba futott. Részletek: ${sourceWarnings.join(' ')}`
            : undefined;

        await supabase
          .from('decks')
          .update({
            name: playlistName,
            total_tracks: tracks.length,
            report: {
              ...existingReport,
              audioPipeline,
              qualityStatus: qualityStatusForPipeline(audioPipeline),
              processed: 0,
              total: tracks.length,
              step: 'resolving_years',
              tracksCache: tracks,
              playlistName,
              possiblyTruncatedAt100,
              playlistImportWarning,
              sourcePlaylistIds,
              sourceReports,
              mergedTrackCountBeforeDedupe: mergedTracks.length,
              processedTracks: [],
            },
          })
          .eq('id', deckId);
      } else {
      const step1 = await fetchPlaylistViaEmbed(playlistId);
      if (!step1.ok || !step1.tracks) {
        const isPrivate = (step1.reason || '').includes('private');
        await supabase
          .from('decks')
          .update({
            status: 'failed',
            report: { step: 'failed', reason: step1.reason, errorCode: isPrivate ? 'playlist_not_public' : 'playlist_fetch_failed' },
          })
          .eq('id', deckId);
        return;
      }
      tracks = step1.tracks;
      playlistName = step1.playlistName ?? playlistId;
      possiblyTruncatedAt100 = step1.possiblyTruncatedAt100 ?? false;

      // S20-bővítés (F3): ha az embed 100-nál levágottnak tűnik ÉS a pakli
      // tulajdonosának van érvényes Premium-kapcsolata, próbáljuk a
      // hitelesített, lapozható Web API-t a TELJES tracklistért. Bármilyen
      // hiba (nincs kapcsolat, lejárt token, API-hiba) esetén NÉMÁN
      // megmaradunk a 100-as embed-listánál — ez sosem buktathatja a
      // generálást, csak egy opcionális bővítés.
      if (possiblyTruncatedAt100) {
        const { data: deckOwnerRow } = await supabase.from('decks').select('owner_id').eq('id', deckId).single();
        const ownerId = deckOwnerRow?.owner_id as string | undefined;
        console.log(`[premium-widen] deck=${deckId} ownerId=${ownerId ?? 'MISSING'}`);
        if (ownerId) {
          const token = await getValidSpotifyAccessToken(supabase, ownerId);
          console.log(`[premium-widen] token=${token ? 'valid' : 'MISSING/invalid'}`);
          if (token) {
            const full = await fetchPlaylistTracksAuthenticated(playlistId, token.accessToken, MAX_TRACKS_PREMIUM);
            console.log(
              `[premium-widen] fetch ok=${full.ok} reason=${full.reason ?? 'n/a'} fetchedTracks=${full.tracks?.length ?? 0} embedTracks=${tracks.length} spotifyTotal=${full.spotifyTotal ?? 'unknown'} pages=${full.pagesFetched ?? 0} stop=${full.stopReason ?? 'n/a'}`
            );
            if (full.ok && full.tracks && full.tracks.length > tracks.length) {
              const previewByUri = new Map(
                tracks.filter((t) => t.uri).map((t) => [t.uri as string, t.spotifyPreviewUrl])
              );
              tracks = full.tracks.map((t) => ({
                ...t,
                spotifyPreviewUrl: t.uri ? (previewByUri.get(t.uri) ?? t.spotifyPreviewUrl) : t.spotifyPreviewUrl,
              }));
              possiblyTruncatedAt100 = full.tracks.length >= MAX_TRACKS_PREMIUM;
              if (possiblyTruncatedAt100) {
                playlistImportWarning = `A Spotify playlist nagyon hosszú, ezért az első ${MAX_TRACKS_PREMIUM} számot importáltuk.`;
              }
              console.log(`[premium-widen] widened to ${tracks.length} tracks`);
            } else {
              const reason = full.reason
                ? ` (${full.reason})`
                : ` (Spotify total: ${full.spotifyTotal ?? 'ismeretlen'}, oldalak: ${full.pagesFetched ?? 0}, beolvasott: ${full.tracks?.length ?? 0}, stop: ${full.stopReason ?? 'ismeretlen'})`;
              const scopeHint = token.scope ? ` Token scope: ${token.scope}.` : '';
              playlistImportWarning = `A Spotify Web API nem adott 100-nál több számot, ezért csak az első 100-at importáltuk.${reason}${scopeHint}`;
            }
          } else {
            playlistImportWarning = 'Nincs érvényes Spotify-kapcsolat, ezért csak az első 100 számot importáltuk.';
          }
        } else {
          playlistImportWarning = 'Nincs paklitulajdonos azonosító, ezért csak az első 100 számot importáltuk.';
        }
      }

      await supabase
        .from('decks')
        .update({
          name: playlistName,
          total_tracks: tracks.length,
          report: {
            ...existingReport,
            audioPipeline,
            qualityStatus: qualityStatusForPipeline(audioPipeline),
            processed: 0,
            total: tracks.length,
            step: 'resolving_years',
            tracksCache: tracks,
            playlistName,
            possiblyTruncatedAt100,
            playlistImportWarning,
            processedTracks: [], // accumulates ProcessedTrack-lite results across batches
          },
        })
        .eq('id', deckId);
      }
    }

    const total = tracks.length;

    if (audioPipeline === 'spotify_only') {
      await finalizeSpotifyOnlyDeck(supabase, deckId, tracks, playlistName, possiblyTruncatedAt100, playlistImportWarning);
      return;
    }

    // Reload the accumulated per-track results from previous batches (if any).
    const { data: freshDeckRow } = await supabase.from('decks').select('report').eq('id', deckId).single();
    const report = (freshDeckRow?.report ?? {}) as any;
    const accumulated: ProcessedTrack[] = report.processedTracks ?? [];

    // Load the global MB year cache for the remaining tracks.
    const remainingTracks = tracks.slice(resumeCursor);
    const cacheKeys = remainingTracks.map((t) => normalize(t.title) + '|' + normalize(t.artist));
    const itunesCacheKeys = remainingTracks.map((t) => itunesCacheKey(t.title, t.artist));
    const itunesCacheCutoff = new Date(Date.now() - ITUNES_CACHE_TTL_MS).toISOString();
    const [{ data: cacheRows }, { data: itunesCacheRows }] = cacheKeys.length
      ? await Promise.all([
          supabase.from('mb_year_cache').select('norm_key, year, year_source, match_score').in('norm_key', cacheKeys),
          supabase
            .from('itunes_match_cache')
            .select('norm_key, preview_url, match_score, release_year, artwork_url, matched_title, matched_artist')
            .in('norm_key', itunesCacheKeys)
            .gte('cached_at', itunesCacheCutoff),
        ])
      : [{ data: [] as any[] }, { data: [] as any[] }];

    const mbCacheMap = new Map<string, YearResolution>();
    for (const row of cacheRows ?? []) {
      mbCacheMap.set(row.norm_key, {
        year: row.year,
        yearSource: (row.year_source as 'musicbrainz' | 'none') ?? 'none',
        mbMatchScore: row.match_score ?? undefined,
      });
    }

    const itunesCacheMap = new Map<string, ItunesMatch>();
    for (const row of itunesCacheRows ?? []) {
      itunesCacheMap.set(row.norm_key, {
        previewUrl: row.preview_url,
        matchScore: row.match_score,
        releaseYear: row.release_year,
        artworkUrl: row.artwork_url,
        matchedTitle: row.matched_title,
        matchedArtist: row.matched_artist,
        status: row.preview_url ? 'matched' : 'no_match',
      });
    }

    let cursor = resumeCursor;
    const newCacheEntries: Array<{ norm_key: string; year: number | null; year_source: string; match_score: number | null }> = [];
    const newItunesCacheEntries: NonNullable<ProcessedTrack['newItunesCacheEntry']>[] = [];

    // A small concurrent window keeps provider requests and response waits
    // overlapped. The reservation-based throttles above still enforce each
    // provider's minimum start interval, so this does not create request bursts.
    while (cursor < total) {
      if (Date.now() - startedAt > BATCH_TIME_BUDGET_MS - SELF_INVOKE_HEADROOM_MS) break;

      const chunk = tracks.slice(cursor, Math.min(cursor + RESOLVE_CONCURRENCY, total));
      const processedChunk = await Promise.all(chunk.map((track) => processTrack(track, mbCacheMap, itunesCacheMap)));
      for (const processed of processedChunk) {
        accumulated.push(processed);
        if (processed.newCacheEntry) newCacheEntries.push(processed.newCacheEntry);
        if (processed.newItunesCacheEntry) newItunesCacheEntries.push(processed.newItunesCacheEntry);
      }
      cursor += processedChunk.length;

      await supabase
        .from('decks')
        .update({
          report: {
            ...report,
            processed: cursor,
            total,
            step: 'resolving_years',
            tracksCache: tracks,
            playlistName,
            possiblyTruncatedAt100,
            playlistImportWarning,
            processedTracks: accumulated,
          },
        })
        .eq('id', deckId);
      if (newCacheEntries.length > 0) {
        await supabase.from('mb_year_cache').upsert(newCacheEntries, { onConflict: 'norm_key' });
        newCacheEntries.length = 0;
      }
      if (newItunesCacheEntries.length > 0) {
        await supabase.from('itunes_match_cache').upsert(newItunesCacheEntries, { onConflict: 'norm_key' });
        newItunesCacheEntries.length = 0;
      }
    }
    if (newCacheEntries.length > 0) {
      await supabase.from('mb_year_cache').upsert(newCacheEntries, { onConflict: 'norm_key' });
    }
    if (newItunesCacheEntries.length > 0) {
      await supabase.from('itunes_match_cache').upsert(newItunesCacheEntries, { onConflict: 'norm_key' });
    }

    if (cursor < total) {
      // Time budget exhausted with tracks still left — persist state and
      // self-chain: fire off the next batch as a new HTTP invocation so it
      // gets its own fresh 150s wall-clock window, rather than trying to
      // keep going inside this one.
      await supabase
        .from('decks')
        .update({
          report: {
            ...report,
            processed: cursor,
            total,
            step: 'resolving_years',
            tracksCache: tracks,
            playlistName,
            possiblyTruncatedAt100,
            playlistImportWarning,
            processedTracks: accumulated,
          },
        })
        .eq('id', deckId);

      await invokeNextBatch(deckId, playlistId, cursor);
      return;
    }

    if (audioPipeline === 'accurate_spotify') {
      await supabase
        .from('decks')
        .update({
          report: {
            ...report,
            processed: total,
            total,
            step: 'building_spotify_only_cards',
            tracksCache: tracks,
            playlistName,
            possiblyTruncatedAt100,
            playlistImportWarning,
            processedTracks: accumulated,
          },
        })
        .eq('id', deckId);
      await finalizeAccurateSpotifyDeck(supabase, deckId, accumulated, total);
      return;
    }

    // All tracks resolved (year + preview candidate) — move to audio upload.
    await supabase
      .from('decks')
      .update({
        report: {
          ...report,
          processed: total,
          total,
          step: 'uploading_audio',
          uploadCursor: 0,
          tracksCache: tracks,
          playlistName,
          possiblyTruncatedAt100,
          playlistImportWarning,
          processedTracks: accumulated,
        },
      })
      .eq('id', deckId);

    await runAudioUploadPhase(supabase, deckId, accumulated, total, startedAt);
  } catch (err) {
    await supabase
      .from('decks')
      .update({ status: 'failed', report: { step: 'failed', reason: String(err) } })
      .eq('id', deckId);
  }
}

// Borítókép-fallback: a Spotify NYILVÁNOS oembed végpontja (nem igényel OAuth-ot,
// se Premium-kapcsolatot) egy track URI-ra visszaad egy `thumbnail_url`-t — ez
// csak akkor kell, ha az iTunes-keresés (ami amúgy is lefut minden trackre,
// ld. searchItunes) nem talált artworkot (alacsony match score vagy nincs találat).
async function fetchSpotifyOembedArtwork(spotifyUri: string | null): Promise<string | null> {
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

async function uploadTrackCard(
  supabase: ReturnType<typeof adminClient>,
  deckId: string,
  track: ProcessedTrack
): Promise<{ card: any | null; excluded: any | null; previewFallbackUsed: boolean }> {
  const cardId = crypto.randomUUID();
  let artworkUrl = track.itunesArtworkUrl;
  const fallbackArtwork = artworkUrl ? Promise.resolve(artworkUrl) : fetchSpotifyOembedArtwork(track.raw.uri);
  const resolveArtwork = async () => artworkUrl ?? (artworkUrl = await fallbackArtwork);
  const candidates = [track.raw.spotifyPreviewUrl, track.itunesPreviewUrl].filter(
    (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index
  );
  let lastFailure = 'no preview candidate';

  const buildCard = async (audioUrl: string | null, audioSource: 'spotify_embed' | 'itunes' | 'spotify') => ({
    id: cardId,
    deck_id: deckId,
    title: track.raw.title,
    artist: track.raw.artist,
    year: track.finalYear,
    year_source: track.finalYearSource,
    year_uncertain: track.yearUncertain,
    audio_url: audioUrl,
    audio_source: audioSource,
    artwork_url: await resolveArtwork(),
    spotify_uri: track.raw.uri,
    duration_ms: track.raw.durationMs,
  });

  const tryUpload = async (sourceUrl: string): Promise<{ path: string; audioSource: 'spotify_embed' | 'itunes' } | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const audioRes = await fetch(sourceUrl);
        if (!audioRes.ok) throw new Error(`audio fetch failed: ${audioRes.status}`);
        const audioBuf = await audioRes.arrayBuffer();
        const audioStorage = inferAudioStorage(audioRes.headers.get('content-type'), sourceUrl);
        const path = `${deckId}/${cardId}.${audioStorage.extension}`;
        const { error: uploadError } = await supabase.storage
          .from('deck-audio')
          .upload(path, audioBuf, { contentType: audioStorage.contentType, upsert: true });
        if (uploadError) throw uploadError;
        return { path, audioSource: sourceUrl === track.raw.spotifyPreviewUrl ? 'spotify_embed' : 'itunes' };
      } catch (err) {
        lastFailure = String(err);
        if (attempt === 0) await sleep(350);
      }
    }
    return null;
  };

  for (const candidate of candidates) {
    const uploaded = await tryUpload(candidate);
    if (uploaded) {
      return {
        card: await buildCard(uploaded.path, uploaded.audioSource),
        excluded: null,
        previewFallbackUsed: false,
      };
    }
  }

  // Cached Apple preview URLs can occasionally expire. Refresh only after a
  // failed candidate, then retry once; successful generation stays on the
  // fast cached path.
  if (candidates.length > 0) {
    const refreshed = await searchItunes(track.raw.title, track.raw.artist);
    if (refreshed.artworkUrl) artworkUrl = refreshed.artworkUrl;
    if (refreshed.previewUrl && !candidates.includes(refreshed.previewUrl)) {
      const uploaded = await tryUpload(refreshed.previewUrl);
      if (uploaded) {
        return {
          card: await buildCard(uploaded.path, uploaded.audioSource),
          excluded: null,
          previewFallbackUsed: false,
        };
      }
    }
  }

  if (track.raw.uri) {
    return {
      card: await buildCard(null, 'spotify'),
      excluded: null,
      previewFallbackUsed: candidates.length > 0,
    };
  }

  return {
    card: null,
    excluded: { title: track.raw.title, artist: track.raw.artist, reason: 'no_preview', detail: lastFailure },
    previewFallbackUsed: false,
  };
}

async function buildAccurateSpotifyCard(
  deckId: string,
  track: ProcessedTrack
): Promise<{ card: any | null; excluded: any | null }> {
  if (track.excludeReason === 'no_year') {
    return {
      card: null,
      excluded: {
        title: track.raw.title,
        artist: track.raw.artist,
        reason: 'no_year',
        index: track.raw.index,
        hasSource: Boolean(track.raw.uri),
        ...(track.raw.uri
          ? {
              spotifyUri: track.raw.uri,
              durationMs: track.raw.durationMs,
              itunesArtworkUrl: track.itunesArtworkUrl,
              audioSource: 'spotify',
            }
          : {}),
      },
    };
  }

  if (!track.raw.uri) {
    return {
      card: null,
      excluded: {
        title: track.raw.title,
        artist: track.raw.artist,
        reason: 'no_preview',
        index: track.raw.index,
        detail: 'missing_spotify_uri_for_premium_playback',
      },
    };
  }

  const artworkUrl = track.itunesArtworkUrl ?? (await fetchSpotifyOembedArtwork(track.raw.uri));
  return {
    card: {
      id: crypto.randomUUID(),
      deck_id: deckId,
      title: track.raw.title,
      artist: track.raw.artist,
      year: track.finalYear,
      year_source: track.finalYearSource,
      year_uncertain: track.yearUncertain,
      audio_url: null,
      audio_source: 'spotify',
      artwork_url: artworkUrl,
      spotify_uri: track.raw.uri,
      duration_ms: track.raw.durationMs,
    },
    excluded: null,
  };
}

async function finalizeAccurateSpotifyDeck(
  supabase: ReturnType<typeof adminClient>,
  deckId: string,
  processed: ProcessedTrack[],
  total: number
): Promise<void> {
  const deckCardRows: any[] = [];
  const excluded: any[] = [];

  for (const track of processed) {
    const result = await buildAccurateSpotifyCard(deckId, track);
    if (result.card) deckCardRows.push(result.card);
    if (result.excluded) excluded.push(result.excluded);
  }

  if (deckCardRows.length > 0) {
    const { error: cardsInsertError } = await supabase.from('deck_cards').insert(deckCardRows);
    if (cardsInsertError) {
      await supabase
        .from('decks')
        .update({ status: 'failed', report: { step: 'failed', reason: 'deck_cards_insert_failed: ' + cardsInsertError.message } })
        .eq('id', deckId);
      return;
    }
  }

  const usableCount = deckCardRows.length;
  const coveragePct = total > 0 ? Math.round((usableCount / total) * 1000) / 10 : 0;
  const uncertainYearCount = deckCardRows.filter((c) => c.year_uncertain).length;
  const spotifyOnlyCount = deckCardRows.length;
  const { data: deckRow } = await supabase.from('decks').select('report').eq('id', deckId).single();
  const report = (deckRow?.report ?? {}) as any;

  await supabase
    .from('decks')
    .update({
      status: 'ready',
      usable_count: usableCount,
      coverage_pct: coveragePct,
      report: {
        ...finalGenerationDiagnostics(report),
        processed: total,
        total,
        step: 'done',
        excluded,
        uncertainYearCount,
        spotifyOnlyCount,
        downloadedPreviewCount: 0,
        previewFallbackCount: 0,
        meetsMinimum: usableCount >= MIN_USABLE_CARDS,
      },
    })
    .eq('id', deckId);

  await hideReplacedSpotifyOnlySource(supabase, report.promotedFromDeckId);
}

async function hideReplacedSpotifyOnlySource(supabase: ReturnType<typeof adminClient>, sourceDeckId: unknown): Promise<void> {
  if (typeof sourceDeckId !== 'string') return;
  const { data: sourceDeck } = await supabase.from('decks').select('id, report, status').eq('id', sourceDeckId).maybeSingle();
  const report = (sourceDeck?.report ?? {}) as Record<string, unknown>;
  if (!sourceDeck || sourceDeck.status === 'deleted' || report.audioPipeline !== 'spotify_only') return;

  const { count: roomCount, error: roomError } = await supabase
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', sourceDeck.id);
  if (roomError) {
    console.warn('spotify_only_source_room_check_failed', roomError.message);
    await supabase.from('decks').update({ status: 'deleted', is_public: false }).eq('id', sourceDeck.id);
    return;
  }

  if ((roomCount ?? 0) > 0) {
    await supabase.from('decks').update({ status: 'deleted', is_public: false }).eq('id', sourceDeck.id);
    return;
  }

  const { error: cardsDeleteError } = await supabase.from('deck_cards').delete().eq('deck_id', sourceDeck.id);
  if (cardsDeleteError) {
    console.warn('spotify_only_source_cards_delete_failed', cardsDeleteError.message);
    await supabase.from('decks').update({ status: 'deleted', is_public: false }).eq('id', sourceDeck.id);
    return;
  }

  const { error: deckDeleteError } = await supabase.from('decks').delete().eq('id', sourceDeck.id);
  if (deckDeleteError) {
    console.warn('spotify_only_source_deck_delete_failed', deckDeleteError.message);
    await supabase.from('decks').update({ status: 'deleted', is_public: false }).eq('id', sourceDeck.id);
  }
}

// Audio upload phase — also time-boxed and self-chaining for large decks,
// since fetching+uploading ~360KB per track for 100 tracks is itself
// non-trivial wall-clock time.
async function runAudioUploadPhase(
  supabase: ReturnType<typeof adminClient>,
  deckId: string,
  processed: ProcessedTrack[],
  total: number,
  startedAt: number
): Promise<void> {
  const usableTracks = processed.filter((t) => !t.excludeReason);
  // Playtest feedback (2026-07-06): a 'no_year' miatt kimaradt trackekhez most eltároljuk
  // az esetleges audio-forrást (Spotify preview / iTunes) és a borítóképet is, hogy a host
  // utólag, a riport képernyőn beírhassa a helyes évet, és a track kártyaként bekerülhessen
  // a pakliba (ld. add_manual_year_card) — anélkül ez az adat elveszne, mert a normál
  // audio-upload fázis csak a MÁR feloldott évű trackeken fut végig.
  const baseExcluded = processed
    .filter((t) => t.excludeReason)
    .map((t) => {
      const sourceUrl = t.raw.spotifyPreviewUrl ?? t.itunesPreviewUrl;
      const hasPlayableSource = Boolean(sourceUrl || t.raw.uri);
      return {
        title: t.raw.title,
        artist: t.raw.artist,
        reason: t.excludeReason,
        index: t.raw.index,
        hasSource: t.excludeReason === 'no_year' && hasPlayableSource,
        ...(t.excludeReason === 'no_year' && hasPlayableSource
          ? {
              spotifyPreviewUrl: t.raw.spotifyPreviewUrl,
              itunesPreviewUrl: t.itunesPreviewUrl,
              spotifyUri: t.raw.uri,
              durationMs: t.raw.durationMs,
              itunesArtworkUrl: t.itunesArtworkUrl,
              audioSource: t.raw.spotifyPreviewUrl ? 'spotify_embed' : sourceUrl ? 'itunes' : 'spotify',
            }
          : {}),
      };
    });

  const { data: deckRow } = await supabase.from('decks').select('report').eq('id', deckId).single();
  const report = (deckRow?.report ?? {}) as any;
  const uploadCursor: number = report.uploadCursor ?? 0;

  const deckCardRows: any[] = report.deckCardRows ?? [];
  const uploadExcluded: any[] = report.uploadExcluded ?? [];
  let previewFallbackCount: number = report.previewFallbackCount ?? 0;

  let cursor = uploadCursor;
  while (cursor < usableTracks.length) {
    if (Date.now() - startedAt > BATCH_TIME_BUDGET_MS - SELF_INVOKE_HEADROOM_MS) {
      await supabase
        .from('decks')
        .update({
          report: {
            ...report,
            step: 'uploading_audio',
            uploadCursor: cursor,
            deckCardRows,
            uploadExcluded,
            previewFallbackCount,
            total,
            processed: total,
          },
        })
        .eq('id', deckId);
      await invokeNextBatch(deckId, '', -1, { phase: 'upload', deckId, resumeUploadCursor: cursor });
      return;
    }

    const chunk = usableTracks.slice(cursor, Math.min(cursor + AUDIO_UPLOAD_CONCURRENCY, usableTracks.length));
    const results = await Promise.all(chunk.map((track) => uploadTrackCard(supabase, deckId, track)));
    for (const result of results) {
      if (result.card) deckCardRows.push(result.card);
      if (result.excluded) uploadExcluded.push(result.excluded);
      if (result.previewFallbackUsed) previewFallbackCount++;
    }
    cursor += chunk.length;

    await supabase
      .from('decks')
      .update({
        report: {
          ...report,
          step: 'uploading_audio',
          uploadCursor: cursor,
          deckCardRows,
          uploadExcluded,
          previewFallbackCount,
          total,
          processed: total,
        },
      })
      .eq('id', deckId);
  }

  // All uploads attempted — finalize the deck.
  if (deckCardRows.length > 0) {
    const { error: cardsInsertError } = await supabase.from('deck_cards').insert(deckCardRows);
    if (cardsInsertError) {
      await supabase
        .from('decks')
        .update({ status: 'failed', report: { step: 'failed', reason: 'deck_cards_insert_failed: ' + cardsInsertError.message } })
        .eq('id', deckId);
      return;
    }
  }

  const usableCount = deckCardRows.length;
  const excluded = [...baseExcluded, ...uploadExcluded];
  const coveragePct = total > 0 ? Math.round((usableCount / total) * 1000) / 10 : 0;
  const uncertainYearCount = deckCardRows.filter((c) => c.year_uncertain).length;
  const spotifyOnlyCount = deckCardRows.filter((c) => c.audio_source === 'spotify').length;
  const downloadedPreviewCount = deckCardRows.filter((c) => typeof c.audio_url === 'string' && c.audio_url.length > 0).length;

  await supabase
    .from('decks')
    .update({
      status: 'ready',
      usable_count: usableCount,
      coverage_pct: coveragePct,
      report: {
        ...finalGenerationDiagnostics(report),
        processed: total,
        total,
        step: 'done',
        excluded,
        uncertainYearCount,
        spotifyOnlyCount,
        downloadedPreviewCount,
        previewFallbackCount,
        meetsMinimum: usableCount >= MIN_USABLE_CARDS,
      },
    })
    .eq('id', deckId);

  await hideReplacedSpotifyOnlySource(supabase, report.promotedFromDeckId);
}

// Self-chains the background work by making a new HTTP call to this same
// function with an internal "continue" action, authenticated with the
// service-role key (never exposed to any client). This gives the next batch
// its own fresh wall-clock window instead of trying to extend the current one.
async function invokeNextBatch(
  deckId: string,
  playlistId: string,
  resumeCursor: number,
  overridePayload?: { phase: 'upload'; deckId: string; resumeUploadCursor: number }
): Promise<void> {
  const payload = overridePayload ?? { phase: 'resolve', deckId, playlistId, resumeCursor };
  // IMPORTANT: this must be awaited, not fire-and-forget. runGenerationWork
  // returns right after calling this, and that return value is what's
  // passed to EdgeRuntime.waitUntil() — once that promise resolves, the
  // worker is free to be torn down. An un-awaited fetch() here can get
  // cancelled mid-flight before the self-chain HTTP request actually left
  // the process, silently breaking the chain (observed in testing: batch 1
  // finished at track ~61/100 and never continued). Awaiting the fetch
  // (with a timeout, since we don't need the full response) ensures the
  // request is actually sent before this invocation's background task ends.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      await fetch(FUNCTION_SELF_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          'x-internal-continue': '1',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    // If the self-invoke fails to even fire, the deck will remain stuck in
    // 'generating' with the last persisted report — acceptable degraded
    // failure mode (no worse than the pre-fix behavior), and recoverable
    // by resubmitting since progress is checkpointed in decks.report.
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }

  // Internal continuation call (self-chained batch) — authenticated via the
  // service-role key in the Authorization header, never reachable by a
  // regular client because that key is never shipped to any client.
  const isInternalContinue = req.headers.get('x-internal-continue') === '1';
  if (isInternalContinue) {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
      return errorResponse('unauthorized', undefined, 401);
    }

    // Respond immediately, keep working via waitUntil — same pattern as the
    // initial call, so each link in the chain is itself a fast HTTP call.
    if (body.phase === 'upload') {
      const supabase = adminClient();
      const { data: deckRow } = await supabase.from('decks').select('report').eq('id', body.deckId).single();
      const report = (deckRow?.report ?? {}) as any;
      const processed: ProcessedTrack[] = report.processedTracks ?? [];
      const total = report.total ?? processed.length;
      // deckCardRows/uploadCursor are read fresh inside runAudioUploadPhase from decks.report.
      // @ts-ignore Deno global
      EdgeRuntime.waitUntil(runAudioUploadPhase(adminClient(), body.deckId, processed, total, Date.now()));
      return jsonResponse({ ok: true, continuing: true });
    }

    // phase === 'resolve'
    // @ts-ignore Deno global
    EdgeRuntime.waitUntil(runGenerationWork(body.deckId, body.playlistId, body.resumeCursor));
    return jsonResponse({ ok: true, continuing: true });
  }

  // ---- Normal client-facing entry point ----
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse('unauthorized', 'Be kell jelentkezni a pakli generálásához.', 401);
  }
  // Validate the caller's JWT (reuse the same check as before, inlined here
  // since we need callerUid only for this branch).
  const { createClient } = await import('jsr:@supabase/supabase-js@2');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const jwt = authHeader.replace('Bearer ', '');
  const identityClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await identityClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return errorResponse('unauthorized', 'Be kell jelentkezni a pakli generálásához.', 401);
  }
  const callerUid = userData.user.id;

  const playlistUrls = Array.isArray(body.playlistUrls) && body.playlistUrls.length > 0 ? body.playlistUrls : [body.playlistUrl];
  if (!playlistUrls[0]) {
    return errorResponse('invalid_url', 'Adj meg egy Spotify playlist URL-t.', 400);
  }

  let playlistIds: string[];
  try {
    playlistIds = playlistUrls.map((url: string) => parsePlaylistId(url));
  } catch {
    return errorResponse('invalid_url', 'Nem sikerült felismerni a Spotify playlist URL-t.', 400);
  }
  const sourceKey =
    typeof body.sourceKey === 'string' && /^[a-zA-Z0-9_-]{3,80}$/.test(body.sourceKey)
      ? body.sourceKey
      : playlistIds[0];
  const requestedDeckName =
    typeof body.deckName === 'string' && body.deckName.trim().length > 0
      ? body.deckName.trim().slice(0, 120)
      : null;
  const deckName = requestedDeckName ?? sourceKey;
  const audioPipeline = normalizeRequestedAudioPipeline(body.audioPipeline);
  const curationSourceDeckId =
    typeof body.curationSourceDeckId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.curationSourceDeckId)
      ? body.curationSourceDeckId
      : null;

  const supabase = adminClient();

  if (audioPipeline === 'verified_audio' && !(await callerIsAdmin(supabase, callerUid))) {
    return errorResponse('admin_required', 'Csak kuratori joggal lehet ajanlottra elokeszitett paklit generalni.', 403);
  }

  const { data: spotifyConnection } = await supabase
    .from('spotify_connections')
    .select('spotify_user_id')
    .eq('host_uid', callerUid)
    .maybeSingle();

  // Create the deck row immediately with status='generating'. The HTTP
  // response returns right after this — the actual pipeline work happens in
  // the background (EdgeRuntime.waitUntil), NOT before responding.
  const { data: deckRow, error: insertError } = await supabase
    .from('decks')
    .insert({
      name: deckName,
      source_playlist_id: sourceKey,
      source_playlist_url: playlistUrls.join('\n'),
      owner_id: callerUid,
      spotify_owner_id: spotifyConnection?.spotify_user_id ?? null,
      status: 'generating',
      is_public: false,
      report: {
        processed: 0,
        total: 0,
        step: 'fetching_playlist',
        sourcePlaylistIds: playlistIds,
        ...(requestedDeckName ? { deckName: requestedDeckName } : {}),
        audioPipeline,
        qualityStatus: qualityStatusForPipeline(audioPipeline),
        ...(curationSourceDeckId ? { promotedFromDeckId: curationSourceDeckId } : {}),
      },
    })
    .select()
    .single();

  if (insertError || !deckRow) {
    return errorResponse('db_error', 'Nem sikerült a pakli létrehozása.', 500);
  }

  const deckId = deckRow.id as string;

  // Kick off the background work AFTER we've prepared the response, and do
  // not await it — this is what makes the HTTP response return immediately.
  // @ts-ignore Deno global — EdgeRuntime is provided by the Supabase Edge Runtime
  EdgeRuntime.waitUntil(runGenerationWork(deckId, sourceKey, 0));

  // Respond immediately with the deckId; the client polls decks.report.
  return jsonResponse({
    deckId,
    status: 'generating',
    message: 'A pakli generálása elindult. Kövesd a decks.report mezőt a folyamat állapotáért.',
  });
});
