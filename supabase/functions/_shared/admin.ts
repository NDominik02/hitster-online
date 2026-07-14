export interface AdminContext {
  isAdmin: boolean;
  role: 'curator' | 'admin' | null;
  spotifyUserId: string | null;
  displayName: string | null;
}

// deno-lint-ignore no-explicit-any
export async function getAdminContext(supabase: any, callerUid: string): Promise<AdminContext> {
  const { data: connection } = await supabase
    .from('spotify_connections')
    .select('spotify_user_id, display_name')
    .eq('host_uid', callerUid)
    .maybeSingle();

  const spotifyUserId = connection?.spotify_user_id ?? null;
  if (!spotifyUserId) {
    return { isAdmin: false, role: null, spotifyUserId: null, displayName: null };
  }

  const { data: adminRow, error } = await supabase
    .from('admin_users')
    .select('role, display_name')
    .eq('spotify_user_id', spotifyUserId)
    .is('disabled_at', null)
    .maybeSingle();

  if (error || !adminRow) {
    return {
      isAdmin: false,
      role: null,
      spotifyUserId,
      displayName: connection?.display_name ?? null,
    };
  }

  return {
    isAdmin: true,
    role: adminRow.role === 'admin' ? 'admin' : 'curator',
    spotifyUserId,
    displayName: adminRow.display_name ?? connection?.display_name ?? null,
  };
}

// deno-lint-ignore no-explicit-any
export async function callerIsAdmin(supabase: any, callerUid: string): Promise<boolean> {
  return (await getAdminContext(supabase, callerUid)).isAdmin;
}
