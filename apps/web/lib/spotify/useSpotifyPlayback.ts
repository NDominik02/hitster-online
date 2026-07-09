"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSpotifyWebPlaybackSdk } from "./webPlaybackSdk";
import { spotifyListDevices, spotifyPlaybackCommand } from "../supabase/functions";

export interface SpotifyConnectDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

/**
 * S20 (F3) — egyesíti a két lejátszási utat 'premium' módban:
 * 1. Web Playback SDK (asztali böngésző) — automatikus, a host nem csinál semmit.
 * 2. Spotify Connect API (mobil, vagy ha az SDK init hibázik) — a hostnak
 *    kézzel ki kell választania a SAJÁT telefonján futó Spotify-appot mint
 *    lejátszási célt (`needsDevicePicker`/`connectDevices`/`selectDevice`).
 *
 * A hívó oldal (host page) csak a `play(spotifyUri)`/`pause()` API-t
 * használja, és a visszaadott `success` alapján dönt: sikertelenség esetén
 * NÉMÁN visszaesik a preview `<audio>` útra — az Architect terv explicit
 * követelménye, hogy semmilyen Spotify-hiba ne törje meg a játékot.
 */
export function useSpotifyPlayback(enabled: boolean) {
  const { status: sdkStatus, deviceId: sdkDeviceId } = useSpotifyWebPlaybackSdk(enabled);
  const [connectDevices, setConnectDevices] = useState<SpotifyConnectDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selectedConnectDeviceId, setSelectedConnectDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || sdkStatus !== "unavailable") return;
    let cancelled = false;

    (async () => {
      setLoadingDevices(true);
      try {
        const res = await spotifyListDevices();
        if (!cancelled) setConnectDevices(res.devices);
      } catch {
        if (!cancelled) setConnectDevices([]);
      } finally {
        if (!cancelled) setLoadingDevices(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, sdkStatus]);

  const activeDeviceId = sdkDeviceId ?? selectedConnectDeviceId;

  const play = useCallback(async (spotifyUri: string): Promise<boolean> => {
    if (!activeDeviceId) return false;
    try {
      await spotifyPlaybackCommand("play", activeDeviceId, spotifyUri);
      return true;
    } catch {
      return false;
    }
  }, [activeDeviceId]);

  const pause = useCallback(async (): Promise<boolean> => {
    if (!activeDeviceId) return false;
    try {
      await spotifyPlaybackCommand("pause", activeDeviceId);
      return true;
    } catch {
      return false;
    }
  }, [activeDeviceId]);

  /** Playtest feedback (2026-07-06) — a host manuálisan folytathatja a
   *  lejátszást a megállított pozíciótól (nem az elejéről, mint a play()). */
  const resume = useCallback(async (): Promise<boolean> => {
    if (!activeDeviceId) return false;
    try {
      await spotifyPlaybackCommand("resume", activeDeviceId);
      return true;
    } catch {
      return false;
    }
  }, [activeDeviceId]);

  const setVolume = useCallback(async (volume: number): Promise<boolean> => {
    if (!activeDeviceId) return false;
    try {
      await spotifyPlaybackCommand("volume", activeDeviceId, undefined, Math.round(Math.max(0, Math.min(1, volume)) * 100));
      return true;
    } catch {
      return false;
    }
  }, [activeDeviceId]);

  return useMemo(() => ({
    sdkStatus,
    needsDevicePicker: enabled && sdkStatus === "unavailable" && !selectedConnectDeviceId,
    connectDevices,
    loadingDevices,
    selectDevice: setSelectedConnectDeviceId,
    activeDeviceId,
    play,
    pause,
    resume,
    setVolume,
  }), [
    activeDeviceId,
    connectDevices,
    enabled,
    loadingDevices,
    pause,
    play,
    resume,
    sdkStatus,
    selectedConnectDeviceId,
    setVolume,
  ]);
}
