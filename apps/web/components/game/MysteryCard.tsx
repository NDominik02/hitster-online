"use client";

import clsx from "clsx";
import { motion } from "framer-motion";

export interface MysteryCardProps {
  spinning?: boolean;
  draggable?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-20 h-24 text-3xl",
  md: "w-28 h-36 text-5xl",
  lg: "w-40 h-52 text-7xl",
};

/** A „?" kártya — drag-forrás P3-on, pörgő a H4-en (DESIGN 3. wireframe, 5.1 komponenslista). */
export function MysteryCard({ spinning, draggable, size = "md", className }: MysteryCardProps) {
  return (
    <motion.div
      animate={spinning ? { rotateY: [0, 15, -15, 0] } : {}}
      transition={spinning ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : undefined}
      className={clsx(
        "rounded-[var(--radius-card)] flex items-center justify-center font-bold border-4 border-accent bg-surface-2 shadow-lg select-none",
        sizeClasses[size],
        draggable && "cursor-grab active:cursor-grabbing touch-none",
        className
      )}
      style={{ color: "var(--accent)" }}
      aria-label="Rejtett kártya"
    >
      ?
    </motion.div>
  );
}
