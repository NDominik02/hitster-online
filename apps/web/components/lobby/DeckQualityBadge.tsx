"use client";

interface DeckQualityBadgeProps {
  starred?: boolean;
}

export function DeckQualityBadge({ starred }: DeckQualityBadgeProps) {
  if (!starred) {
    return <span>Spotify-only</span>;
  }

  return (
    <span
      className="inline-flex h-5 w-5 translate-y-0.5 items-center justify-center rounded-full border border-warning/50 bg-warning/15 text-warning"
      title="Csillagozott pakli"
      aria-label="Csillagozott pakli"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="m12 2.6 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9L12 2.6Z" />
      </svg>
    </span>
  );
}
