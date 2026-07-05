// dispute_round — ÚJRATERVEZVE 2026-07-04 (tulaj visszajelzése alapján, ld. F2-D12).
//
// RÉGI VISELKEDÉS (F2-D8, mostantól elavult): a vitagomb megnyomása a KÖRT TELJES EGÉSZÉBEN
// érvénytelenítette (kártya eldobva, mindenki token-visszatérítést kapott, senki nem kapta meg
// a kártyát), és a szerver AZONNAL, csendben tovább is léptetett a következő játékosra —
// SAJÁT, belső drawCard()-hívással, ami viszont SOSEM jutott vissza a hívó (host) kliens
// `round`/`audioUrl` state-jébe, és SOSEM broadcastolt `turn_advanced`/`round_started`-et.
// Élesben ez pontosan azt okozta, amit a tulaj jelentett: "a host tovább ugrott a kövi körre,
// de a 2 játékos ott maradt" (a player kliensek sosem kaptak semmilyen eventet a vitáról, mert
// a play oldal `onEvent`-je nem is ismerte a `round_disputed` esemény), ÉS a rákövetkező kör
// zenéje sosem szólalt meg (a host `beginRound()`/`setAudioUrl()` sosem futott le rá, hiszen a
// host kliens észre sem vette, hogy egy ÚJ kör jött létre a háttérben).
//
// ÚJ VISELKEDÉS (F2-D12): a vitagomb NEM nukolja a kört, és NEM lép tovább automatikusan.
// A host beírja a szám TÉNYLEGES évét (pl. "Spotify-on 1992 van feltüntetve, de a szám
// eredetileg 1967-es felvétel"), és a szerver ÚJRAÉRTÉKELI ugyanazt a kört ez ellen a
// korrigált évszám ellen — pontosan ugyanazzal a logikával, mint amit resolveRound a tárolt
// (esetleg téves) `deck_cards.year`-rel tenne. A kártya a helyesen döntő félhez kerül (a soron
// lévőhöz, ha az ő lerakása helyes a korrigált év szerint, vagy egy lopás nyerteséhez, ha az övé
// a helyes — ugyanaz a "SORON LÉVŐ idővonalán versenyeznek" szabály, mint a normál resolve-nál,
// F2-D11), a `revealed_card.year` frissül a korrigált értékre, és a kör MARAD 'reveal' fázisban
// — a host utána a megszokott "Következő kör" gombbal lép tovább, ami a MEGLÉVŐ, jól működő
// turn_advanced/round_started broadcast + beginRound()/audioUrl utat használja. Ez strukturálisan
// kizárja a fenti hibaosztályt: nincs többé "csendben létrejött, sosem broadcastolt új kör".
//
// A bemondás (name-guess) cím/előadó helyessége NEM változik — az egyezés a korrigált évtől
// FÜGGETLEN. A REDESIGN (2026-07-06, évszám-tippelés) miatt viszont az évszám-tipp
// helyessége IGENIS a kártya évétől függ — ezért ezt itt újraértékeljük a korrigált év
// ellen, és a token-egyenleget ennek megfelelően módosítjuk (±1, ha az évtipp helyessége
// megváltozik a korrekció hatására).
//
// Ismételten hívható ugyanarra a körre (pl. a host elgépelte az évet): mindig a JELENLEGI
// timeline-elhelyezést bontja vissza `card_id` alapján, mielőtt újra alkalmazná — idempotens
// a hívások sorrendjétől függetlenül.

import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';
import type { StealEntry, NameGuess } from '../_shared/steal.ts';
import { evaluateSteals } from '../_shared/steal.ts';
import {
  evaluatePlacement,
  findInsertionIndex,
  fetchTimelineYears,
  insertIntoTimeline,
  removeFromTimelineByCardId,
} from '../_shared/round.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  let body: { roundId?: string; correctedYear?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Érvénytelen kérés.', 400);
  }
  if (!body.roundId) return errorResponse('invalid_round', 'Hiányzó kör azonosító.', 400);
  if (typeof body.correctedYear !== 'number' || !Number.isFinite(body.correctedYear)) {
    return errorResponse('invalid_year', 'Add meg a szám tényleges évét egy számmal.', 400);
  }
  const correctedYear = Math.trunc(body.correctedYear);

  const supabase = adminClient();

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, room_id, phase, outcome, placement, active_player_id, card_id, steals, name_guess, revealed_card')
    .eq('id', body.roundId)
    .single();

  if (roundError || !round) return errorResponse('round_not_found', 'A kör nem található.', 404);

  const { data: room } = await supabase.from('rooms').select('id, host_uid').eq('id', round.room_id).single();
  if (!room || room.host_uid !== callerUid) {
    return errorResponse('not_host', 'Csak a host javíthatja ki az évszámot.', 403);
  }

  if (round.phase !== 'reveal') {
    return errorResponse('not_disputable', 'Csak a felfedés fázisban lévő kör évszáma javítható.', 409);
  }

  // Egy lejárt idejű (senki nem rakott le semmit) körnél nincs mit újraértékelni — a placement
  // maga hiányzik, tehát nincs "kié legyen a kártya" döntés, amit egy korrigált év eldönthetne.
  if (round.placement === null) {
    return errorResponse(
      'no_placement',
      'Ebben a körben senki nem rakott le kártyát (lejárt az idő) — nincs mit újraértékelni.',
      409
    );
  }

  // 1. Bontsuk vissza a JELENLEGI elhelyezést (akárhova is került — a soron lévőhöz vagy egy
  // lopás nyerteséhez), hogy a lenti újraértékelés a friss, elhelyezés ELŐTTI idővonalak ellen
  // fusson — pontosan úgy, ahogy resolveRound is tenné egy első lezáráskor.
  await removeFromTimelineByCardId(supabase, round.card_id);

  const active = await fetchTimelineYears(supabase, round.active_player_id);
  const placementCorrect = evaluatePlacement(round.placement, correctedYear, active.years);
  const outcome: 'correct' | 'wrong' = placementCorrect ? 'correct' : 'wrong';

  const steals: StealEntry[] = (round.steals ?? []) as StealEntry[];
  let stealWinnerId: string | null = null;
  let evaluatedSteals: StealEntry[] = steals;

  if (steals.length > 0) {
    if (placementCorrect) {
      evaluatedSteals = steals.map((s) => ({ ...s, correct: false, won: false }));
    } else {
      const { data: activePlayerRow } = await supabase
        .from('players')
        .select('seat_order')
        .eq('id', round.active_player_id)
        .single();
      const activeSeatOrder = activePlayerRow?.seat_order ?? 0;

      // evaluateSteals csak a .year mezőt olvassa a card paraméterből — a title/artist itt
      // irreleváns, csak a típus miatt kell kitölteni.
      const result = evaluateSteals(steals, { title: '', artist: '', year: correctedYear }, active.years, activeSeatOrder);
      stealWinnerId = result.winnerPlayerId;
      evaluatedSteals = result.entries;
    }
  }

  // 2. Alkalmazzuk az ÚJ eredményt: a kártya a ténylegesen helyesen döntő félhez kerül.
  if (outcome === 'correct') {
    await insertIntoTimeline(supabase, round.active_player_id, round.card_id, round.placement, active.rows);
  } else if (stealWinnerId) {
    const winnerTimeline = await fetchTimelineYears(supabase, stealWinnerId);
    const winnerPosition = findInsertionIndex(correctedYear, winnerTimeline.years);
    await insertIntoTimeline(supabase, stealWinnerId, round.card_id, winnerPosition, winnerTimeline.rows);
  }
  // else: sem a soron lévő, sem egyik lopó sem talált a korrigált év szerint — senki nem kapja
  // a kártyát, pontosan úgy, mint egy normál "wrong, nincs nyertes lopás" kimenetnél.

  // 3. Az évszám-tipp (yearGuess) helyessége a korrigált évtől FÜGG — ezt itt újraértékeljük.
  // A cím/előadó-tipp (titleCorrect/artistCorrect) érintetlen marad, hiszen azok sosem az évtől
  // függtek. Ha a korrekció hatására az évtipp helyessége megváltozik (null/false → true, vagy
  // true → false), a soron lévő játékos token-egyenlegét ennek megfelelően ±1-gyel módosítjuk.
  const nameGuess: NameGuess | null = (round.name_guess ?? null) as NameGuess | null;
  let updatedNameGuess: NameGuess | null = nameGuess;
  let tokenDelta = 0;

  if (nameGuess) {
    const yearAttempted = !!nameGuess.yearGuess?.trim();
    const newYearCorrect = yearAttempted
      ? Number.parseInt(nameGuess.yearGuess as string, 10) === correctedYear
      : null;
    const previousYearCorrect = nameGuess.yearCorrect === true;
    const nextYearCorrect = newYearCorrect === true;
    if (previousYearCorrect !== nextYearCorrect) {
      tokenDelta = nextYearCorrect ? 1 : -1;
    }
    updatedNameGuess = { ...nameGuess, yearCorrect: newYearCorrect };
  }

  // 4. A revealed_card.year-t a korrigált értékre frissítjük (ezt látja mindenki ezután), és a
  // guess.yearCorrect mezőt is szinkronban tartjuk vele — a titleCorrect/artistCorrect változatlan.
  const oldRevealedCard = (round.revealed_card ?? {}) as Record<string, unknown>;
  const oldGuess = (oldRevealedCard.guess ?? null) as Record<string, unknown> | null;
  const updatedRevealedCard = {
    ...oldRevealedCard,
    year: correctedYear,
    guess: oldGuess ? { ...oldGuess, yearCorrect: updatedNameGuess?.yearCorrect ?? null } : null,
    steals: evaluatedSteals.map((s) => ({ playerId: s.playerId, correct: !!s.correct, won: !!s.won })),
  };

  const { data: updated, error: updateError } = await supabase
    .from('rounds')
    .update({
      outcome,
      steals: evaluatedSteals,
      revealed_card: updatedRevealedCard,
      name_guess: updatedNameGuess,
    })
    .eq('id', body.roundId)
    .eq('phase', 'reveal')
    .select('id')
    .maybeSingle();

  if (updateError) return errorResponse('db_error', 'Nem sikerült az évszám javítása.', 500);
  if (!updated) return errorResponse('already_advanced', 'A kör már továbblépett, nem javítható.', 409);

  // Best-effort token-korrekció — a fő (kör-szintű) javítás már sikeresen lezajlott, tehát ha ez
  // hibázna, nem görgetjük vissza a fentieket, csak jelezzük a válaszban (tokensChanged: false-t
  // nem küldünk külön, a hívó a revealedCard.guess.yearCorrect-ből úgyis látja az új állapotot).
  if (tokenDelta !== 0 && nameGuess) {
    await supabase.rpc('adjust_tokens', { p_player_id: round.active_player_id, p_delta: tokenDelta });
  }

  // Playtest feedback (2026-07-06): a korrekció korábban csak ERRE a körre vonatkozott — a
  // deck_cards.year (a forrás, amiből minden JÖVŐBELI kör/parti a kártyát húzza) változatlan
  // maradt, tehát ugyanaz a pakli újrajátszva megint ugyanazt a hibás évet mutatta volna. Most
  // a host által megerősített évet visszaírjuk a kártyára is — 'host_corrected' forrással (a
  // legmagasabb bizalmi szint, nem bizonytalan), hogy a jövőben ne forduljon elő újra. Best-effort:
  // ha ez a mellékhatás hibázna, a fő (kör-szintű) javítás már úgyis sikeresen lezajlott.
  await supabase
    .from('deck_cards')
    .update({ year: correctedYear, year_source: 'host_corrected', year_uncertain: false })
    .eq('id', round.card_id);

  return jsonResponse({ ok: true, outcome, revealedCard: updatedRevealedCard });
});
