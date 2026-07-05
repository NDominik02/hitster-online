"use client";

import clsx from "clsx";

export interface MysteryCardProps {
  spinning?: boolean;
  draggable?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-20 h-20 text-2xl",
  md: "w-[130px] h-[130px] text-3xl",
  lg: "w-44 h-44 text-5xl",
};

const labelInset = {
  sm: "inset-6",
  md: "inset-9",
  lg: "inset-12",
};

/**
 * A „?" kártya — redesign (Claude Design pass): bakelit-lemez motívum a
 * korábbi téglalap-kártya helyett (DESIGN 3. wireframe / 5.1 komponenslista
 * szemantikája változatlan — csak a vizuális nyelv más). `spinning` valós
 * CSS forgás (nem a korábbi rotateY "billegés"), hogy a lemez ténylegesen
 * pörögjön, amíg a rejtett szám szól.
 */
export function MysteryCard({ spinning, draggable, size = "md", className }: MysteryCardProps) {
  return (
    <div
      className={clsx(
        "relative rounded-full border select-none",
        sizeClasses[size],
        draggable && "cursor-grab active:cursor-grabbing touch-none",
        className
      )}
      style={{
        background: "repeating-radial-gradient(var(--surface-2) 0 3px, var(--surface) 3px 5px)",
        borderColor: "var(--border-2)",
        animation: spinning ? "mystery-spin 5.5s linear infinite" : undefined,
      }}
      aria-label="Rejtett kártya"
    >
      <div
        className={clsx(
          "absolute rounded-full flex items-center justify-center font-bold",
          labelInset[size]
        )}
        style={{
          background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
          color: "var(--bg)",
          fontFamily: "var(--font-heading)",
        }}
      >
        ?
      </div>
    </div>
  );
}
