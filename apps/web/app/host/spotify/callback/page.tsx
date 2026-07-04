"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { ConnectionOverlay } from "@/components/system/ConnectionOverlay";
import { ensureAnonymousSession } from "@/lib/supabase/client";
import { spotifyOauthCallback } from "@/lib/supabase/functions";
import { consumeStoredCodeVerifier } from "@/lib/spotify/pkce";

/**
 * S30 (Spotify Premium) — a Spotify OAuth redirect ide tér vissza `?code=...`-dal.
 * Elvégzi a token-cserét (spotify_oauth_callback), majd visszairányít a /host
 * szoba-létrehozó oldalra. A code_verifier sessionStorage-ból jön (lib/spotify/pkce) —
 * ha hiányzik (pl. az oldal új tabban nyílt meg), a folyamat nem folytatható.
 */
export default function SpotifyCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const code = searchParams.get("code");
      const spotifyError = searchParams.get("error");

      if (spotifyError) {
        if (!cancelled) setError("A Spotify elutasította a csatlakozást (vagy megszakítottad).");
        return;
      }
      if (!code) {
        if (!cancelled) setError("Hiányzó Spotify-válasz.");
        return;
      }

      const codeVerifier = consumeStoredCodeVerifier();
      if (!codeVerifier) {
        if (!cancelled) setError("A csatlakozás megszakadt (a böngésző-munkamenet elveszett) — próbáld újra.");
        return;
      }

      const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
      if (!redirectUri) {
        if (!cancelled) setError("A Spotify-integráció nincs konfigurálva ezen a környezeten.");
        return;
      }

      try {
        await ensureAnonymousSession();
        await spotifyOauthCallback(code, codeVerifier, redirectUri);
        if (!cancelled) router.replace("/host");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nem sikerült a Spotify-csatlakozás.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <p role="alert" className="text-danger">
          {error}
        </p>
        <AppButton onClick={() => router.replace("/host")}>Vissza</AppButton>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <ConnectionOverlay mode="reconnecting" />
    </div>
  );
}
