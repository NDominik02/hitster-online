// Shared utilities for the deck-pipeline scripts.
'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function ensureDirs() {
  for (const dir of [CACHE_DIR, OUTPUT_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function cachePath(name) {
  return path.join(CACHE_DIR, name);
}

function outputPath(name) {
  return path.join(OUTPUT_DIR, name);
}

function readJsonIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalize a title/artist string for fuzzy matching:
// lowercase, strip accents, remove bracketed/parenthesized suffixes
// (e.g. "- Remastered 2011", "(Live)"), collapse whitespace/punctuation.
function normalize(str) {
  if (!str) return '';
  let s = str.toLowerCase();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip accents
  // remove common suffix qualifiers in parens/brackets
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  // remove trailing " - Remastered", " - Live", " - Radio Edit", etc.
  s = s.replace(/\s*-\s*(remaster(ed)?( \d{4})?|live.*|radio edit|single version|album version|mono|stereo|\d{4} remaster.*|bonus track.*|feat\..*|from .*)$/gi, '');
  s = s.replace(/feat\.?.*$/gi, '');
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Very small Levenshtein-based similarity in [0,1].
function similarity(a, b) {
  a = normalize(a);
  b = normalize(b);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  const dist = dp[n];
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

// Extract the primary artist (before first comma/&/feat) for looser matching.
function primaryArtist(artistStr) {
  if (!artistStr) return '';
  return artistStr.split(/,|&|feat\.?|ft\.?/i)[0].trim();
}

module.exports = {
  CACHE_DIR,
  OUTPUT_DIR,
  ensureDirs,
  cachePath,
  outputPath,
  readJsonIfExists,
  writeJson,
  sleep,
  normalize,
  similarity,
  primaryArtist,
};
