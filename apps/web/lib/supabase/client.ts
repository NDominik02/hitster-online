/**
 * Supabase browser kliens — Anonymous Auth, localStorage-perzisztencia (ARCHITECTURE 7.1).
 *
 * TODO(BACKEND-INTEGRÁCIÓ): a NEXT_PUBLIC_SUPABASE_URL és NEXT_PUBLIC_SUPABASE_ANON_KEY
 * env változókat a Backend agent adja meg (docs/BACKEND-NOTES.md, projekt URL + publishable key,
 * lásd get_project_url / get_publishable_keys). Amíg nincsenek beállítva, `isSupabaseConfigured()`
 * false-t ad vissza, és a UI a lib/mock-data.ts demo állapotára esik vissza — lásd
 * app/host/[roomCode]/page.tsx és app/play/[roomCode]/page.tsx.
 *
 * Bekötés menete, ha megvan a BACKEND-NOTES.md:
 *   1. apps/web/.env.local:
 *        NEXT_PUBLIC_SUPABASE_URL=<project url>
 *        NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable/anon key>
 *   2. semmi mást nem kell módosítani ebben a fájlban — a getSupabaseClient() automatikusan él.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let cachedClient: SupabaseClient | null = null;

/**
 * Lusta inicializálású singleton kliens. Csak akkor hozza létre, ha az env változók
 * be vannak állítva — így a build/dev nem bukik el mock-only fejlesztés közben.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cachedClient) return cachedClient;

  cachedClient = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: {
      persistSession: true, // localStorage — ez a reconnect alapja (ARCHITECTURE 7.1)
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}

/**
 * Belépteti a klienst Anonymous Auth-tal, ha még nincs session (ARCHITECTURE 7.1-7.2).
 * TODO(BACKEND-INTEGRÁCIÓ): élesben ellenőrizni kell, hogy az Anonymous Auth
 * engedélyezve van-e a Supabase projekt Auth beállításaiban.
 */
export async function ensureAnonymousSession() {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session) return sessionData.session;

  const { data, error } = await client.auth.signInAnonymously();
  if (error) {
    console.error("[supabase] anonymous sign-in failed", error);
    return null;
  }
  return data.session;
}
