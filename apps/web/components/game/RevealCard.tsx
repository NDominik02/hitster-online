"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

export interface RevealCardProps {
  artworkUrl?: string;
  title: string;
  artist: string;
  year: number;
  flipped: boolean;
  /** F1: 'simple' — a látványos reveal-show ('show') F2/S23. */
  variant?: "simple" | "show";
  /** Csak 'show' variánsnál releváns — a konfetti csak sikeres kimenetnél jelenik meg. */
  outcome?: "correct" | "wrong" | "timeout";
}

const CONFETTI_COUNT = 12;

/**
 * Az albumborító + adatok flip-kártyája (H5, P5) — DESIGN H5 wireframe, S23-mal bővítve.
 *
 * `variant="show"` esetén a flip "pop"-ot kap (skálázás-túllövés) + sikernél konfetti;
 * `prefers-reduced-motion` esetén ehelyett egy egyszerű cross-fade fut (DESIGN 6.5) —
 * a globals.css globális reduced-motion szabálya NEM fedi le a Framer Motion inline
 * transzformációit, ezért ez itt explicit `useReducedMotion()` ággal van megoldva.
 */
export function RevealCard({
  artworkUrl,
  title,
  artist,
  year,
  flipped,
  variant = "simple",
  outcome,
}: RevealCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const showFlourish = variant === "show" && !prefersReducedMotion;

  return (
    <div className="flex flex-col items-center gap-4" style={{ perspective: 1000 }}>
      <div className="relative w-48 h-48 md:w-64 md:h-64" style={{ transformStyle: "preserve-3d" }}>
        {prefersReducedMotion && variant === "show" ? (
          <>
            <motion.div
              className="absolute inset-0 rounded-[var(--radius-card)] bg-surface-2 border-2 border-accent flex items-center justify-center text-6xl font-bold text-accent"
              animate={{ opacity: flipped ? 0 : 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              ?
            </motion.div>
            <motion.div
              className="absolute inset-0 rounded-[var(--radius-card)] bg-surface border-2 border-border overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: flipped ? 1 : 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
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
          </>
        ) : (
          <>
            <motion.div
              className="absolute inset-0 rounded-[var(--radius-card)] bg-surface-2 border-2 border-accent flex items-center justify-center text-6xl font-bold text-accent"
              style={{ backfaceVisibility: "hidden" }}
              animate={{
                rotateY: flipped ? 180 : 0,
                scale: showFlourish && flipped ? [1, 1.12, 1] : 1,
              }}
              transition={{
                rotateY: { duration: 0.45, ease: "easeInOut" },
                scale: { duration: 0.45, ease: "easeOut", times: [0, 0.6, 1] },
              }}
            >
              ?
            </motion.div>
            <motion.div
              className="absolute inset-0 rounded-[var(--radius-card)] bg-surface border-2 border-border overflow-hidden"
              style={{ backfaceVisibility: "hidden", rotateY: 180 }}
              animate={{
                rotateY: flipped ? 360 : 180,
                scale: showFlourish && flipped ? [1, 1.12, 1] : 1,
              }}
              transition={{
                rotateY: { duration: 0.45, ease: "easeInOut" },
                scale: { duration: 0.45, ease: "easeOut", times: [0, 0.6, 1] },
              }}
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
          </>
        )}

        <AnimatePresence>
          {showFlourish && flipped && outcome === "correct" && (
            <>
              {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-accent"
                  style={{ left: "50%", top: "40%" }}
                  initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                  animate={{
                    opacity: 0,
                    x: Math.cos((i / CONFETTI_COUNT) * Math.PI * 2) * (60 + ((i * 7) % 40)),
                    y: Math.sin((i / CONFETTI_COUNT) * Math.PI * 2) * (60 + ((i * 7) % 40)) - 20,
                    scale: 0.4,
                  }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: 0.45 }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
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
    </div>
  );
}
