// Step 2: For each track, resolve original release year via MusicBrainz.
// Rate limit: MusicBrainz requires <=1 req/s and a descriptive User-Agent.
// Falls back to null (no year) when no MusicBrainz match is found — the plan
// says fall back to Spotify album year, but the embed API does not expose
// album/year data (see 01-fetch-playlist.js notes), so there is no Spotify
// album-year fallback available in this prototype. This is called out in the
// F0 report; a real Spotify Web API token would fix it.
'use strict';

const path = require('path');
const { parsePlaylistId } = require('./lib/parse-playlist-id');
const { ensureDirs, cachePath, readJsonIfExists, writeJson, sleep, normalize, primaryArtist, similarity } = require('./lib/util');

const USER_AGENT = 'HitsterOnline/0.1 (nemethdominik02@gmail.com)';
const MB_MIN_INTERVAL_MS = 1100; // stay under 1 req/s

let lastRequestAt = 0;
async function throttledFetch(url) {
  const now = Date.now();
  const wait = lastRequestAt + MB_MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (res.status === 503) {
    // rate limited, back off and retry once
    await sleep(2000);
    lastRequestAt = Date.now();
    return fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  }
  return res;
}

function buildQuery(title, artist) {
  // MusicBrainz Lucene query syntax
  const t = title.replace(/"/g, '');
  const a = primaryArtist(artist).replace(/"/g, '');
  return `recording:"${t}" AND artist:"${a}"`;
}

async function queryMusicBrainz(title, artist) {
  const query = buildQuery(title, artist);
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
  const res = await throttledFetch(url);
  if (!res.ok) {
    return { ok: false, reason: `MusicBrainz HTTP ${res.status}` };
  }
  const data = await res.json();
  return { ok: true, data };
}

// Pick best candidate recording by fuzzy title+artist match, then find the
// earliest release date among all its releases AND all releases of matching
// release-groups (first-release-date is what we actually want).
function pickEarliestYear(mbData, title, artist) {
  if (!mbData.recordings || mbData.recordings.length === 0) return null;

  // score recordings by title+artist similarity
  let best = null;
  let bestScore = 0;
  for (const rec of mbData.recordings) {
    const recArtist = (rec['artist-credit'] || []).map((ac) => ac.name).join(' ');
    const score = similarity(rec.title, title) * 0.6 + similarity(recArtist, artist) * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = rec;
    }
  }

  if (!best || bestScore < 0.5) return { year: null, matchScore: bestScore, matchedTitle: best ? best.title : null, matchedArtist: best ? (best['artist-credit'] || []).map((ac) => ac.name).join(' ') : null };

  let earliest = null;
  const releases = best.releases || [];
  for (const rel of releases) {
    let dateStr = rel.date;
    if (!dateStr && rel['release-group'] && rel['release-group']['first-release-date']) {
      dateStr = rel['release-group']['first-release-date'];
    }
    if (dateStr) {
      const year = parseInt(dateStr.slice(0, 4), 10);
      if (!isNaN(year) && (earliest === null || year < earliest)) earliest = year;
    }
  }
  // also check first-release-date directly on the recording's release-group refs if present
  if (best['first-release-date']) {
    const y = parseInt(best['first-release-date'].slice(0, 4), 10);
    if (!isNaN(y) && (earliest === null || y < earliest)) earliest = y;
  }

  return {
    year: earliest,
    matchScore: Math.round(bestScore * 100) / 100,
    matchedTitle: best.title,
    matchedArtist: (best['artist-credit'] || []).map((ac) => ac.name).join(' '),
    recordingId: best.id,
  };
}

async function resolveYearForTrack(track, mbCache) {
  const cacheKey = normalize(track.title) + '|' + normalize(track.artist);
  if (mbCache[cacheKey]) {
    return { ...track, ...mbCache[cacheKey] };
  }

  const mbResult = await queryMusicBrainz(track.title, track.artist);
  let resolution;
  if (!mbResult.ok) {
    resolution = { mbStatus: 'error', mbError: mbResult.reason, year: null, yearSource: 'none' };
  } else {
    const picked = pickEarliestYear(mbResult.data, track.title, track.artist);
    if (picked && picked.year) {
      resolution = {
        mbStatus: 'matched',
        year: picked.year,
        yearSource: 'musicbrainz',
        mbMatchScore: picked.matchScore,
        mbMatchedTitle: picked.matchedTitle,
        mbMatchedArtist: picked.matchedArtist,
        mbRecordingId: picked.recordingId,
      };
    } else {
      resolution = {
        mbStatus: 'no-match',
        year: null,
        yearSource: 'none',
        mbMatchScore: picked ? picked.matchScore : 0,
      };
    }
  }

  mbCache[cacheKey] = resolution;
  return { ...track, ...resolution };
}

async function resolveYearsForPlaylist(playlistId) {
  const playlistFile = cachePath(`01-playlist-${playlistId}.json`);
  const playlist = readJsonIfExists(playlistFile);
  if (!playlist || !playlist.ok) {
    console.log(`[skip] ${playlistId}: no valid track list cached (run 01-fetch-playlist.js first)`);
    return null;
  }

  const mbCacheFile = cachePath('musicbrainz-lookup-cache.json');
  const mbCache = readJsonIfExists(mbCacheFile) || {};

  const outFile = cachePath(`02-years-${playlistId}.json`);
  const existing = readJsonIfExists(outFile);
  if (existing) {
    console.log(`[cache] ${playlistId}: years already resolved for ${existing.tracks.length} tracks`);
    return existing;
  }

  console.log(`[resolve] ${playlistId}: ${playlist.tracks.length} tracks, ~${Math.ceil(playlist.tracks.length * 1.1)}s at 1 req/s...`);
  const tracksWithYears = [];
  for (const track of playlist.tracks) {
    const resolved = await resolveYearForTrack(track, mbCache);
    tracksWithYears.push(resolved);
    writeJson(mbCacheFile, mbCache); // persist incrementally so reruns are cheap
    const tag = resolved.yearSource === 'musicbrainz' ? `MB:${resolved.year}` : 'NO YEAR';
    console.log(`  [${track.index + 1}/${playlist.tracks.length}] ${track.artist} - ${track.title} -> ${tag}`);
  }

  const result = {
    playlistId,
    playlistName: playlist.playlistName,
    tracks: tracksWithYears,
  };
  writeJson(outFile, result);
  return result;
}

async function main() {
  ensureDirs();
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error('Usage: node 02-resolve-years.js <playlistUrlOrId> [more...]');
    process.exit(1);
  }
  for (const urlOrId of urls) {
    const playlistId = parsePlaylistId(urlOrId);
    await resolveYearsForPlaylist(playlistId);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { resolveYearsForPlaylist, pickEarliestYear, buildQuery };
