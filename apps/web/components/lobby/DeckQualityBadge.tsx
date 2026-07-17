"use client";

interface DeckQualityBadgeProps {
  audioPipeline?: string | null;
  featured?: boolean;
  hasDownloadedPreviews?: boolean;
}

export function DeckQualityBadge({ audioPipeline, featured, hasDownloadedPreviews }: DeckQualityBadgeProps) {
  const isSpotifyOnly = audioPipeline === "spotify_only";
  if (!isSpotifyOnly && !featured && !hasDownloadedPreviews) return null;

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {isSpotifyOnly && <span>Spotify-only</span>}
      {featured && (
        <span
          className="inline-flex h-5 w-5 translate-y-0.5 items-center justify-center rounded-full border border-warning/50 bg-warning/15 text-warning"
          title="Ajánlott pakli"
          aria-label="Ajánlott pakli"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m12 2.6 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9L12 2.6Z" />
          </svg>
        </span>
      )}
      {hasDownloadedPreviews && (
        <span
          className="inline-flex h-5 w-5 translate-y-0.5 items-center justify-center rounded-full border border-accent/50 bg-accent/15 text-accent"
          title="Letöltött preview hangok"
          aria-label="Letöltött preview hangok"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v11" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        </span>
      )}
    </span>
  );
}
