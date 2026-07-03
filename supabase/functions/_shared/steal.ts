// F2.1 — bemondás (name guess) + steal evaluation. ARCHITECTURE.md 11.2/11.4.
//
// Both functions here are PURE and SERVER-ONLY (11.9 anti-leak invariant
// #1/#2): they are only ever called from _shared/round.ts's resolveRound(),
// which runs with the service-role client inside an Edge Function. Neither
// function may be imported into any client-facing code path — doing so
// would require shipping the correct title/artist to the browser before the
// reveal, which is exactly the leak this architecture forbids.
//
// Reuses the existing normalize/similarity/primaryArtist helpers from
// _shared/util.ts (F2-D2: same fuzzy-matching helper the deck-pipeline
// already uses) and the evaluatePlacement rule from _shared/round.ts
// (S12/S13 equal-year tie-smoothing) rather than duplicating either.

import { similarity, primaryArtist } from './util.ts';
import { evaluatePlacement } from './round.ts';

// --- Types -------------------------------------------------------------

// rounds.name_guess jsonb shape (ARCHITECTURE.md 11.1.3).
export interface NameGuess {
  artistGuess: string;
  titleGuess: string;
  correct: boolean | null; // filled in by resolveRound (AC21.7); null until reveal
  createdAt: string;
}

// One element of rounds.steals jsonb array (ARCHITECTURE.md 11.1.2).
//
// REDESIGN (2026-07-03, tulaj request): `position` is now an index on the
// ACTIVE PLAYER's timeline (the same one they placed the card into), NOT
// the stealer's own timeline. Everyone — the active player and every
// stealer — is contesting the exact same gap-set on the exact same board;
// whichever single gap actually brackets the revealed year wins, no matter
// who picked it. This matches how the physical game's challenge mechanic
// works: you're disputing THEIR specific placement, not building an
// independent theory on your own timeline. When a stealer wins, the card
// still ends up on THEIR OWN timeline afterward, at whatever position
// actually corresponds to the revealed year there (computed separately,
// not reused from this index — see _shared/round.ts findInsertionIndex).
export interface StealEntry {
  playerId: string; // players.id of the stealer (NOT auth_uid)
  seatOrder: number; // snapshot at steal-registration time (F2-D5 turn-order tie-break)
  position: number; // gap index on the ACTIVE PLAYER's timeline (register_steal rejects position === round.placement)
  tokenSpent: true; // always true at registration (AC20.4 — 1 token already deducted)
  correct: boolean | null; // filled in by resolveRound
  won: boolean | null; // filled in by resolveRound — true ONLY for the player who gets the card
  createdAt: string;
}

export interface CardForEvaluation {
  title: string;
  artist: string;
  year: number;
}

// --- Bemondás (guess) evaluation ----------------------------------------

const GUESS_THRESHOLD = 0.85; // F2-D2

// AC21.3/AC21.4/AC21.5, F2-D1/F2-D2: both artist AND title must clear the
// 0.85 normalized-Levenshtein-similarity threshold — no partial credit.
// The artist check accepts either a match against the full artist string or
// against just the primary (first-listed) artist, whichever scores higher —
// this is what makes "Tom Jones" score against "Tom Jones & The Cardigans".
export function evaluateGuess(guess: NameGuess, card: CardForEvaluation): boolean {
  const artistFull = similarity(guess.artistGuess, card.artist);
  const artistPrimary = similarity(guess.artistGuess, primaryArtist(card.artist));
  const artistOk = Math.max(artistFull, artistPrimary) >= GUESS_THRESHOLD;
  const titleOk = similarity(guess.titleGuess, card.title) >= GUESS_THRESHOLD;
  return artistOk && titleOk; // F2-D1: no partial reward
}

// --- Steal evaluation ----------------------------------------------------

export interface EvaluateStealsResult {
  winnerPlayerId: string | null; // players.id of the stealer who gets the card, or null
  entries: StealEntry[]; // same array, with correct/won filled in
}

// ARCHITECTURE.md 11.4.1 step 6, redesigned 2026-07-03. Only meaningful
// when the active player's own placement was WRONG (AC22.6/22.7) — callers
// must check placementCorrect themselves and only invoke this in the
// wrong-placement branch; when the placement was correct, every steal is
// simply a loss (nobody else could ALSO be right about the exact same
// timeline's gaps once the active player already nailed it).
//
// `activeTimelineYears`: the ACTIVE PLAYER's pre-insertion timeline years —
// the SAME array for every stealer, since everyone is contesting gaps on
// that one board now, not building independent per-stealer theories.
// `activeSeatOrder`: seat_order of the round's active player, used to find
// the "next after the active player" winner among multiple correct
// stealers (F2-D5).
export function evaluateSteals(
  steals: StealEntry[],
  card: CardForEvaluation,
  activeTimelineYears: number[],
  activeSeatOrder: number
): EvaluateStealsResult {
  const evaluated = steals.map((entry) => {
    const correct = evaluatePlacement(entry.position, card.year, activeTimelineYears);
    return { ...entry, correct, won: false as boolean | null };
  });

  const correctEntries = evaluated.filter((e) => e.correct);
  if (correctEntries.length === 0) {
    return { winnerPlayerId: null, entries: evaluated };
  }

  // F2-D5: among correct stealers, the one whose seat_order is the smallest
  // positive circular distance after the active player's seat wins — i.e.
  // "next in turn order after the active player".
  let winner = correctEntries[0];
  let winnerDistance = circularDistance(activeSeatOrder, winner.seatOrder, correctEntries);
  for (const entry of correctEntries.slice(1)) {
    const distance = circularDistance(activeSeatOrder, entry.seatOrder, correctEntries);
    if (distance < winnerDistance) {
      winner = entry;
      winnerDistance = distance;
    }
  }

  const finalEntries = evaluated.map((e) => ({ ...e, won: e.playerId === winner.playerId }));
  return { winnerPlayerId: winner.playerId, entries: finalEntries };
}

// Circular "how many seats after `fromSeat` is `toSeat`" distance, computed
// modulo the number of distinct seats actually present among the candidate
// entries (avoids needing the full room roster here — the caller already
// filtered to correct stealers, and ties in seat_order don't occur since
// seat_order is unique per room).
function circularDistance(fromSeat: number, toSeat: number, allEntries: StealEntry[]): number {
  const maxSeat = Math.max(fromSeat, toSeat, ...allEntries.map((e) => e.seatOrder)) + 1;
  const diff = toSeat - fromSeat;
  return ((diff % maxSeat) + maxSeat) % maxSeat;
}
