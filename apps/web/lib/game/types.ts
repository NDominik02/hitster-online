/**
 * Domain típusok — tükrözik az ARCHITECTURE.md 1. szakasz Postgres sémáját
 * és a player-facing nézeteket (round_public, timeline_public).
 *
 * FONTOS anti-leak megjegyzés: a `RoundPublic` típus SOSEM tartalmaz `cardId`-t —
 * ez tükrözi a valós `round_public` view-t (ARCHITECTURE 2.6), amely szándékosan
 * nem adja ki a kártya azonosítót a reveal fázis előtt. Ne bővítsd ezt a típust
 * card_id-vel, még "kényelmi" céllal se.
 */

export type RoomStatus = "lobby" | "playing" | "paused" | "finished";

export type RoundPhase =
  | "playing"
  | "placing"
  | "stealing" // F2 — F1-ben 0 mp, gyakorlatilag azonnal reveal felé megy
  | "reveal"
  | "done";

export type CardOutcome = "correct" | "wrong" | "timeout" | "disputed";

export const PLAYER_COLORS = [
  { id: "green", label: "Zöld", value: "var(--player-green)" },
  { id: "blue", label: "Kék", value: "var(--player-blue)" },
  { id: "purple", label: "Lila", value: "var(--player-purple)" },
  { id: "orange", label: "Narancs", value: "var(--player-orange)" },
  { id: "red", label: "Piros", value: "var(--player-red)" },
  { id: "yellow", label: "Sárga", value: "var(--player-yellow)" },
  { id: "teal", label: "Türkiz", value: "var(--player-teal)" },
  { id: "pink", label: "Rózsaszín", value: "var(--player-pink)" },
] as const;

export type PlayerColorId = (typeof PLAYER_COLORS)[number]["id"];

export interface Player {
  id: string;
  roomId: string;
  name: string;
  color: PlayerColorId;
  seatOrder: number;
  connected: boolean;
  /** F2-kész mező, F1-ben nem jelenítjük meg (DESIGN ⟨F2⟩) */
  tokens?: number;
}

export interface RoomSettings {
  winTarget: number; // alap 10 (5 = gyors, 15 = maraton)
  timeLimitSec: number; // alap 90
  stealEnabled: boolean; // F1-ben mindig false
  /** Pass-and-play (2026-07): a mód létrehozáskor rögzül, menet közben nem váltható. */
  mode: "shared_screen" | "pass_and_play";
}

export interface Room {
  id: string;
  code: string; // 4 betűs szobakód
  hostUid: string;
  deckId: string;
  status: RoomStatus;
  settings: RoomSettings;
  currentRoundId: string | null;
  winnerPlayerIds: string[]; // D3: megosztott győzelem → tömb
  /**
   * S20/S30 (F3, Spotify Premium) — a rooms.spotify_playback_mode oszlop
   * (NEM a settings JSON része — a szerver create_room-kor állítja be,
   * és sosem bízik a kliens kérésében validáció nélkül). 'premium' esetén a
   * host oldal a Web Playback SDK-t/Connect API-t próbálja meg elsőként,
   * 'preview'-nál (alapértelmezett) az F1 óta ismert 30 mp-es <audio> megy.
   */
  spotifyPlaybackMode: "preview" | "premium";
}

/** A player-facing round nézet — tükrözi a round_public view-t, SOHA nincs benne card_id. */
export interface RoundPublic {
  id: string;
  roomId: string;
  roundNo: number;
  activePlayerId: string;
  phase: RoundPhase;
  placement: number | null;
  outcome: CardOutcome | null;
  placingDeadline: string | null; // ISO timestamp
  stealDeadline: string | null;
  /** Csak reveal/done fázisban töltött — a szerver oldali round_public view logikáját tükrözi. */
  revealedCard: RevealedCard | null;
}

export interface RevealedCard {
  title: string;
  artist: string;
  year: number;
  artworkUrl?: string;
  /**
   * F2 (ARCHITECTURE 11.5) — a bemondás eredménye, csak reveal/done fázisban jelenik meg
   * (anti-leak, a `revealed_card` jsonb-n át, sosem a `round_public` nézet külön mezőjén).
   * `null`, ha nem volt bemondás ebben a körben. A Backend F2-bővítése előtt ez a mező
   * egyszerűen hiányzik a payloadból — a UI ezt `undefined`/`null`-ként kezeli.
   */
  guess?: { correct: boolean; byPlayerId: string } | null;
  /**
   * F2 (ARCHITECTURE 11.5) — a steal-kísérletek publikus eredménye (ki próbált, helyes
   * volt-e, ki nyerte a kártyát). `position` szándékosan NINCS itt (belső infó, F2-D5).
   * Üres tömb, ha nem volt steal-kísérlet ebben a körben.
   */
  steals?: Array<{ playerId: string; correct: boolean; won: boolean }>;
}

/** timeline_public nézet — csak felfedett, beépült kártyák publikus mezői. */
export interface TimelineCardPublic {
  id: string;
  playerId: string;
  position: number;
  isStart: boolean;
  title: string;
  artist: string;
  year: number;
  artworkUrl?: string;
}

export interface CoverageExcludedTrack {
  title: string;
  artist: string;
  reason: "no_preview" | "no_year";
}

export interface DeckReport {
  usable: number;
  total: number;
  coveragePct: number;
  meetsMinimum: boolean; // usable >= 60 (D4)
  excluded: CoverageExcludedTrack[];
  uncertainYearCount?: number;
}

export interface Deck {
  id: string;
  name: string;
  sourcePlaylistUrl: string;
  totalTracks: number;
  usableCount: number;
  coveragePct: number;
  status: "generating" | "ready" | "failed";
  report: DeckReport;
  /** S31 (F3, pakli-könyvtár) — a pakli-könyvtár listánál kell (saját vs. megosztott jelölés). */
  ownerId?: string | null;
  createdAt?: string;
  /** Generálás közbeni progress (BACKEND-NOTES 4.: decks.report.{processed,total,step}). */
  progress: {
    processed: number;
    total: number;
    step: "fetching_playlist" | "resolving_years" | "uploading_audio" | "done" | "failed" | string;
    /** Csak status='failed' esetén — a hiba oka (pl. playlist_not_public). */
    failReason?: string;
  };
}

/** A host draw_card válasza — KIZÁRÓLAG a host kliens kapja meg (D7 anti-leak). */
export interface DrawCardResponse {
  roundId: string;
  roundNo: number;
  activePlayerId: string;
  audioUrl: string; // signed URL, csak host — mindig jelen, premium módban is fallbackként
  /** S20 (F3, Web Playback SDK) — csak 'premium' módú szobában, ha a kártyának van spotify_uri-ja
   *  és a host Spotify-kapcsolata érvényes/frissíthető. Hiányában a kliens a preview audioUrl-re
   *  esik vissza. A tényleges access token sosem jut el ide — a spotify_playback_command proxy
   *  szerveroldalon kéri le, amikor a kliens ezzel az URI-vel lejátszást indít. */
  spotifyUri?: string;
  placingDeadline: string;
}

/**
 * S41 (F4, statisztikák) — a `rounds` tábla teljes, befejezett (finished
 * szoba) parti-történetéből számolt, játékosonkénti összesítő. A `rounds`
 * SELECT RLS (rounds_member_select: is_room_member) bármely szobatagnak
 * megengedi — nincs szükség külön Edge Function-re, a kliens maga számol
 * (nincs itt semmilyen mutáció, csak már látható adat aggregálása).
 */
export interface PlayerGameStats {
  playerId: string;
  correctPlacements: number;
  wrongPlacements: number;
  timeouts: number;
  successfulSteals: number;
  correctGuesses: number;
}

/** Az élő húzás (drag) broadcast payload — csak vizuális, sosem játékállapot (AC10.1). */
export interface DragBroadcastPayload {
  playerId: string;
  slotIndex: number | null;
}

/** F2 (ARCHITECTURE 11.3.3) — a "Bemondom!" kapcsoló alatt gyűjtött nyers beírt sztringek. */
export interface NameGuessInput {
  artistGuess: string;
  titleGuess: string;
}
