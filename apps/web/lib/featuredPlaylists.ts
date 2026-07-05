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
  url: string;
}

export const FEATURED_PLAYLISTS: FeaturedPlaylist[] = [
  { name: "Hitster#1", url: "https://open.spotify.com/playlist/310mLKsO1dHAaIePY4NpLy" },
];
