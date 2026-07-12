import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface PlayerGameStats {
  playerId: string;
  correctPlacements: number;
  wrongPlacements: number;
  timeouts: number;
  successfulSteals: number;
  correctGuesses: number;
}

export async function computeGameStats(supabase: SupabaseClient, roomId: string): Promise<PlayerGameStats[]> {
  const { data: rounds } = await supabase
    .from('rounds')
    .select('active_player_id, outcome, steals, name_guess')
    .eq('room_id', roomId);

  const byPlayer = new Map<string, PlayerGameStats>();
  const ensure = (playerId: string): PlayerGameStats => {
    let stats = byPlayer.get(playerId);
    if (!stats) {
      stats = { playerId, correctPlacements: 0, wrongPlacements: 0, timeouts: 0, successfulSteals: 0, correctGuesses: 0 };
      byPlayer.set(playerId, stats);
    }
    return stats;
  };

  for (const round of rounds ?? []) {
    const active = ensure(round.active_player_id);
    if (round.outcome === 'correct') active.correctPlacements++;
    else if (round.outcome === 'wrong') active.wrongPlacements++;
    else if (round.outcome === 'timeout') active.timeouts++;

    const nameGuess = round.name_guess as {
      titleCorrect?: boolean | null;
      artistCorrect?: boolean | null;
      yearCorrect?: boolean | null;
    } | null;
    if (nameGuess) {
      if (nameGuess.titleCorrect) active.correctGuesses++;
      if (nameGuess.artistCorrect) active.correctGuesses++;
      if (nameGuess.yearCorrect) active.correctGuesses++;
    }

    const steals = (round.steals ?? []) as Array<{ playerId: string; won: boolean | null }>;
    for (const steal of steals) {
      if (steal.won) ensure(steal.playerId).successfulSteals++;
    }
  }

  return Array.from(byPlayer.values());
}
