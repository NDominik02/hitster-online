/**
 * Mock/demo adatok — amíg a Backend agent Supabase-integrációja nincs bekötve,
 * ezekkel a komponensek és flow-k önmagukban bemutathatók (lásd /dev-preview route
 * és a host/player shell fallback-je).
 *
 * Amint elkészül a valós backend (docs/BACKEND-NOTES.md), a lib/supabase/ réteg
 * veszi át ezek helyét — ezt a fájlt csak demo/fejlesztési céllal használjuk.
 */

import type {
  CoverageExcludedTrack,
  Deck,
  Player,
  Room,
  RoundPublic,
  TimelineCardPublic,
} from "./game/types";

export const MOCK_ROOM_CODE = "RGBZ";

export const mockExcludedTracks: CoverageExcludedTrack[] = [
  { title: "Something in the Way", artist: "Nirvana", reason: "no_preview" },
  { title: "Ismeretlen cím", artist: "XYZ", reason: "no_year" },
  { title: "Live Bootleg Mix", artist: "Various", reason: "no_preview" },
  { title: "Rádióverzió", artist: "Zenekar Z", reason: "no_year" },
  { title: "Demo Take 3", artist: "Artist Q", reason: "no_preview" },
  { title: "Unplugged Session", artist: "Artist W", reason: "no_preview" },
];

export const mockDeck: Deck = {
  id: "deck-mock-1",
  name: "🎤 Buli lejátszási lista",
  sourcePlaylistUrl: "https://open.spotify.com/playlist/63bLUR4eamvtD9ArI4LFy9",
  totalTracks: 100,
  usableCount: 94,
  coveragePct: 94.0,
  status: "ready",
  report: {
    usable: 94,
    total: 100,
    coveragePct: 94.0,
    meetsMinimum: true,
    excluded: mockExcludedTracks,
    uncertainYearCount: 21,
  },
  progress: { processed: 100, total: 100, step: "done" },
};

export const mockDeckTooSmall: Deck = {
  id: "deck-mock-2",
  name: "🎧 Niche playlist",
  sourcePlaylistUrl: "https://open.spotify.com/playlist/abc123",
  totalTracks: 55,
  usableCount: 38,
  coveragePct: 69.1,
  status: "ready",
  report: {
    usable: 38,
    total: 55,
    coveragePct: 69.1,
    meetsMinimum: false,
    excluded: mockExcludedTracks.slice(0, 3),
  },
  progress: { processed: 55, total: 55, step: "done" },
};

export const mockPlayers: Player[] = [
  { id: "p1", roomId: "room-mock", name: "Anna", color: "green", seatOrder: 0, connected: true },
  { id: "p2", roomId: "room-mock", name: "Bence", color: "blue", seatOrder: 1, connected: true },
  { id: "p3", roomId: "room-mock", name: "Csilla", color: "purple", seatOrder: 2, connected: true },
  { id: "p4", roomId: "room-mock", name: "Dani", color: "orange", seatOrder: 3, connected: false },
];

export const mockRoom: Room = {
  id: "room-mock",
  code: MOCK_ROOM_CODE,
  hostUid: "host-mock",
  deckId: mockDeck.id,
  status: "playing",
  settings: { winTarget: 10, timeLimitSec: 90, stealEnabled: false, mode: "shared_screen" },
  currentRoundId: "round-mock-1",
  winnerPlayerIds: [],
  spotifyPlaybackMode: "preview",
};

export const mockRoomLobby: Room = {
  ...mockRoom,
  status: "lobby",
  currentRoundId: null,
};

export const mockRoomFinished: Room = {
  ...mockRoom,
  status: "finished",
  winnerPlayerIds: ["p1"],
};

export const mockRound: RoundPublic = {
  id: "round-mock-1",
  roomId: "room-mock",
  roundNo: 7,
  activePlayerId: "p1",
  phase: "playing",
  placement: null,
  outcome: null,
  placingDeadline: new Date(Date.now() + 47_000).toISOString(),
  stealDeadline: null,
  revealedCard: null,
};

export const mockRoundReveal: RoundPublic = {
  ...mockRound,
  phase: "reveal",
  placement: 2,
  outcome: "correct",
  revealedCard: {
    title: "Bohemian Rhapsody",
    artist: "Queen",
    year: 1975,
    artworkUrl: undefined,
  },
};

/** Minden mock játékos idővonala (timeline_public formátumban). */
export const mockTimelines: Record<string, TimelineCardPublic[]> = {
  p1: [
    { id: "t1", playerId: "p1", position: 0, isStart: true, title: "Sweet Child O' Mine", artist: "Guns N' Roses", year: 1987 },
    { id: "t2", playerId: "p1", position: 1, isStart: false, title: "Smells Like Teen Spirit", artist: "Nirvana", year: 1991 },
    { id: "t3", playerId: "p1", position: 2, isStart: false, title: "Mr. Brightside", artist: "The Killers", year: 2004 },
    { id: "t4", playerId: "p1", position: 3, isStart: false, title: "Rolling in the Deep", artist: "Adele", year: 2010 },
    { id: "t5", playerId: "p1", position: 4, isStart: false, title: "Bad Guy", artist: "Billie Eilish", year: 2019 },
  ],
  p2: [
    { id: "t6", playerId: "p2", position: 0, isStart: true, title: "Billie Jean", artist: "Michael Jackson", year: 1982 },
    { id: "t7", playerId: "p2", position: 1, isStart: false, title: "Nothing Compares 2 U", artist: "Sinéad O'Connor", year: 1990 },
    { id: "t8", playerId: "p2", position: 2, isStart: false, title: "…Baby One More Time", artist: "Britney Spears", year: 1998 },
    { id: "t9", playerId: "p2", position: 3, isStart: false, title: "Hey Ya!", artist: "OutKast", year: 2003 },
    { id: "t10", playerId: "p2", position: 4, isStart: false, title: "Uptown Funk", artist: "Bruno Mars", year: 2015 },
  ],
  p3: [
    { id: "t11", playerId: "p3", position: 0, isStart: true, title: "Space Oddity", artist: "David Bowie", year: 1969 },
    { id: "t12", playerId: "p3", position: 1, isStart: false, title: "Don't Stop Believin'", artist: "Journey", year: 1981 },
    { id: "t13", playerId: "p3", position: 2, isStart: false, title: "Clocks", artist: "Coldplay", year: 2002 },
    { id: "t14", playerId: "p3", position: 3, isStart: false, title: "Somebody That I Used to Know", artist: "Gotye", year: 2011 },
  ],
  p4: [
    { id: "t15", playerId: "p4", position: 0, isStart: true, title: "The Boys of Summer", artist: "Don Henley", year: 1984 },
    { id: "t16", playerId: "p4", position: 1, isStart: false, title: "Umbrella", artist: "Rihanna", year: 2007 },
    { id: "t17", playerId: "p4", position: 2, isStart: false, title: "Rolling in the Deep", artist: "Adele", year: 2011 },
  ],
};

export const mockJoinUrl = `https://hitster.app/play/${MOCK_ROOM_CODE}`;
