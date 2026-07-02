import clsx from "clsx";

export interface RoomCodeBadgeProps {
  code: string;
  size?: "lg" | "xl";
}

/** A 4 betűs szobakód nagy megjelenítése — 3 m-ről olvasható (DESIGN H3). */
export function RoomCodeBadge({ code, size = "xl" }: RoomCodeBadgeProps) {
  return (
    <div
      className={clsx(
        "font-code font-bold tracking-[0.25em] bg-surface-2 border-2 border-border rounded-[var(--radius-card)] px-6 py-4 text-center",
        size === "xl" ? "text-6xl md:text-8xl" : "text-4xl md:text-6xl"
      )}
      aria-label={`Szobakód: ${code.split("").join(" ")}`}
    >
      {code}
    </div>
  );
}
