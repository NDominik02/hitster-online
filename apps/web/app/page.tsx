"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type CSSProperties, useState } from "react";
import { RoomCodeInput } from "@/components/lobby/RoomCodeInput";
import { AppButton } from "@/components/system/AppButton";

const featuredTracks = [
  {
    title: "KIK EZEK - Bruno",
    artist: "Bruno X Spacc, VINI, KKevin",
    year: "2026",
    image: "https://i.scdn.co/image/ab67616d0000b273db5df562cff664638a254a37",
    tone: "#8b7bf7",
    rotate: "-8deg",
    floatX: "-7px",
    floatY: "-18px",
    top: "8%",
    left: "9%",
  },
  {
    title: "Mizu",
    artist: "Fluor",
    year: "2010",
    image: "https://i.scdn.co/image/ab67616d0000b2736cd16fa65f326ef60aaf3492",
    tone: "#34e0a1",
    rotate: "6deg",
    floatX: "8px",
    floatY: "-16px",
    top: "16%",
    left: "73%",
  },
  {
    title: "Erőszakos Gádzsi",
    artist: "Krisz",
    year: "2024",
    image: "https://i.scdn.co/image/ab67616d0000b27358b25f89f1f04432d8a0adb3",
    tone: "#f5b62e",
    rotate: "7deg",
    floatX: "-8px",
    floatY: "-14px",
    top: "62%",
    left: "7%",
  },
  {
    title: "Firework",
    artist: "Katy Perry",
    year: "2010",
    image: "https://i.scdn.co/image/ab67616d0000b273f619042d5f6b2149a4f5e0ca",
    tone: "#ff6b4a",
    rotate: "-5deg",
    floatX: "7px",
    floatY: "-17px",
    top: "66%",
    left: "78%",
  },
];

const timelineTracks = [...featuredTracks].sort((a, b) => Number(a.year) - Number(b.year));

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
      <style>{`
        .landing-track-card {
          --landing-rotate: 0deg;
          --landing-float-x: 0px;
          --landing-float-y: -16px;
          transform: translate3d(0, 0, 0) rotate(var(--landing-rotate));
          animation: landing-card-float 5.8s ease-in-out infinite;
          will-change: transform;
        }

        .landing-track-card:nth-of-type(odd) {
          animation-duration: 6.7s;
        }

        .landing-orbit-ring {
          animation: landing-ring-glow 5.8s ease-in-out infinite;
        }

        .landing-orbit-ring-inner {
          animation-delay: -2.4s;
        }

        .landing-core-pulse {
          animation: landing-core-pulse 2.8s ease-in-out infinite;
        }

        .landing-timeline-card {
          animation: landing-card-rise 0.75s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes landing-card-float {
          0%,
          100% {
            transform: translate3d(0, 0, 0) rotate(var(--landing-rotate));
          }
          50% {
            transform: translate3d(var(--landing-float-x), var(--landing-float-y), 0) rotate(var(--landing-rotate)) scale(1.035);
          }
        }

        @keyframes landing-ring-glow {
          0%,
          100% {
            opacity: 0.72;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes landing-core-pulse {
          0%,
          100% {
            box-shadow: 0 0 66px rgba(245, 182, 46, 0.3);
          }
          50% {
            box-shadow: 0 0 118px rgba(245, 182, 46, 0.52);
          }
        }

        @keyframes landing-card-rise {
          from {
            opacity: 0;
            transform: translate3d(0, 18px, 0) scale(0.94);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .landing-track-card {
            animation-duration: 5.8s !important;
            animation-iteration-count: infinite !important;
          }

          .landing-track-card:nth-of-type(odd) {
            animation-duration: 6.7s !important;
          }

          .landing-orbit-ring {
            animation-duration: 5.8s !important;
            animation-iteration-count: infinite !important;
          }

          .landing-core-pulse {
            animation-duration: 2.8s !important;
            animation-iteration-count: infinite !important;
          }

          .landing-timeline-card {
            animation-duration: 0.75s !important;
          }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,10,15,0.86)_0%,rgba(11,10,15,0.62)_42%,rgba(11,10,15,0.94)_100%)]" />
        <div className="landing-orbit-ring absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/20" />
        <div className="landing-orbit-ring landing-orbit-ring-inner absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border-2" />
        <div className="landing-core-pulse absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-[22px] border-bg bg-accent shadow-[0_0_80px_rgba(245,182,46,0.32)]" />

        {featuredTracks.map((track, index) => (
          <div
            key={track.title}
            className="landing-track-card absolute hidden h-48 w-36 overflow-hidden rounded-[18px] border border-white/10 bg-surface shadow-2xl sm:block"
            style={{
              top: track.top,
              left: track.left,
              "--landing-rotate": track.rotate,
              "--landing-float-x": track.floatX,
              "--landing-float-y": track.floatY,
              animationDelay: `${index * -1.35}s`,
            } as CSSProperties}
          >
            <div
              className="h-36 w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${track.image})` }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(180deg, transparent 32%, rgba(11,10,15,0.42) 58%, ${track.tone}22 100%)`,
              }}
            />
            <div className="absolute inset-x-0 bottom-0 space-y-1 bg-bg/86 px-3 py-2 backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-black text-text">{track.title}</p>
                <span className="font-numeric text-xs font-black text-accent">{track.year}</span>
              </div>
              <p className="truncate text-xs font-semibold text-text-muted">{track.artist}</p>
            </div>
          </div>
        ))}

        <div className="absolute bottom-[18%] left-1/2 hidden -translate-x-1/2 items-center gap-3 lg:flex">
          {timelineTracks.map((track, index) => (
            <div
              key={track.title}
              className="landing-timeline-card flex h-28 w-24 flex-col justify-between overflow-hidden rounded-[var(--radius-button)] border border-border-2 bg-surface-2 shadow-xl"
              style={{ animationDelay: `${160 + index * 70}ms` }}
            >
              <div
                className="h-16 w-full bg-cover bg-center opacity-90"
                style={{ backgroundImage: `url(${track.image})` }}
              />
              <div className="px-2 pb-2">
                <p className="truncate text-[10px] font-bold text-text-muted">{track.title}</p>
                <span className="font-numeric text-xl font-black text-text">{track.year}</span>
              </div>
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
                  <p className="mt-2 text-sm text-text-muted">
                    Te vagy a Host? Illessz be egy Spotify playlistet, és állítsd be a partit.
                  </p>
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
