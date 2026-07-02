// Shared Supabase client helpers for Edge Functions.
// - adminClient: service-role client, bypasses RLS — this is the ONLY client
//   allowed to mutate game-state tables (CLAUDE.md: "the server is the source
//   of truth; the client never writes game tables directly").
// - getCallerFromRequest: verifies the caller's JWT and returns their auth.uid(),
//   using an anon-key client scoped to the caller's Authorization header so
//   RLS applies (used only for identity extraction, not for game-state writes).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getCallerUid(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const jwt = authHeader.replace('Bearer ', '');
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user.id;
}
