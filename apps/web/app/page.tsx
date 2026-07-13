"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RoomCodeInput } from "@/components/lobby/RoomCodeInput";
import { AppButton } from "@/components/system/AppButton";

const albumTiles = [
  { title: "1991", tone: "#8b7bf7", rotate: "-8deg", top: "8%", left: "9%" },
  { title: "2008", tone: "#34e0a1", rotate: "6deg", top: "16%", left: "73%" },
  { title: "1984", tone: "#f5b62e", rotate: "7deg", top: "62%", left: "7%" },
  { title: "2020", tone: "#ff6b4a", rotate: "-5deg", top: "66%", left: "78%" },
];

const timelineYears = ["1978", "1994", "2006", "2017"];

/** Belépő oldal: új játék indítása vagy csatlakozás szobakóddal. */
export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  function handleJoin() {
    if (joinCode.length !== 4) return;
    router.push(`/play/${joinCode}`);
  }

  return (
    <main className="relative flex min-h-screen flex-1 overflow-hidden px-5 py-5 sm:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,10,15,0.86)_0%,rgba(11,10,15,0.62)_42%,rgba(11,10,15,0.94)_100%)]" />
        <div className="absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/20" />
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border-2" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-[22px] border-bg bg-accent shadow-[0_0_80px_rgba(245,182,46,0.32)]" />

        {albumTiles.map((tile) => (
          <div
            key={tile.title}
            className="absolute hidden h-36 w-36 rounded-[18px] border border-white/10 bg-surface p-3 shadow-2xl sm:block"
            style={{
              top: tile.top,
              left: tile.left,
              transform: `rotate(${tile.rotate})`,
            }}
          >
            <div
              className="h-full rounded-[12px]"
              style={{ background: `linear-gradient(145deg, ${tile.tone}, #17151f 68%)` }}
            />
            <span className="absolute bottom-5 right-5 font-numeric text-2xl font-black text-white">{tile.title}</span>
          </div>
        ))}

        <div className="absolute bottom-[18%] left-1/2 hidden -translate-x-1/2 items-center gap-3 lg:flex">
          {timelineYears.map((year) => (
            <div
              key={year}
              className="flex h-24 w-20 items-end justify-center rounded-[var(--radius-button)] border border-border-2 bg-surface-2 pb-3 shadow-xl"
            >
              <span className="font-numeric text-xl font-black text-text">{year}</span>
            </div>
          ))}
          <div className="flex h-24 w-20 items-center justify-center rounded-[var(--radius-button)] border-2 border-dashed border-accent bg-accent/10 font-code text-3xl text-accent">
            ?
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={40}
              height={40}
              priority
              className="h-10 w-10 rounded-[10px] shadow-[0_0_28px_rgba(245,182,46,0.32)]"
            />
            <span className="text-sm font-black uppercase tracking-[0.22em] text-text-muted">browser party game</span>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-12 text-center">
          <p className="eyebrow mb-4 text-accent">music timeline battle</p>
          <h1 className="mx-auto max-w-5xl text-6xl font-black leading-[0.82] tracking-normal text-text sm:text-8xl lg:text-9xl">
            HITSTER ONLINE
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-text-muted sm:text-xl">
            Egy szoba. Egy playlist. Mindenki telefonról játszik.
          </p>

          <div className="mx-auto mt-10 w-full max-w-3xl rounded-[var(--radius-card)] border border-border-2 bg-bg/88 p-5 shadow-2xl backdrop-blur">
            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
              <div className="flex flex-col justify-between text-left">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-accent">Host</p>
                  <p className="mt-2 text-sm text-text-muted">Pakli, szabályok, szoba.</p>
                </div>
                <AppButton className="mt-4" size="lg" fullWidth onClick={() => router.push("/host")}>
                  Szoba létrehozása ▶
                </AppButton>
              </div>

              <div className="hidden w-px bg-border md:block" />
              <div className="flex items-center gap-3 text-xs font-bold uppercase text-text-faint md:hidden">
                <span className="h-px flex-1 bg-border" />
                vagy
                <span className="h-px flex-1 bg-border" />
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-success">Csatlakozás</p>
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
          </div>
        </section>
      </div>
    </main>
  );
}
