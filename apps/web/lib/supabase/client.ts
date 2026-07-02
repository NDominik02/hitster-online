/**
 * Supabase browser kliens — Anonymous Auth, localStorage-perzisztencia (ARCHITECTURE 7.1,
 * docs/BACKEND-NOTES.md 1. és 6. szakasz).
 *
 * A projekt URL + anon key az apps/web/.env.local-ból jön (Supabase projekt: hitster-online,
 * eu-central-1, project id cynedrshuqneztnymbxu). A `.env.local` .gitignore-olt, nem kerül git-be.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../packages/shared-types/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let cachedClient: SupabaseClient<Database> | null = null;

/** Lusta inicializálású singleton kliens (Database típussal, docs/BACKEND-NOTES.md 6.). */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase kliens nincs konfigurálva — hiányzik a NEXT_PUBLIC_SUPABASE_URL/ANON_KEY " +
        "az apps/web/.env.local-ból (docs/BACKEND-NOTES.md 1. szakasz)."
    );
  }
  if (cachedClient) return cachedClient;

  cachedClient = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
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
 * Minden Edge Function verify_jwt: true (BACKEND-NOTES 3.) — ezt a hívások előtt kell futtatni.
 */
export async function ensureAnonymousSession() {
  const client = getSupabaseClient();

  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session) return sessionData.session;

  const { data, error } = await client.auth.signInAnonymously();
  if (error) {
    console.error("[supabase] anonymous sign-in failed", error);
    throw error;
  }
  return data.session;
}
