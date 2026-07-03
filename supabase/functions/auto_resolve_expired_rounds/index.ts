// auto_resolve_expired_rounds — server-side safety net (DECISIONS.md A2,
// upgraded per tulaj approval 2026-07-02: "host-vezérelt, de szerver-ellenőrzött
// timer F1-ben; pg_cron-alapú szerver-oldali timer F2, ha a host-vezérelt
// megoldás megbízhatatlannak bizonyul" — bizonyult: egy éles körben a host
// tab háttérbe került, a kör 80+ mp-ig beragadt "stealing" fázisban).
//
// Called by a pg_cron job (every ~20s, see migration 005_pg_cron_safety_net)
// via pg_net http_post, authenticated with the service role key stored in
// Supabase Vault (never in migration SQL or client code).
//
// This function does NOT reimplement the reveal/outcome logic — it finds
// every round stuck past its deadline and calls the SAME resolveRound()
// helper that resolve_round/index.ts uses (_shared/round.ts), so the
// automatic path and the host-triggered path can never produce different
// results for the same round (this was the explicit requirement from the
// coordinator).
//
// Race safety: resolveRound()'s final UPDATE has `.in('phase', [...])` as an
// optimistic lock. If the host happens to call resolve_round for a round at
// the exact same moment this job processes it, only one of the two UPDATEs
// affects a row — the other gets `conflict: true` back and is simply skipped
// here (not an error, just "someone else already resolved it").
//
// Client notification: after a successful auto-resolve, this function sends
// a Realtime broadcast `round_revealed` on the room's `room:{roomId}` channel
// — mirroring what the host client normally does after calling resolve_round
// itself (ARCHITECTURE.md 4.1). Without this, a round closed automatically
// while the host tab was backgrounded would have no broadcast at all (the
// player-side round_public polling fallback would still pick it up via
// direct DB reads, but the host has no equivalent fallback yet — see
// docs/BACKEND-NOTES.md for the frontend follow-up).
//
// F2 (ARCHITECTURE.md 11.8): when the resolved round was in 'stealing' phase
// (i.e. this cron run is the one that actually closed the 15s steal window,
// rather than a leftover 'playing'/'placing' timeout), an additional
// `steal_window_closed` broadcast is sent first — this is the event the
// steal-window countdown UI is documented to listen for, distinct from the
// more general `round_revealed`.

import { adminClient } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { resolveRound } from '../_shared/round.ts';

// This function is invoked internally by pg_cron/pg_net, not by browser
// clients — but we still verify a shared secret header so it can't be
// triggered by an arbitrary POST from the internet even if someone finds
// the URL. The secret is the service role key itself (pg_net sends it as
// the Authorization bearer token, matching how every other internal/service
// call in this project is authenticated — see migration 005).
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return errorResponse('unauthorized', undefined, 401);
  }

  const supabase = adminClient();

  // F2 (ARCHITECTURE.md 11.7): a round in 'stealing' phase is gated by
  // steal_deadline (the 15s window, AC22.1), not placing_deadline (whose
  // deadline already passed — that's WHY the round is in 'stealing' phase).
  // Querying placing_deadline for 'stealing' rounds would either never match
  // (if placing_deadline is now in the past for unrelated reasons) or match
  // immediately without waiting for the actual steal window — both wrong.
  // Two branches, OR'd together, mirroring resolveRound's own phase-dependent
  // deadline choice so the query and the evaluation logic never disagree
  // about which round is "expired".
  const nowIso = new Date().toISOString();

  const { data: expiredPlacing, error: placingError } = await supabase
    .from('rounds')
    .select('id, room_id')
    .in('phase', ['playing', 'placing'])
    .lt('placing_deadline', nowIso)
    .not('placing_deadline', 'is', null);

  const { data: expiredStealing, error: stealingError } = await supabase
    .from('rounds')
    .select('id, room_id')
    .eq('phase', 'stealing')
    .lt('steal_deadline', nowIso)
    .not('steal_deadline', 'is', null);

  if (placingError || stealingError) {
    return errorResponse('db_error', 'Nem sikerült a lejárt körök lekérdezése.', 500);
  }

  const stealingRoundIds = new Set((expiredStealing ?? []).map((r: { id: string }) => r.id));
  const expiredRounds = [...(expiredPlacing ?? []), ...(expiredStealing ?? [])];

  const results: Array<{ roundId: string; roomId: string; ok: boolean; skipped?: boolean; error?: string }> = [];

  for (const round of expiredRounds ?? []) {
    // Cron path: the deadline is guaranteed already-passed by the WHERE
    // clause above, so requireDeadlinePassed is redundant here but passed
    // for defense-in-depth / symmetry with the host path.
    const result = await resolveRound(supabase, round.id, { requireDeadlinePassed: true });

    if (!result.ok) {
      // conflict === someone (the host) resolved it first — expected under
      // the race described above, not a failure of this job.
      results.push({ roundId: round.id, roomId: round.room_id, ok: false, skipped: result.conflict, error: result.error });
      continue;
    }

    // Notify clients — mirrors the broadcast the host client normally sends
    // after a successful resolve_round call (ARCHITECTURE.md 4.1).
    try {
      const channel = supabase.channel(`room:${round.room_id}`);
      if (stealingRoundIds.has(round.id)) {
        // 11.8: this cron run is the one that closed the 15s steal window.
        await channel.send({
          type: 'broadcast',
          event: 'steal_window_closed',
          payload: { roundId: round.id },
        });
      }
      await channel.send({
        type: 'broadcast',
        event: 'round_revealed',
        payload: { roundId: round.id, auto: true },
      });
      await supabase.removeChannel(channel);
    } catch {
      // Broadcast failure must not fail the resolve — the DB state is
      // already correct and authoritative; polling fallbacks (round_public)
      // still converge clients to the right state without the broadcast.
    }

    results.push({ roundId: round.id, roomId: round.room_id, ok: true });
  }

  return jsonResponse({ checked: expiredRounds?.length ?? 0, results });
});
