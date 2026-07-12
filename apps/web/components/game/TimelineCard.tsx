"use client";

import { useState } from "react";
import clsx from "clsx";
import type { PlayerColorId } from "@/lib/game/types";
import { playerColorValue } from "@/lib/game/colors";

export type TimelineCardState = "revealed" | "placed" | "ghost" | "unknown";

export interface TimelineCardProps {
  year: number;
  title?: string;
  artist?: string;
  artworkUrl?: string;
  state?: TimelineCardState;
  size?: "sm" | "md" | "lg";
  color?: PlayerColorId;
}

const sizeClasses = {
  sm: "w-16",
  md: "w-24",
  lg: "w-32",
};

const yearSize = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

export function TimelineCard({
  year,
  title,
  artist,
  artworkUrl,
  state = "placed",
  size = "md",
  color,
}: TimelineCardProps) {
  const isGhost = state === "ghost";
  const showArtwork = Boolean(artworkUrl && !isGhost && state !== "unknown");
  const showFallbackMark = !showArtwork && !isGhost;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasDetails = Boolean(title && size !== "sm" && !isGhost);
  const detailsLabel = title ? (artist ? `${artist} - ${title}` : title) : "";
  const ariaLabel = detailsLabel ? `${detailsLabel}, ${year}` : String(year);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={() => hasDetails && setDetailsOpen((open) => !open)}
      onBlur={() => setDetailsOpen(false)}
      disabled={!hasDetails}
      className={clsx(
        "relative shrink-0 rounded-[var(--radius-button)] border p-2 text-center transition-all duration-150",
        sizeClasses[size],
        isGhost ? "border-dashed opacity-50" : "border-solid",
        hasDetails ? "cursor-pointer hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-accent" : "cursor-default"
      )}
      style={{
        background: state === "unknown" ? "var(--surface-2)" : "linear-gradient(160deg, #201e2a, #1a1922)",
        borderColor: color ? playerColorValue(color) : "var(--border-3)",
      }}
    >
      <span
        className="mb-1.5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-md"
        style={{ background: "var(--surface-2)" }}
      >
        {showArtwork && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artworkUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
        {showFallbackMark && (
          <span
            className="block rounded-full"
            style={{
              width: "28%",
              height: "28%",
              background: "var(--bg)",
              border: "3px solid rgba(255,255,255,0.35)",
            }}
          />
        )}
      </span>
      <span
        className={clsx("block font-numeric font-bold leading-none", yearSize[size], isGhost && "animate-pulse")}
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {isGhost ? "?" : year}
      </span>
      {title && size !== "sm" && (
        <span
          className="mt-1 block px-1 text-[10px] font-normal leading-tight text-text-muted"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            overflowWrap: "anywhere",
          }}
        >
          {detailsLabel}
        </span>
      )}
      {hasDetails && detailsOpen && (
        <span className="absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 w-56 -translate-x-1/2 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-2 text-left text-xs font-normal leading-snug text-text shadow-xl">
          <span className="block font-semibold text-text">{title}</span>
          {artist && <span className="mt-0.5 block text-text-muted">{artist}</span>}
          <span className="mt-1 block font-code text-accent">{year}</span>
        </span>
      )}
    </button>
  );
}
