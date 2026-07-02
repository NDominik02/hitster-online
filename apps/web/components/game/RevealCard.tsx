"use client";

import { motion, AnimatePresence } from "framer-motion";

export interface RevealCardProps {
  artworkUrl?: string;
  title: string;
  artist: string;
  year: number;
  flipped: boolean;
  /** F1: 'simple' — a látványos reveal-show ('show') F2 (DESIGN 6.5). */
  variant?: "simple" | "show";
}

/** Az albumborító + adatok flip-kártyája (H5, P5) — DESIGN H5 wireframe. */
export function RevealCard({ artworkUrl, title, artist, year, flipped, variant = "simple" }: RevealCardProps) {
  return (
    <div className="flex flex-col items-center gap-4" style={{ perspective: 1000 }}>
      <div className="relative w-48 h-48 md:w-64 md:h-64" style={{ transformStyle: "preserve-3d" }}>
        <motion.div
          className="absolute inset-0 rounded-[var(--radius-card)] bg-surface-2 border-2 border-accent flex items-center justify-center text-6xl font-bold text-accent"
          style={{ backfaceVisibility: "hidden" }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          ?
        </motion.div>
        <motion.div
          className="absolute inset-0 rounded-[var(--radius-card)] bg-surface border-2 border-border overflow-hidden"
          style={{ backfaceVisibility: "hidden", rotateY: 180 }}
          animate={{ rotateY: flipped ? 360 : 180 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artworkUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
              [ ALBUMBORÍTÓ ]
            </div>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {flipped && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="text-2xl md:text-4xl font-bold uppercase">{artist}</div>
            <div className="text-lg md:text-2xl text-text-muted mt-1">{title}</div>
            <div className="font-numeric font-bold text-5xl md:text-7xl mt-3 inline-block bg-surface-2 border border-border rounded-[var(--radius-button)] px-6 py-2">
              {year}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {variant === "show" && (
        <div className="text-xs text-text-muted">(F2: látványos reveal-show helye)</div>
      )}
    </div>
  );
}
