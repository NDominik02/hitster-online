"use client";

import { useEffect, useState } from "react";

type ClockSnapshot = {
  offsetMs: number;
  synced: boolean;
};

const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

let snapshot: ClockSnapshot = { offsetMs: 0, synced: false };
let lastSyncedAt = 0;
let syncPromise: Promise<ClockSnapshot> | null = null;
let resyncIntervalId: number | null = null;
const listeners = new Set<() => void>();

function publish(next: ClockSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function serverNowMs() {
  return Date.now() + snapshot.offsetMs;
}

export async function syncServerClock(force = false): Promise<ClockSnapshot> {
  if (!force && snapshot.synced && Date.now() - lastSyncedAt < RESYNC_INTERVAL_MS) return snapshot;
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const requestStartedAt = Date.now();
    const response = await fetch("/api/time", { cache: "no-store" });
    if (!response.ok) throw new Error("server_clock_unavailable");

    const body = (await response.json()) as { now?: number };
    if (typeof body.now !== "number" || !Number.isFinite(body.now)) throw new Error("server_clock_invalid");

    const responseReceivedAt = Date.now();
    const midpoint = requestStartedAt + (responseReceivedAt - requestStartedAt) / 2;
    const next = { offsetMs: body.now - midpoint, synced: true };
    lastSyncedAt = responseReceivedAt;
    publish(next);
    return next;
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

export function useServerClock(): ClockSnapshot {
  const [current, setCurrent] = useState(snapshot);

  useEffect(() => {
    const update = () => setCurrent(snapshot);
    listeners.add(update);
    void syncServerClock().catch(() => {});

    if (resyncIntervalId === null) {
      resyncIntervalId = window.setInterval(() => {
        void syncServerClock(true).catch(() => {});
      }, RESYNC_INTERVAL_MS);
    }

    return () => {
      listeners.delete(update);
      if (listeners.size === 0 && resyncIntervalId !== null) {
        window.clearInterval(resyncIntervalId);
        resyncIntervalId = null;
      }
    };
  }, []);

  return current;
}
