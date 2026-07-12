// Shared round/draw logic used by start_game, draw_card, and next_turn.
// Kept here so the "draw next card" behavior (ARCHITECTURE.md 3.5) is
// implemented once and reused, per CLAUDE.md ("the server is the source of
// truth" — one code path for mutating rounds/rooms).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { evaluateGuess, evaluateSteals, type NameGuess, type StealEntry } from './steal.ts';
import { getValidSpotifyAccessToken } from './spotify.ts';

export interface DrawResult {
  ok: boolean;
  deckExhausted?: boolean;
  roundId?: string;
  roundNo?: number;
  activePlayerId?: string;
  audioUrl?: string; // signed URL — ONLY ever returned to the host caller (D7/6.4)
  // S20 (F3, Web Playback SDK) — jelen VAN, ha a szoba 'premium' módban fut,
  // a kártyának van spotify_uri-ja, ÉS a host Spotify-tokenje élő/frissíthető.
  // A kliens EZT próbálja meg elsőként (spotify_playback_command proxyn
  // keresztül — a nyers access token SOSEM megy ki a kliensnek, a proxy maga
  // kéri le szerveroldalon), és csak hiba esetén esik vissza az audioUrl
  // (preview) útra — sosem a szerver hibázik emiatt.
  spotifyUri?: string;
  /** Playtest feedback (2026-07-06): a host oldal AudioProgressBar-ja korábban
   * hardcoded 30 mp-et írt ki, mert a valódi lejátszási hossz sosem ért el a
   * klienshez — a deck_cards.duration_ms-t nem sértő biztonsági szempontból
   * (nem a kártya tartalma, csak a track hossza), ezért ez a player kliensnek
   * IS visszaadható lenne, de jelenleg csak a host-only draw_card útvonalon
   * folyik át (a UI ma csak ott használja). */
  durationMs?: number | null;
  placingDeadline?: string;
  error?: string;
}

const SIGNED_URL_TTL_SEC = 60 * 5; // timeLimitSec (usually 90s) + buffer, capped generously at 5 min
const PREMIUM_TRACK_DEADLINE_GRACE_SEC = 5;

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// S20 — közös segédfüggvény: egy adott kártyához feloldja a lejátszási
// forrást (mindig kiszámolt preview audioUrl fallbackként, PLUSZ opcionális
// premium spotifyUri). Ugyanezt használja a drawCard (új kör indításakor) ÉS
// a draw_card Edge Function "már aktív kör" ága (amikor csak egy friss
// signed URL-t kér újra a host anélkül, hogy új kört indítana) — így a két
// hívási út sosem térhet el egymástól.
export async function resolveCardPlayback(
  supabase: SupabaseClient,
  room: { host_uid: string; spotify_playback_mode?: string | null },
  cardId: string
): Promise<{ audioUrl?: string; spotifyUri?: string; durationMs?: number | null }> {
  const { data: fullCard } = await supabase
    .from('deck_cards')
    .select('audio_url, spotify_uri, duration_ms')
    .eq('id', cardId)
    .single();

  let audioUrl: string | undefined;
  if (fullCard?.audio_url) {
    const { data: signed } = await supabase.storage
      .from('deck-audio')
      .createSignedUrl(fullCard.audio_url, SIGNED_URL_TTL_SEC);
    audioUrl = signed?.signedUrl;
  }

  let spotifyUri: string | undefined;
  if (room.spotify_playback_mode === 'premium' && fullCard?.spotify_uri) {
    // Csak ANNAK ellenőrzésére kérünk tokent, hogy a kapcsolat még él/frissíthető —
    // magát a tokent SOSEM adjuk vissza a kliensnek (ld. fenti DrawResult jsdoc).
    const token = await getValidSpotifyAccessToken(supabase, room.host_uid);
    if (token) spotifyUri = fullCard.spotify_uri;
  }

  return { audioUrl, spotifyUri, durationMs: fullCard?.duration_ms ?? null };
}

export async function pickRandomUnusedDeckCard<T extends { id: string }>(
  supabase: SupabaseClient,
  room: { id: string; deck_id: string; deck_cursor?: number | null },
  selectColumns: string
): Promise<{ ok: true; card: T; nextCursor: number } | { ok: true; deckExhausted: true } | { ok: false; error: string }> {
  const { data: deckCards, error: cardsError } = await supabase
    .from('deck_cards')
    .select(selectColumns)
    .eq('deck_id', room.deck_id);

  if (cardsError || !deckCards) return { ok: false, error: 'deck_cards_fetch_failed' };

  const { data: players, error: playersError } = await supabase.from('players').select('id').eq('room_id', room.id);
  if (playersError || !players) return { ok: false, error: 'players_fetch_failed' };

  const playerIds = players.map((player: { id: string }) => player.id);
  const { data: timelineCards, error: timelineError } = playerIds.length
    ? await supabase.from('timeline_cards').select('card_id').in('player_id', playerIds)
    : { data: [] as Array<{ card_id: string }>, error: null };
  if (timelineError) return { ok: false, error: 'timeline_cards_fetch_failed' };

  const { data: roundCards, error: roundsError } = await supabase.from('rounds').select('card_id').eq('room_id', room.id);
  if (roundsError) return { ok: false, error: 'round_cards_fetch_failed' };

  const usedCardIds = new Set<string>();
  for (const row of timelineCards ?? []) {
    if (row.card_id) usedCardIds.add(row.card_id);
  }
  for (const row of roundCards ?? []) {
    if (row.card_id) usedCardIds.add(row.card_id);
  }

  const availableCards = (deckCards as T[]).filter((card) => !usedCardIds.has(card.id));
  if (availableCards.length === 0) return { ok: true, deckExhausted: true };

  return {
    ok: true,
    card: pickRandom(availableCards),
    nextCursor: Math.min((room.deck_cursor ?? usedCardIds.size) + 1, deckCards.length),
  };
}

// Draws the next card for a room and creates a new `rounds` row.
// `activePlayerId` must be resolved by the caller (start_game: first seat;
// next_turn: next seat in turn order).
export async function drawCard(
  supabase: SupabaseClient,
  roomId: string,
  activePlayerId: string
): Promise<DrawResult> {
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, deck_id, deck_cursor, settings, status, host_uid, spotify_playback_mode')
    .eq('id', roomId)
    .single();

  if (roomError || !room) return { ok: false, error: 'room_not_found' };

  const pick = await pickRandomUnusedDeckCard<{ id: string }>(supabase, room, 'id');
  if (!pick.ok) return pick;
  if ('deckExhausted' in pick) {
    return { ok: true, deckExhausted: true };
  }

  const card = pick.card;

  const { count: roundCount } = await supabase
    .from('rounds')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId);

  const roundNo = (roundCount ?? 0) + 1;

  // Resolve playback before creating the round so full-track Spotify Premium games
  // do not timeout in the middle of a song just because the generic room time limit
  // is shorter than the current track.
  const playback = await resolveCardPlayback(supabase, room, card.id);
  const configuredTimeLimitSec = (room.settings as any)?.timeLimitSec ?? 90;
  const premiumTrackDurationSec =
    room.spotify_playback_mode === 'premium' && playback.durationMs
      ? Math.ceil(playback.durationMs / 1000) + PREMIUM_TRACK_DEADLINE_GRACE_SEC
      : 0;
  const placingWindowSec = Math.max(configuredTimeLimitSec, premiumTrackDurationSec);
  const placingDeadline = new Date(Date.now() + placingWindowSec * 1000).toISOString();

  const { data: newRound, error: roundError } = await supabase
    .from('rounds')
    .insert({
      room_id: roomId,
      round_no: roundNo,
      card_id: card.id,
      active_player_id: activePlayerId,
      phase: 'playing',
      placing_deadline: placingDeadline,
    })
    .select()
    .single();

  if (roundError || !newRound) return { ok: false, error: 'round_insert_failed' };

  await supabase
    .from('rooms')
    .update({ deck_cursor: pick.nextCursor, current_round_id: newRound.id, updated_at: new Date().toISOString() })
    .eq('id', roomId);

  return {
    ok: true,
    roundId: newRound.id,
    roundNo,
    activePlayerId,
    ...playback,
    placingDeadline,
  };
}

// Resolves the game-end condition (D3 shared victory, AC16 deck exhaustion).
export async function checkWinnersAndFinish(
  supabase: SupabaseClient,
  roomId: string
): Promise<{ finished: boolean; winnerPlayerIds?: string[] }> {
  const { data: room } = await supabase.from('rooms').select('settings').eq('id', roomId).single();
  const winTarget = (room?.settings as any)?.winTarget ?? 10;

  const { data: players } = await supabase.from('players').select('id').eq('room_id', roomId).is('kicked_at', null);
  if (!players || players.length === 0) return { finished: false };

  const counts = await Promise.all(
    players.map(async (p: { id: string }) => {
      const { count } = await supabase
        .from('timeline_cards')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', p.id);
      return { playerId: p.id, count: count ?? 0 };
    })
  );

  const maxCount = Math.max(...counts.map((c) => c.count));
  if (maxCount >= winTarget) {
    const winners = counts.filter((c) => c.count === maxCount).map((c) => c.playerId);
    await supabase
      .from('rooms')
      .update({ status: 'finished', winner_player_ids: winners, updated_at: new Date().toISOString() })
      .eq('id', roomId);
    return { finished: true, winnerPlayerIds: winners };
  }

  return { finished: false };
}

// Deck-exhaustion game end (AC16): winner = longest timeline, ties share victory (D3).
export async function finishByDeckExhaustion(
  supabase: SupabaseClient,
  roomId: string
): Promise<{ winnerPlayerIds: string[] }> {
  const { data: players } = await supabase.from('players').select('id').eq('room_id', roomId).is('kicked_at', null);
  const counts = await Promise.all(
    (players ?? []).map(async (p: { id: string }) => {
      const { count } = await supabase
        .from('timeline_cards')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', p.id);
      return { playerId: p.id, count: count ?? 0 };
    })
  );

  const maxCount = counts.length > 0 ? Math.max(...counts.map((c) => c.count)) : 0;
  const winners = counts.filter((c) => c.count === maxCount).map((c) => c.playerId);

  await supabase
    .from('rooms')
    .update({ status: 'finished', winner_player_ids: winners, updated_at: new Date().toISOString() })
    .eq('id', roomId);

  return { winnerPlayerIds: winners };
}

// ---------------------------------------------------------------------------
// resolveRound — ARCHITECTURE.md 3.8, the critical anti-leak reveal step.
//
// Extracted so BOTH the host-triggered path (resolve_round Edge Function)
// and the server-side safety net (auto_resolve_expired_rounds, pg_cron) run
// the EXACT same evaluation/outcome/timeline logic. There must never be two
// implementations of "how a round resolves" that could drift apart.
//
// Concurrency: the caller decides whether the deadline-check applies (the
// host path always requires deadlinePassed when placement is null; the cron
// path only ever looks at rounds whose deadline has already passed, since
// that's the WHERE clause it queries with — see auto_resolve_expired_rounds).
// The actual protection against double-processing is the optimistic lock in
// the final UPDATE ... WHERE phase IN (...) below: whichever caller's UPDATE
// lands first flips the phase to 'reveal' and the other gets 0 rows back
// (ResolveRoundResult.conflict = true), matching the pre-existing pattern in
// place_card / resolve_round's original optimistic lock.
// ---------------------------------------------------------------------------

export interface ResolveRoundResult {
  ok: boolean;
  conflict?: boolean; // 0 rows updated — round was already resolved elsewhere (race, handled)
  error?: string;
  phase?: 'reveal';
  outcome?: 'correct' | 'wrong' | 'timeout';
  revealedCard?: {
    title: string;
    artist: string;
    year: number;
    artworkUrl: string | null;
    // REDESIGN (2026-07-06): exposes the player's actual guessed text/year
    // alongside per-field correctness — safe at reveal time since the true
    // answer is already public here, and the host needs to SEE what was
    // guessed to judge borderline cases (ld. GuessInput/override_guess).
    guess: {
      byPlayerId: string;
      titleGuess: string;
      artistGuess: string;
      yearGuess: string | null;
      titleCorrect: boolean | null;
      artistCorrect: boolean | null;
      yearCorrect: boolean | null;
    } | null;
    steals: Array<{ playerId: string; correct: boolean; won: boolean }>;
  };
}

// Fetches a single player's timeline years (ordered by position). Used both
// for the active player's own placement/steal evaluation and (exported) by
// dispute_round to re-evaluate a round against a host-corrected year.
export async function fetchTimelineYears(
  supabase: SupabaseClient,
  playerId: string
): Promise<{ rows: Array<{ id: string; position: number; card_id: string }>; years: number[] }> {
  const { data: timeline } = await supabase
    .from('timeline_cards')
    .select('id, position, card_id')
    .eq('player_id', playerId)
    .order('position', { ascending: true });

  const rows = timeline ?? [];
  const years: number[] = [];
  if (rows.length > 0) {
    const cardIds = rows.map((t: { card_id: string }) => t.card_id);
    const { data: cardData } = await supabase.from('deck_cards').select('id, year').in('id', cardIds);
    const yearById = new Map((cardData ?? []).map((c: { id: string; year: number }) => [c.id, c.year]));
    for (const t of rows) years.push(yearById.get(t.card_id) as number);
  }
  return { rows, years };
}

// Inserts `card` into `playerId`'s timeline at `position`, shifting any
// existing cards at/after that position up by one. Shared by the
// active-player-correct path, the steal-winner path (F2.1), and dispute_round
// (re-applying a placement after a host year-correction).
export async function insertIntoTimeline(
  supabase: SupabaseClient,
  playerId: string,
  cardId: string,
  position: number,
  timelineRows: Array<{ id: string; position: number }>
): Promise<void> {
  const toShift = timelineRows.filter((t) => t.position >= position);
  for (const t of toShift.sort((a, b) => b.position - a.position)) {
    await supabase
      .from('timeline_cards')
      .update({ position: t.position + 1 })
      .eq('id', t.id);
  }
  await supabase.from('timeline_cards').insert({
    player_id: playerId,
    card_id: cardId,
    position,
    is_start: false,
    placed_round_no: null,
  });
}

// Finds and removes whichever timeline_cards row currently holds `cardId`
// (a card can only ever sit on one player's timeline at a time), re-indexing
// the rest of that player's timeline down by one. No-op if the card was
// never inserted anywhere (e.g. outcome was 'wrong' with no winning steal).
// Used by dispute_round to undo a round's placement before re-applying it
// against a host-corrected year.
export async function removeFromTimelineByCardId(supabase: SupabaseClient, cardId: string): Promise<void> {
  const { data: insertedRow } = await supabase
    .from('timeline_cards')
    .select('id, player_id, position')
    .eq('card_id', cardId)
    .maybeSingle();

  if (!insertedRow) return;

  await supabase.from('timeline_cards').delete().eq('id', insertedRow.id);

  const { data: laterRows } = await supabase
    .from('timeline_cards')
    .select('id, position')
    .eq('player_id', insertedRow.player_id)
    .gt('position', insertedRow.position)
    .order('position', { ascending: true });

  for (const row of laterRows ?? []) {
    await supabase.from('timeline_cards').update({ position: row.position - 1 }).eq('id', row.id);
  }
}

// Resolves a single round: evaluates the placement, the steal attempts
// (F2.1, S22) and the name-guess (F2.1, S21), then writes phase='reveal' +
// outcome + revealed_card + steals + name_guess in ONE UPDATE (2.6/11.9: no
// leak window — the reveal-gated round_public view only ever shows
// revealed_card once phase flips, so nothing here is visible early). Only
// AFTER that UPDATE successfully claims the round (optimistic lock) do we
// run the token/timeline side-effects (11.4.2 — this is what prevents
// double-crediting if the host and the pg_cron safety net race).
//
// `requireDeadlinePassed`: when true (host path), a null placement is only
// accepted as a timeout if the RELEVANT deadline has actually lapsed
// server-side (D6/A2 — the host cannot fake an early close). F2 adds a
// phase-dependent deadline choice (11.7): 'stealing' phase checks
// steal_deadline, everything else checks placing_deadline. The cron path
// always queries only rounds whose deadline has already passed, so it does
// not need this guard, but passes true anyway defensively.
export async function resolveRound(
  supabase: SupabaseClient,
  roundId: string,
  opts: { requireDeadlinePassed?: boolean } = {}
): Promise<ResolveRoundResult> {
  const requireDeadlinePassed = opts.requireDeadlinePassed ?? true;

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select(
      'id, room_id, card_id, active_player_id, phase, placement, placing_deadline, steal_deadline, steals, name_guess'
    )
    .eq('id', roundId)
    .single();

  if (roundError || !round) return { ok: false, error: 'round_not_found' };

  if (!['playing', 'placing', 'stealing'].includes(round.phase)) {
    return { ok: false, error: 'phase_conflict' };
  }

  // 11.7: which deadline governs this round depends on its current phase.
  // A 'stealing' round is gated by steal_deadline (the 15s window, AC22.1);
  // 'playing'/'placing' rounds are gated by placing_deadline (D6) as before.
  const relevantDeadline = round.phase === 'stealing' ? round.steal_deadline : round.placing_deadline;
  const deadlinePassed = relevantDeadline ? new Date(relevantDeadline).getTime() <= Date.now() : true;

  if (round.phase === 'stealing' && requireDeadlinePassed && !deadlinePassed) {
    // AC22.1/11.3.2: the host cannot close the steal window early — only the
    // 15s elapsing (or, in a future optimization, everyone having decided)
    // may end it. F2.1 always waits the full 15s (F2-A2).
    return { ok: false, error: 'steal_window_open' };
  }
  if (round.placement === null && requireDeadlinePassed && !deadlinePassed) {
    return { ok: false, error: 'deadline_not_reached' };
  }

  const { data: card, error: cardError } = await supabase
    .from('deck_cards')
    .select('id, title, artist, year, artwork_url')
    .eq('id', round.card_id)
    .single();

  if (cardError || !card) return { ok: false, error: 'card_not_found' };

  // Step 5 (11.4.1): evaluate the active player's own placement.
  const active = await fetchTimelineYears(supabase, round.active_player_id);

  let outcome: 'correct' | 'wrong' | 'timeout';
  let placementCorrect = false;
  if (round.placement === null) {
    outcome = 'timeout'; // D6: no finalized placement when the deadline lapsed
  } else {
    placementCorrect = evaluatePlacement(round.placement, card.year, active.years);
    outcome = placementCorrect ? 'correct' : 'wrong';
  }

  // Step 6 (11.4.1): steal evaluation — only meaningful when there were any
  // steal attempts. AC22.6: if the active placement was correct, every
  // steal simply fails (no need to evaluate positions). AC22.7/F2-D5: if the
  // active placement was wrong, the correct stealer nearest in turn order
  // after the active player wins the card.
  const steals: StealEntry[] = (round.steals ?? []) as StealEntry[];
  let stealWinnerId: string | null = null;
  let evaluatedSteals: StealEntry[] = steals;

  if (steals.length > 0) {
    if (placementCorrect) {
      evaluatedSteals = steals.map((s) => ({ ...s, correct: false, won: false }));
    } else {
      // REDESIGN (2026-07-03): every steal position is an index on the
      // ACTIVE PLAYER's timeline (`active.years`, already fetched above for
      // the active player's own placement check) — not per-stealer own
      // timelines anymore. Everyone contests the same board.
      const { data: activePlayerRow } = await supabase
        .from('players')
        .select('seat_order')
        .eq('id', round.active_player_id)
        .single();
      const activeSeatOrder = activePlayerRow?.seat_order ?? 0;

      const result = evaluateSteals(steals, card, active.years, activeSeatOrder);
      stealWinnerId = result.winnerPlayerId;
      evaluatedSteals = result.entries;
    }
  }

  // Step 7 (11.4.1): bemondás (name guess) evaluation — server-only,
  // anti-leak (11.9 #1). AC21.7: the per-field correct-flags and the token
  // reward are only ever written/credited HERE, in the reveal transaction —
  // never at place_card time, or the token balance would leak the answer
  // early. REDESIGN (2026-07-06): title/artist/year now score
  // INDEPENDENTLY (replaces the old F2-D1 all-or-nothing rule) — up to 3
  // tokens per round instead of 1.
  const nameGuess: NameGuess | null = (round.name_guess ?? null) as NameGuess | null;
  const guessEval = nameGuess ? evaluateGuess(nameGuess, card) : null;

  const revealedCard = {
    title: card.title,
    artist: card.artist,
    year: card.year,
    artworkUrl: card.artwork_url,
    // 11.5: publicly visible reveal-time result, gated by round_public's
    // phase-based projection — safe to include here unconditionally. Also
    // exposes the RAW guessed text/year (not just correctness) so the host
    // can review borderline calls — safe because the true answer is already
    // revealed alongside it here, nothing early leaks.
    guess:
      nameGuess && guessEval
        ? {
            byPlayerId: round.active_player_id,
            titleGuess: nameGuess.titleGuess,
            artistGuess: nameGuess.artistGuess,
            yearGuess: nameGuess.yearGuess ?? null,
            titleCorrect: guessEval.titleCorrect,
            artistCorrect: guessEval.artistCorrect,
            yearCorrect: guessEval.yearCorrect,
          }
        : null,
    steals: evaluatedSteals.map((s) => ({ playerId: s.playerId, correct: !!s.correct, won: !!s.won })),
  };

  const updatedNameGuess = nameGuess
    ? {
        ...nameGuess,
        titleCorrect: guessEval!.titleCorrect,
        artistCorrect: guessEval!.artistCorrect,
        yearCorrect: guessEval!.yearCorrect,
      }
    : null;

  // Step 9 (11.4.1): the single reveal UPDATE — phase + outcome +
  // revealed_card + steals + name_guess together, optimistic-locked on
  // phase. Whichever caller's UPDATE lands first (host vs. cron) is the only
  // one that proceeds to the token/timeline side-effects below.
  const { data: updatedRound, error: updateError } = await supabase
    .from('rounds')
    .update({
      phase: 'reveal',
      outcome,
      revealed_card: revealedCard,
      steals: evaluatedSteals,
      name_guess: updatedNameGuess,
    })
    .eq('id', roundId)
    .in('phase', ['playing', 'placing', 'stealing'])
    .select()
    .maybeSingle();

  if (updateError) return { ok: false, error: 'db_error' };
  if (!updatedRound) return { ok: false, conflict: true, error: 'phase_conflict' };

  // Step 10 (11.4.1): AFTER the lock is claimed — token and timeline
  // mutations. Never before the UPDATE above, or a losing racer could
  // double-apply these.

  // 10a — bemondás reward (AC20.3/AC21.7, REDESIGN 2026-07-06): +1 token PER
  // correct field (title/artist/year), up to 3 total — replaces the old
  // all-or-nothing +1.
  if (guessEval) {
    const guessTokens =
      (guessEval.titleCorrect ? 1 : 0) + (guessEval.artistCorrect ? 1 : 0) + (guessEval.yearCorrect ? 1 : 0);
    if (guessTokens > 0) {
      await supabase.rpc('adjust_tokens', { p_player_id: round.active_player_id, p_delta: guessTokens });
    }
  }

  // 10b — card placement into a timeline.
  if (outcome === 'correct' && round.placement !== null) {
    // S12: active player's own correct placement.
    await insertIntoTimeline(supabase, round.active_player_id, card.id, round.placement, active.rows);
  } else if (outcome === 'wrong' && stealWinnerId) {
    // AC22.7, REDESIGN 2026-07-03: the winning stealer's `position` was an
    // index on the ACTIVE PLAYER's timeline (what they were contesting),
    // NOT a valid index on the winner's own board — their timeline has a
    // different set of cards/years, so that index would be meaningless (or
    // outright wrong) there. Compute the winner's OWN correct insertion
    // index fresh, from the card's actual revealed year.
    const winnerTimeline = await fetchTimelineYears(supabase, stealWinnerId);
    const winnerPosition = findInsertionIndex(card.year, winnerTimeline.years);
    await insertIntoTimeline(supabase, stealWinnerId, card.id, winnerPosition, winnerTimeline.rows);
  }
  // else: wrong/timeout with no steal winner — card is simply discarded (F1
  // behavior preserved). 10c (steal token forfeiture) needs no action here —
  // register_steal already deducted the token at registration time (F2-D5:
  // no refunds for correct-but-non-winning or incorrect steals).

  return { ok: true, phase: 'reveal', outcome, revealedCard };
}

// S12/S13: a placement at index `pos` is correct if the card's year fits
// between its neighbors on the (pre-insertion) timeline. Equal-year
// neighbors count as correct on both sides (S13 tie-smoothing).
// Exported in F2.1 so _shared/steal.ts's evaluateSteals() can reuse the
// exact same correctness rule for steal-position evaluation instead of
// duplicating it (per the Architect's explicit warning that this was not
// exported in F1 and would be needed here — ARCHITECTURE.md 11.2).
export function evaluatePlacement(pos: number, year: number, timelineYears: number[]): boolean {
  const left = pos > 0 ? timelineYears[pos - 1] : null;
  const right = pos < timelineYears.length ? timelineYears[pos] : null;

  if (left !== null && year < left) return false;
  if (right !== null && year > right) return false;
  return true;
}

// REDESIGN 2026-07-03: finds the single correct insertion index for `year`
// on a (sorted, ascending) timeline — used when a steal-winner's card must
// be placed on THEIR OWN board, where the position they contested (an index
// on the ACTIVE PLAYER's board) has no direct meaning. Picks the leftmost
// valid gap (before the first strictly-greater year), matching the same
// tie-smoothing spirit as evaluatePlacement (equal years are never a
// mismatch on either side).
export function findInsertionIndex(year: number, sortedTimelineYears: number[]): number {
  for (let i = 0; i < sortedTimelineYears.length; i++) {
    if (sortedTimelineYears[i] > year) return i;
  }
  return sortedTimelineYears.length;
}

// Turn order: next seat_order after the given player's, wrapping around.
export async function getNextPlayerId(supabase: SupabaseClient, roomId: string, currentPlayerId: string): Promise<string | null> {
  const { data: players } = await supabase
    .from('players')
    .select('id, seat_order')
    .eq('room_id', roomId)
    .is('kicked_at', null)
    .order('seat_order', { ascending: true });

  if (!players || players.length === 0) return null;
  const idx = players.findIndex((p: { id: string }) => p.id === currentPlayerId);
  if (idx === -1) return players[0].id;
  return players[(idx + 1) % players.length].id;
}
