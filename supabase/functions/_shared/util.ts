// Shared utilities for Edge Functions — ported from tools/deck-pipeline/lib/util.js
// and tools/deck-pipeline/lib/parse-playlist-id.js. Logic is unchanged; only the
// module system (Deno ESM instead of CommonJS) and typings are new.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalize a title/artist string for fuzzy matching:
// lowercase, strip accents, remove bracketed/parenthesized suffixes
// (e.g. "- Remastered 2011", "(Live)"), collapse whitespace/punctuation.
export function normalize(str: string | null | undefined): string {
  if (!str) return '';
  let s = str.toLowerCase();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip accents
  // remove common suffix qualifiers in parens/brackets
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  // remove trailing " - Remastered", " - Live", " - Radio Edit", etc.
  s = s.replace(
    /\s*-\s*(remaster(ed)?( \d{4})?|live.*|radio edit|single version|album version|original version( \d{4})?|mono|stereo|\d{4} (remaster|remix).*|bonus track.*|feat\..*|from .*)$/gi,
    ''
  );
  s = s.replace(/feat\.?.*$/gi, '');
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Very small Levenshtein-based similarity in [0,1].
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const an = normalize(a);
  const bn = normalize(b);
  if (!an && !bn) return 1;
  if (!an || !bn) return 0;
  if (an === bn) return 1;
  return Math.max(levenshteinSimilarity(an, bn), levenshteinSimilarity(an.replace(/\s/g, ''), bn.replace(/\s/g, '')));
}

function levenshteinSimilarity(an: string, bn: string): number {
  if (!an && !bn) return 1;
  if (!an || !bn) return 0;
  if (an === bn) return 1;
  const m = an.length;
  const n = bn.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (an[i - 1] === bn[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  const dist = dp[n];
  const maxLen = Math.max(an.length, bn.length);
  return 1 - dist / maxLen;
}

// Extract the primary artist (before first comma/&/feat) for looser matching.
export function primaryArtist(artistStr: string | null | undefined): string {
  if (!artistStr) return '';
  return artistStr.split(/,|&|feat\.?|ft\.?/i)[0].trim();
}

export function parsePlaylistId(urlOrId: string): string {
  const m = urlOrId.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9]{10,30}$/.test(urlOrId)) return urlOrId;
  throw new Error(`Cannot parse playlist id from: ${urlOrId}`);
}
