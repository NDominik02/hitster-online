"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RoomCodeInput } from "@/components/lobby/RoomCodeInput";
import { AppButton } from "@/components/system/AppButton";

const featureItems = [
  { label: "Spotify paklik", value: "playlistből" },
  { label: "Telefonos játék", value: "külön nézet" },
  { label: "Lopás", value: "zsetonért" },
  { label: "Betippelés", value: "+ pontok" },
];

const timelineYears = [
  { year: "1984", color: "#f5b62e" },
  { year: "1997", color: "#34e0a1" },
  { year: "2008", color: "#8b7bf7" },
  { year: "2020", color: "#ff6b4a" },
];

/** Belépő oldal: új játék indítása vagy csatlakozás szobakóddal. */
export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  function handleJoin() {
    if (joinCode.length !== 4) return;
    router.push(`/play/${joinCode}`);
  }

  return (
    <main className="flex flex-1 flex-col px-5 py-6 sm:px-8 lg:px-10">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={40}
            height={40}
            priority
            className="h-10 w-10 rounded-[10px]"
          />
          <span className="truncate text-lg font-black tracking-normal text-text" style={{ fontFamily: "var(--font-heading)" }}>
            HITSTER ONLINE
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/host")}
          className="hidden rounded-[var(--radius-pill)] border border-border px-4 py-2 text-sm font-bold text-text-muted hover:border-accent hover:text-text sm:inline-flex"
        >
          Host mód
        </button>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.86fr)] lg:py-12">
        <div className="max-w-2xl">
          <div className="eyebrow mb-4">telefon + tv partyjáték</div>
          <h1 className="max-w-2xl text-5xl font-black leading-[0.95] tracking-normal text-text sm:text-6xl lg:text-7xl">
            Zenék, évszámok, lopások egy közös idővonalon.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-text-muted">
            Indíts szobát Spotify playlistből, a többiek pedig telefonról csatlakoznak. Rakjátok sorba a dalokat,
            tippeljetek címre, előadóra és évre, aztán csapjatok le a rossz helyre tett kártyákra.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]">
            <div className="rounded-[var(--radius-card)] border border-border-2 bg-surface px-5 py-5">
              <p className="text-sm font-bold uppercase text-accent">Új játék</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Pakliválasztás, játékbeállítások és host képernyő.
              </p>
              <AppButton className="mt-4" size="lg" fullWidth onClick={() => router.push("/host")}>
                Szoba létrehozása ▶
              </AppButton>
            </div>

            <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 px-5 py-5">
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
        </div>

        <div className="relative min-h-[520px] overflow-hidden rounded-[var(--radius-card)] border border-border-2 bg-surface shadow-2xl">
          <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-border bg-surface-2 px-5 py-4">
            <div>
              <p className="eyebrow">host képernyő</p>
              <p className="mt-1 font-bold text-text">Kör 4 · most szól</p>
            </div>
            <div className="rounded-[var(--radius-pill)] border border-accent px-3 py-1 font-code text-sm text-accent">ZH7Q</div>
          </div>

          <div className="px-5 pb-5 pt-24">
            <div className="rounded-[var(--radius-card)] border border-border bg-bg px-5 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-2 bg-surface-2">
                  <Image
                    src="/icons/icon-192.png"
                    alt=""
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="eyebrow">feladvány</p>
                  <p className="mt-2 truncate text-2xl font-black tracking-normal text-text">Ismeretlen sláger</p>
                  <p className="mt-1 text-sm text-text-muted">A játékosok telefonon tippelnek.</p>
                </div>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full w-2/3 rounded-full bg-accent" />
              </div>
            </div>

            <div className="mt-5">
              <p className="eyebrow mb-3">játékos idővonal</p>
              <div className="flex gap-2 overflow-hidden">
                {timelineYears.map((item) => (
                  <div
                    key={item.year}
                    className="w-20 shrink-0 rounded-[var(--radius-button)] border border-border-2 bg-surface-2 p-2 text-center"
                  >
                    <div
                      className="mb-2 aspect-square rounded-md"
                      style={{
                        background: `linear-gradient(145deg, ${item.color}, #17151f 72%)`,
                      }}
                    />
                    <p className="font-numeric text-xl font-black text-text">{item.year}</p>
                  </div>
                ))}
                <div className="flex w-20 shrink-0 items-center justify-center rounded-[var(--radius-button)] border-2 border-dashed border-accent bg-accent/10 font-code text-2xl text-accent">
                  ?
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border border-success/60 bg-success/10 px-4 py-3">
                <p className="text-sm font-bold text-success">Cím: talált</p>
                <p className="mt-1 text-xs text-text-muted">+1 zseton</p>
              </div>
              <div className="rounded-[var(--radius-card)] border border-danger/70 bg-danger/10 px-4 py-3">
                <p className="text-sm font-bold text-danger">Lopás folyamatban</p>
                <p className="mt-1 text-xs text-text-muted">15 mp dönteni</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-3 pb-10 sm:grid-cols-2 lg:grid-cols-4">
        {featureItems.map((item) => (
          <div key={item.label} className="rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-4">
            <p className="text-sm font-bold text-text">{item.label}</p>
            <p className="mt-1 text-sm text-text-muted">{item.value}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
