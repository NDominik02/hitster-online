"use client";

import { useEffect, useRef, useState } from "react";
import { spotifyRefreshToken } from "../supabase/functions";

/**
 * S20 (F3, Web Playback SDK) — a Spotify SDK csak asztali böngészőkben
 * támogatott megbízhatóan (mobil Safari/Chrome-on rendszerint
 * `initialization_error`-ral vagy `account_error`-ral fut le); ott a host a
 * Connect API-s eszközválasztóra (spotify_list_devices/spotify_playback_command
 * a SAJÁT telefonján futó natív Spotify-appra) esik vissza. Ez a hook csak az
 * SDK-ágat kezeli — a device_id-t adja vissza, amint a böngészőben létrejött
 * egy lejátszható "Hitster Online" nevű Spotify Connect-eszköz.
 */

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayerInstance;
    };
  }
}

interface SpotifyPlayerInstance {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (payload: unknown) => void): void;
}

const SDK_SCRIPT_SRC = "https://sdk.scdn.co/spotify-player.js";

let sdkLoadPromise: Promise<void> | null = null;

function loadSdkScript(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = SDK_SCRIPT_SRC;
    script.async = true;
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

export type SpotifySdkStatus = "idle" | "connecting" | "ready" | "unavailable";

/**
 * `enabled=false`-nál semmit nem tölt be — csak 'premium' módú szobában
 * kapcsoljuk be, hogy 'preview' módban egyáltalán ne fusson le a betöltés.
 */
export function useSpotifyWebPlaybackSdk(enabled: boolean): {
  status: SpotifySdkStatus;
  deviceId: string | null;
} {
  const [status, setStatus] = useState<SpotifySdkStatus>("idle");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const playerRef = useRef<SpotifyPlayerInstance | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setStatus("connecting");
      await loadSdkScript();
      if (cancelled || !window.Spotify) return;

      const player = new window.Spotify.Player({
        name: "Hitster Online",
        getOAuthToken: (cb) => {
          spotifyRefreshToken()
            .then((res) => cb(res.accessToken))
            .catch(() => {
              // Néma hiba — ha a token-frissítés elbukik, az SDK saját maga
              // authentication_error eseményt fog kiadni, amit lentebb kezelünk.
            });
        },
        volume: 1,
      });

      player.addListener("ready", (payload) => {
        if (cancelled) return;
        const { device_id } = payload as { device_id: string };
        setDeviceId(device_id);
        setStatus("ready");
      });
      player.addListener("not_ready", () => {
        if (cancelled) return;
        setDeviceId(null);
      });
      player.addListener("initialization_error", () => {
        if (!cancelled) setStatus("unavailable");
      });
      player.addListener("authentication_error", () => {
        if (!cancelled) setStatus("unavailable");
      });
      player.addListener("account_error", () => {
        // Nem Premium fiók — a Connect API-s fallback-re esünk vissza.
        if (!cancelled) setStatus("unavailable");
      });

      player.connect();
      playerRef.current = player;
    })();

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [enabled]);

  return { status, deviceId };
}
