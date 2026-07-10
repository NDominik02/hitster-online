export interface DeckOwner {
  owner_id: string | null;
  spotify_owner_id: string | null;
}

// deno-lint-ignore no-explicit-any
export async function callerCanManageDeck(supabase: any, callerUid: string, deck: DeckOwner): Promise<boolean> {
  if (!deck.spotify_owner_id) return deck.owner_id === callerUid;

  const { data: connection, error } = await supabase
    .from('spotify_connections')
    .select('id')
    .eq('host_uid', callerUid)
    .eq('spotify_user_id', deck.spotify_owner_id)
    .maybeSingle();

  return !error && Boolean(connection);
}
