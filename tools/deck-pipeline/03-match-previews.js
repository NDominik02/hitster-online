// Step 3: For each track, find a 30s iTunes preview URL via the iTunes Search API.
// Throttle ~3s/request to stay well under any informal rate limit (iTunes Search
// API has no official published limit but is known to soft-block bursty callers).
// Fuzzy match on normalized title+artist; picks the best-scoring candidate among
// up to 5 results and requires a minimum combined similarity to accept the match.
'use strict';

const { parsePlaylistId } = require('./lib/parse-playlist-id');
const { ensureDirs, cachePath, outputPath, readJsonIfExists, writeJson, sleep, normalize, primaryArtist, similarity } = require('./lib/util');

const ITUNES_INTERVAL_MS = 3000;
const MIN_MATCH_SCORE = 0.55;

let lastRequestAt = 0;
async function throttledFetch(url) {
  const now = Date.now();
  const wait = lastRequestAt + ITUNES_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  return fetch(url);
}

async function searchItunes(title, artist) {
  const term = `${primaryArtist(artist)} ${title}`;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=5`;
  const res = await throttledFetch(url);
  if (!res.ok) return { ok: false, reason: `iTunes HTTP ${res.status}` };
  const data = await res.json();
  return { ok: true, results: data.results || [] };
}

function pickBestMatch(results, title, artist) {
  let best = null;
  let bestScore = 0;
  for (const r of results) {
    const titleScore = similarity(r.trackName, title);
    const artistScore = similarity(r.artistName, artist);
    const score = titleScore * 0.6 + artistScore * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return { best, score: bestScore };
}

async function matchPreviewForTrack(track, itunesCache) {
  const cacheKey = normalize(track.title) + '|' + normalize(track.artist);
  if (itunesCache[cacheKey]) {
    return { ...track, ...itunesCache[cacheKey] };
  }

  const searchResult = await searchItunes(track.title, track.artist);
  let resolution;
  if (!searchResult.ok) {
    resolution = { previewStatus: 'error', previewError: searchResult.reason, previewUrl: null };
  } else if (searchResult.results.length === 0) {
    resolution = { previewStatus: 'no-results', previewUrl: null };
  } else {
    const { best, score } = pickBestMatch(searchResult.results, track.title, track.artist);
    if (best && score >= MIN_MATCH_SCORE && best.previewUrl) {
      resolution = {
        previewStatus: 'matched',
        previewUrl: best.previewUrl,
        previewMatchScore: Math.round(score * 100) / 100,
        previewMatchedTitle: best.trackName,
        previewMatchedArtist: best.artistName,
        previewMatchedAlbum: best.collectionName,
        previewMatchedReleaseDate: best.releaseDate,
      };
    } else {
      resolution = {
        previewStatus: 'no-good-match',
        previewUrl: null,
        previewMatchScore: Math.round(score * 100) / 100,
      };
    }
  }

  itunesCache[cacheKey] = resolution;
  return { ...track, ...resolution };
}

async function matchPreviewsForPlaylist(playlistId) {
  const yearsFile = cachePath(`02-years-${playlistId}.json`);
  const withYears = readJsonIfExists(yearsFile);
  if (!withYears) {
    console.log(`[skip] ${playlistId}: no year-resolved cache found (run 02-resolve-years.js first)`);
    return null;
  }

  const itunesCacheFile = cachePath('itunes-lookup-cache.json');
  const itunesCache = readJsonIfExists(itunesCacheFile) || {};

  const finalFile = outputPath(`${playlistId}.json`);
  const existing = readJsonIfExists(finalFile);
  if (existing) {
    console.log(`[cache] ${playlistId}: previews already matched for ${existing.tracks.length} tracks`);
    return existing;
  }

  console.log(`[match] ${playlistId}: ${withYears.tracks.length} tracks, ~${Math.ceil(withYears.tracks.length * 3)}s at 1 req/3s...`);
  const finalTracks = [];
  for (const track of withYears.tracks) {
    const resolved = await matchPreviewForTrack(track, itunesCache);
    finalTracks.push(resolved);
    writeJson(itunesCacheFile, itunesCache);
    const tag = resolved.previewUrl ? `PREVIEW OK (score ${resolved.previewMatchScore})` : `NO PREVIEW (${resolved.previewStatus})`;
    console.log(`  [${track.index + 1}/${withYears.tracks.length}] ${track.artist} - ${track.title} -> ${tag}`);
  }

  const playable = finalTracks.filter((t) => t.year && t.previewUrl);
  const result = {
    playlistId,
    playlistName: withYears.playlistName,
    generatedAt: new Date().toISOString(),
    trackCount: finalTracks.length,
    playableCount: playable.length,
    coveragePct: Math.round((playable.length / finalTracks.length) * 1000) / 10,
    tracks: finalTracks,
  };
  writeJson(finalFile, result);
  console.log(`  -> deck coverage: ${result.playableCount}/${result.trackCount} (${result.coveragePct}%)`);
  return result;
}

async function main() {
  ensureDirs();
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error('Usage: node 03-match-previews.js <playlistUrlOrId> [more...]');
    process.exit(1);
  }
  for (const urlOrId of urls) {
    const playlistId = parsePlaylistId(urlOrId);
    await matchPreviewsForPlaylist(playlistId);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { matchPreviewsForPlaylist };
