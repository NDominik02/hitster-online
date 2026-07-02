"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { RoomCodeInput } from "@/components/lobby/RoomCodeInput";

/** Belépő oldal: „Új játék" (host) / „Csatlakozás kóddal" (player) — ARCHITECTURE 5.1 app/page.tsx. */
export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  function handleJoin() {
    if (joinCode.length !== 4) return;
    router.push(`/play/${joinCode}`);
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col items-center gap-10 text-center">
        <div>
          <div className="text-5xl mb-2" aria-hidden>
            🎵
          </div>
          <h1 className="text-3xl font-bold">HITSTER ONLINE</h1>
          <p className="text-text-muted mt-2">Böngészős party-játék baráti társaságoknak.</p>
        </div>

        <div className="w-full bg-surface border border-border rounded-[var(--radius-card)] p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Új játék indítása</h2>
          <p className="text-text-muted text-sm">
            Te vagy a Host? Illessz be egy Spotify playlistet, és állítsd be a partit.
          </p>
          <AppButton size="lg" fullWidth onClick={() => router.push("/host")}>
            Új játék létrehozása ▶
          </AppButton>
        </div>

        <div className="text-text-muted text-sm">— vagy —</div>

        <div className="w-full bg-surface border border-border rounded-[var(--radius-card)] p-6 flex flex-col items-center gap-4">
          <h2 className="text-lg font-semibold">Csatlakozás kóddal</h2>
          <RoomCodeInput value={joinCode} onChange={setJoinCode} />
          <AppButton
            size="lg"
            fullWidth
            variant="secondary"
            disabled={joinCode.length !== 4}
            onClick={handleJoin}
          >
            Belépek ▶
          </AppButton>
        </div>
      </div>
    </div>
  );
}
