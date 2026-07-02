import type { Room, RoundPublic } from "./types";

/**
 * A UI-állapot a szerver-állapotból (rooms.status + round_public.phase) derivált.
 * (ARCHITECTURE.md 5.3 — "Alapelv: a szerver az igazság forrása".)
 *
 * A host és a player shell ebből a leképezésből dönti el, melyik képernyőt (H1..H6 / P1..P5) renderelje.
 */

export type HostScreen = "H1" | "H2" | "H3" | "H4" | "H5" | "H6";
export type PlayerScreen = "P1" | "P2" | "P2-observer" | "P3" | "P5" | "P5-end";

export function resolveHostScreen(
  room: Room | null,
  round: RoundPublic | null,
  deckReady: boolean
): HostScreen {
  if (!room) return "H1";
  if (room.status === "lobby") {
    // amíg a pakli generálása fut/be nem fejeződött, H2 a riport képernyő
    return deckReady ? "H3" : "H2";
  }
  if (room.status === "finished") return "H6";
  if (room.status === "playing" || room.status === "paused") {
    if (!round) return "H4";
    if (round.phase === "reveal" || round.phase === "done") return "H5";
    return "H4";
  }
  return "H1";
}

export function resolvePlayerScreen(
  room: Room | null,
  round: RoundPublic | null,
  myPlayerId: string | null
): PlayerScreen {
  if (!room || !myPlayerId) return "P1";
  if (room.status === "lobby") return "P2";
  if (room.status === "finished") return "P5-end";
  if (!round) return "P2";

  const isMyTurn = round.activePlayerId === myPlayerId;

  if (round.phase === "reveal" || round.phase === "done") return "P5";
  if (isMyTurn) return "P3";
  return "P2-observer";
}
