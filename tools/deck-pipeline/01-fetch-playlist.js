// Step 1: Playlist -> track list, via anonymous fetch of the Spotify embed page.
// Extracts __NEXT_DATA__ JSON embedded in https://open.spotify.com/embed/playlist/{id}
// No Spotify API key needed. Known limitation: the embed endpoint appears to cap
// trackList at 100 items (see F0-REPORT.md) and only works for playlists that are
// publicly visible without login — private/unlisted playlists 404 even at
// open.spotify.com/playlist/{id} and need an authenticated browser session instead.
'use strict';

const { parsePlaylistId } = require('./lib/parse-playlist-id');
const { ensureDirs, cachePath, readJsonIfExists, writeJson } = require('./lib/util');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchEmbedHtml(playlistId) {
  const url = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await res.text();
  return { status: res.status, html };
}

function extractNextData(html) {
  const marker = '__NEXT_DATA__" type="application/json">';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  const end = html.indexOf('</script>', start);
  const json = html.slice(start, end);
  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

async function fetchPlaylistViaEmbed(playlistId) {
  const { status, html } = await fetchEmbedHtml(playlistId);
  const nextData = extractNextData(html);

  if (!nextData) {
    return { ok: false, reason: `no __NEXT_DATA__ found (http ${status})` };
  }

  const pageProps = nextData.props && nextData.props.pageProps;
  if (pageProps && pageProps.status === 404) {
    return { ok: false, reason: 'playlist not found via anonymous embed (likely private/unlisted) — needs authenticated browser fetch' };
  }

  const entity = pageProps && pageProps.state && pageProps.state.data && pageProps.state.data.entity;
  if (!entity || !entity.trackList) {
    return { ok: false, reason: 'unexpected NEXT_DATA shape, no trackList found' };
  }

  const tracks = entity.trackList.map((t, i) => ({
    index: i,
    uri: t.uri,
    title: t.title,
    artist: t.subtitle, // embed API gives artist names joined as "subtitle", no album/year here
    durationMs: t.duration,
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

async function main() {
  ensureDirs();
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error('Usage: node 01-fetch-playlist.js <playlistUrlOrId> [more...]');
    process.exit(1);
  }

  const results = [];
  for (const urlOrId of urls) {
    const playlistId = parsePlaylistId(urlOrId);
    const cacheFile = cachePath(`01-playlist-${playlistId}.json`);
    const cached = readJsonIfExists(cacheFile);
    if (cached) {
      console.log(`[cache] ${playlistId}: ${cached.ok ? cached.trackCount + ' tracks' : 'FAILED - ' + cached.reason}`);
      results.push(cached);
      continue;
    }

    console.log(`[fetch] ${playlistId} ...`);
    const result = await fetchPlaylistViaEmbed(playlistId);
    writeJson(cacheFile, result);
    if (result.ok) {
      console.log(`  -> OK: "${result.playlistName}", ${result.trackCount} tracks${result.possiblyTruncatedAt100 ? ' (== 100, possibly truncated!)' : ''}`);
    } else {
      console.log(`  -> FAILED: ${result.reason}`);
    }
    results.push(result);
  }

  return results;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { fetchPlaylistViaEmbed, extractNextData };
