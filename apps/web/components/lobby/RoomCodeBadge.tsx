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
        "font-bold tracking-[0.1em] border rounded-[var(--radius-card)] px-6 py-4 text-center",
        size === "xl" ? "text-6xl md:text-8xl" : "text-4xl md:text-6xl"
      )}
      style={{
        fontFamily: "var(--font-heading)",
        background: "linear-gradient(160deg, #1f1d28, #17161d)",
        borderColor: "var(--border-3)",
      }}
      aria-label={`Szobakód: ${code.split("").join(" ")}`}
    >
      {code}
    </div>
  );
}
