/**
 * "Ajánlott playlistek" (H1 gyorsválasztó) — a tulaj által előre kiválasztott
 * playlist-csomagok, hogy ne kelljen mindig linket keresni/beilleszteni.
 * Szándékosan egyszerű, hardcode-olt lista (nem adatbázis-tábla) — kis
 * személyes projektnél ez a legkevesebb súrlódással karbantartható: a tulaj
 * csak szól, ha bővíteni/cserélni kell, nincs szükség admin-UI-ra.
 *
 * Kiválasztáskor a host/page.tsx előbb megnézi (findReadyDeckByPlaylistUrl),
 * van-e már ELKÉSZÜLT pakli ugyanerre a playlistre (bárkitől) — ha igen,
 * azonnal újrahasználja generálás nélkül, ha nem, elindítja a szokásos
 * generálást (ami utána mindenki más számára is azonnali lesz).
 */
export interface FeaturedPlaylist {
  name: string;
  url?: string;
  urls?: string[];
  sourceKey?: string;
}

export const FEATURED_PLAYLISTS: FeaturedPlaylist[] = [
  {
    name: "Hitster Mega Mix #1",
    sourceKey: "hitster-mega-mix-1",
    urls: [
      "https://open.spotify.com/playlist/09C8ZGUepJGErYZcI7s2Ns",
      "https://open.spotify.com/playlist/310mLKsO1dHAaIePY4NpLy",
      "https://open.spotify.com/playlist/7MDSR4KsIFAnKWCZWCe1Kn",
      "https://open.spotify.com/playlist/4vDWKlJ6Qkh5vhkc4qYT0b",
    ],
  },
  { name: "Hitster#1", url: "https://open.spotify.com/playlist/310mLKsO1dHAaIePY4NpLy" },
];

const FEATURED_SOURCE_KEYS = new Set(
  FEATURED_PLAYLISTS.flatMap((playlist) => [
    playlist.sourceKey,
    playlist.url ? parsePlaylistIdFromUrl(playlist.url) : null,
    ...(playlist.urls ?? []).map(parsePlaylistIdFromUrl),
  ]).filter((value): value is string => Boolean(value))
);

function parsePlaylistIdFromUrl(urlOrId: string): string | null {
  const m = urlOrId.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9]{10,30}$/.test(urlOrId)) return urlOrId;
  return null;
}

export function isFeaturedDeckSource(sourcePlaylistId: string | null | undefined): boolean {
  return typeof sourcePlaylistId === "string" && FEATURED_SOURCE_KEYS.has(sourcePlaylistId);
}
