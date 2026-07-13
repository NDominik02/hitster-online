"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RoomCodeInput } from "@/components/lobby/RoomCodeInput";
import { AppButton } from "@/components/system/AppButton";

/** Belépő oldal: új játék indítása vagy csatlakozás szobakóddal. */
export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  function handleJoin() {
    if (joinCode.length !== 4) return;
    router.push(`/play/${joinCode}`);
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col px-5 py-6 sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={36}
            height={36}
            priority
            className="h-9 w-9 rounded-[9px]"
          />
          <span className="text-base font-black text-text" style={{ fontFamily: "var(--font-heading)" }}>
            HITSTER ONLINE
          </span>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,440px)]">
        <div className="max-w-xl">
          <div className="mb-5 inline-flex rounded-[var(--radius-pill)] border border-border bg-surface-2 px-3 py-1 text-xs font-bold uppercase text-text-muted">
            böngészős partyjáték
          </div>
          <h1 className="text-5xl font-black leading-none tracking-normal text-text sm:text-6xl">
            Zene felismerés, idővonalra rakva.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-text-muted">
            Hozz létre egy szobát, a többiek pedig telefonról csatlakoznak. Ennyi.
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border-2 bg-surface p-5 shadow-2xl">
          <div className="rounded-[var(--radius-card)] border border-border bg-bg p-4">
            <p className="text-sm font-bold uppercase text-accent">Host</p>
            <p className="mt-2 text-sm leading-6 text-text-muted">Pakli választása és szoba indítása.</p>
            <AppButton className="mt-4" size="lg" fullWidth onClick={() => router.push("/host")}>
              Szoba létrehozása ▶
            </AppButton>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase text-text-faint">
            <span className="h-px flex-1 bg-border" />
            vagy
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold uppercase text-success">Csatlakozás</p>
              <span className="font-code text-xs text-text-faint">4 karakter</span>
            </div>
            <div className="mt-4 flex justify-center">
              <RoomCodeInput value={joinCode} onChange={setJoinCode} />
            </div>
            <p className="mt-3 min-h-5 text-center text-sm text-text-muted" aria-live="polite">
              {joinCode.length === 4 ? "Kész, beléphetsz." : "Írd be a szobakódot."}
            </p>
            <AppButton
              className="mt-2"
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
      </section>
    </main>
  );
}
