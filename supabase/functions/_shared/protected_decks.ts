const PROTECTED_SOURCE_PLAYLIST_IDS = new Set([
  'hitster-mega-mix-1',
  '09C8ZGUepJGErYZcI7s2Ns',
  '310mLKsO1dHAaIePY4NpLy',
  '7MDSR4KsIFAnKWCZWCe1Kn',
  '4vDWKlJ6Qkh5vhkc4qYT0b',
]);

export function isProtectedDeckSource(sourcePlaylistId: string | null | undefined): boolean {
  return typeof sourcePlaylistId === 'string' && PROTECTED_SOURCE_PLAYLIST_IDS.has(sourcePlaylistId);
}
