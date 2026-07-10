import { PLAYER_COLORS, type PlayerColorId } from "./types";

const DARK_TEXT_COLORS = new Set<PlayerColorId>(["green", "orange", "yellow", "teal"]);

export function playerColorValue(colorId: PlayerColorId): string {
  return PLAYER_COLORS.find((c) => c.id === colorId)?.value ?? "var(--player-green)";
}

export function playerColorLabel(colorId: PlayerColorId): string {
  return PLAYER_COLORS.find((c) => c.id === colorId)?.label ?? colorId;
}

export function groupPlayerNamesByColor(
  players: Array<{ name: string; color: PlayerColorId }>
): Partial<Record<PlayerColorId, string[]>> {
  const grouped: Partial<Record<PlayerColorId, string[]>> = {};
  for (const player of players) {
    (grouped[player.color] ??= []).push(player.name);
  }
  return grouped;
}

/** Sötét vagy világos szöveg a chip kontrasztjához (DESIGN 6.2 táblázat). */
export function playerColorTextClass(colorId: PlayerColorId): string {
  return DARK_TEXT_COLORS.has(colorId) ? "text-[#0B0B14]" : "text-white";
}

export function playerMonogram(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
