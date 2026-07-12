/**
 * DB sor → domain típus adapterek. A generált Database típus (packages/shared-types)
 * snake_case-t és nyers JSONB-t ad vissza; itt képezzük le a lib/game/types.ts camelCase
 * domain alakjára, amit a UI komponensek használnak.
 */
import type { Database } from "../shared-types/database.types";
import { isFeaturedDeckReport } from "../featuredPlaylists";
import type {
  Deck,
  DeckReport,
  Player,
  PlayerColorId,
  Room,
  RoomSettings,
  RoomStatus,
  RoundPhase,
  RoundPublic,
  TimelineCardPublic,
} from "../game/types";

type DeckRow = Database["public"]["Tables"]["decks"]["Row"];
type PlayerRow = Database["public"]["Tables"]["players"]["Row"];
type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type RoundPublicRow = Database["public"]["Views"]["round_public"]["Row"];
type GetTimelineRow = Database["public"]["Functions"]["get_timeline"]["Returns"][number];

export function adaptDeck(row: DeckRow): Deck {
  const report = (row.report ?? {}) as Partial<DeckReport> & {
    processed?: number;
    total?: number;
    step?: string;
    reason?: string;
    errorCode?: string;
    playlistImportWarning?: string;
  };
  return {
    id: row.id,
    name: row.name,
    sourcePlaylistUrl: row.source_playlist_url ?? "",
    sourcePlaylistId: row.source_playlist_id,
    totalTracks: row.total_tracks,
    usableCount: row.usable_count,
    coveragePct: Number(row.coverage_pct),
    status: (row.status as Deck["status"]) ?? "generating",
    report: {
      usable: report.usable ?? row.usable_count,
      total: report.total ?? row.total_tracks,
      coveragePct: report.coveragePct ?? Number(row.coverage_pct),
      meetsMinimum: report.meetsMinimum ?? row.usable_count >= 60,
      excluded: report.excluded ?? [],
      uncertainYearCount: report.uncertainYearCount,
      spotifyOnlyCount: report.spotifyOnlyCount,
      playlistImportWarning: report.playlistImportWarning,
    },
    progress: {
      processed: report.processed ?? 0,
      total: report.total ?? row.total_tracks,
      step: report.step ?? "fetching_playlist",
      failReason: report.reason ?? report.errorCode,
      warning: report.playlistImportWarning,
    },
    ownerId: row.owner_id,
    isPublic: row.is_public,
    isFeatured: isFeaturedDeckReport(row.report),
    createdAt: row.created_at,
  };
}

/** A generálás közbeni progress a decks.report mezőből (BACKEND-NOTES 4.: { processed, total, step }). */
export interface DeckGenerationProgress {
  processed: number;
  total: number;
  step: "fetching_playlist" | "resolving_years" | "uploading_audio" | "done" | "failed" | string;
}

export function adaptDeckProgress(row: DeckRow): DeckGenerationProgress {
  const report = (row.report ?? {}) as { processed?: number; total?: number; step?: string };
  return {
    processed: report.processed ?? 0,
    total: report.total ?? row.total_tracks,
    step: report.step ?? "fetching_playlist",
  };
}

export function adaptRoom(row: RoomRow): Room {
  const settings = (row.settings ?? {}) as Partial<RoomSettings>;
  return {
    id: row.id,
    code: row.code,
    hostUid: row.host_uid,
    deckId: row.deck_id,
    status: row.status as RoomStatus,
    settings: {
      winTarget: settings.winTarget ?? 10,
      timeLimitSec: settings.timeLimitSec ?? 90,
      stealEnabled: settings.stealEnabled ?? false,
      mode: settings.mode ?? "shared_screen",
    },
    currentRoundId: row.current_round_id,
    winnerPlayerIds: row.winner_player_ids ?? [],
    spotifyPlaybackMode: (row.spotify_playback_mode as "preview" | "premium" | undefined) ?? "preview",
  };
}

export function adaptPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    color: row.color as PlayerColorId,
    seatOrder: row.seat_order,
    connected: row.connected,
    kickedAt: row.kicked_at,
    tokens: row.tokens,
  };
}

export function adaptRoundPublic(row: RoundPublicRow): RoundPublic | null {
  if (!row.id) return null;
  const revealed = row.revealed_card as {
    title: string;
    artist: string;
    year: number;
    artworkUrl?: string;
  } | null;
  return {
    id: row.id,
    roomId: row.room_id ?? "",
    roundNo: row.round_no ?? 0,
    activePlayerId: row.active_player_id ?? "",
    phase: (row.phase as RoundPhase) ?? "playing",
    placement: row.placement,
    outcome: row.outcome,
    placingDeadline: row.placing_deadline,
    stealDeadline: row.steal_deadline,
    nextReadyPlayerIds: row.next_ready_player_ids ?? [],
    revealedCard: revealed,
  };
}

export function adaptTimelineCard(row: GetTimelineRow): TimelineCardPublic {
  return {
    id: row.id,
    playerId: row.player_id,
    position: row.position,
    isStart: row.is_start,
    title: row.title,
    artist: row.artist,
    year: row.year,
    artworkUrl: row.artwork_url ?? undefined,
  };
}
