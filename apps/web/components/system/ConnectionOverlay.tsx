export interface ConnectionOverlayProps {
  mode: "reconnecting" | "host-paused";
}

/** „Újracsatlakozás…" / „Szünet — host offline" overlay — DESIGN 4.3a. */
export function ConnectionOverlay({ mode }: ConnectionOverlayProps) {
  const message =
    mode === "reconnecting" ? "Újracsatlakozás…" : "Szünet — a host újracsatlakozik…";

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg/85 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 text-center px-6">
        <div
          className="w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        <p className="text-lg font-semibold">{message}</p>
      </div>
    </div>
  );
}
