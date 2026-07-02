// Orchestrator: runs all 3 pipeline steps for one or more playlists, in sequence.
// Each step is independently cached (tools/deck-pipeline/cache/*.json), so
// re-running this is cheap and safe.
'use strict';

const { parsePlaylistId } = require('./lib/parse-playlist-id');
const { ensureDirs } = require('./lib/util');
const { fetchPlaylistViaEmbed } = require('./01-fetch-playlist');
const { resolveYearsForPlaylist } = require('./02-resolve-years');
const { matchPreviewsForPlaylist } = require('./03-match-previews');
const { cachePath, readJsonIfExists, writeJson } = require('./lib/util');

async function runOne(urlOrId) {
  const playlistId = parsePlaylistId(urlOrId);
  console.log(`\n=== ${playlistId} ===`);

  const step1File = cachePath(`01-playlist-${playlistId}.json`);
  let step1 = readJsonIfExists(step1File);
  if (!step1) {
    console.log('[1/3] fetching playlist via embed...');
    step1 = await fetchPlaylistViaEmbed(playlistId);
    writeJson(step1File, step1);
  } else {
    console.log('[1/3] cached.');
  }

  if (!step1.ok) {
    console.log(`  ABORT: ${step1.reason}`);
    return { playlistId, ok: false, reason: step1.reason };
  }
  console.log(`  ${step1.trackCount} tracks found${step1.possiblyTruncatedAt100 ? ' (== 100, check truncation!)' : ''}.`);

  console.log('[2/3] resolving years via MusicBrainz (throttled 1req/s)...');
  await resolveYearsForPlaylist(playlistId);

  console.log('[3/3] matching iTunes previews (throttled ~1req/3s)...');
  const final = await matchPreviewsForPlaylist(playlistId);

  return { playlistId, ok: true, final };
}

async function main() {
  ensureDirs();
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error('Usage: node run-pipeline.js <playlistUrlOrId> [more...]');
    process.exit(1);
  }
  const results = [];
  for (const url of urls) {
    results.push(await runOne(url));
  }
  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    if (!r.ok) {
      console.log(`${r.playlistId}: FAILED - ${r.reason}`);
    } else {
      console.log(`${r.playlistId} "${r.final.playlistName}": ${r.final.playableCount}/${r.final.trackCount} playable (${r.final.coveragePct}%)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
