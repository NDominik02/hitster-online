"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { GenerationProgress } from "@/components/game/GenerationProgress";
import { CoverageReport } from "@/components/game/CoverageReport";
import { RoomCodeBadge } from "@/components/lobby/RoomCodeBadge";
import { QRCodePanel } from "@/components/lobby/QRCodePanel";
import { PlayerList } from "@/components/lobby/PlayerList";
import { MysteryCard } from "@/components/game/MysteryCard";
import { AudioProgressBar } from "@/components/game/AudioProgressBar";
import { AudioUnlockOverlay } from "@/components/game/AudioUnlockOverlay";
import { PlayerTimelineRow } from "@/components/game/PlayerTimelineRow";
import { RevealCard } from "@/components/game/RevealCard";
import { OutcomeBanner } from "@/components/game/OutcomeBanner";
import { PlayerBadge } from "@/components/lobby/PlayerBadge";
import { TimelineCard } from "@/components/game/TimelineCard";
import {
  mockDeck,
  mockPlayers,
  mockRound,
  mockRoundReveal,
  mockTimelines,
} from "@/lib/mock-data";
import type { HostScreen } from "@/lib/game/state";

/**
 * Host shell — az aktuális rooms.status + round.phase alapján rendereli H2..H6-ot
 * (ARCHITECTURE 5.1). JELENLEG mock adattal fut (lib/mock-data.ts) — a Backend agent
 * generate_deck/create_room/draw_card/resolve_round Edge Functionjeinek elkészülte
 * (docs/BACKEND-NOTES.md) után itt kell bekötni a valós lib/supabase/functions.ts hívásokat
 * és a lib/game/useRoomChannel.ts realtime feliratkozást.
 *
 * A demo célból egy screen-választó fejléc engedi kézzel bejárni H2→H6-ot.
 */
export default function HostRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode;

  const [screen, setScreen] = useState<HostScreen>("H3");
  const [audioLocked, setAudioLocked] = useState(false);
  const [dragGhostIndex, setDragGhostIndex] = useState<number | null>(2);

  const activePlayer = mockPlayers.find((p) => p.id === mockRound.activePlayerId)!;
  const winner = mockPlayers[0];

  const screens: HostScreen[] = ["H2", "H3", "H4", "H5", "H6"];

  return (
    <div className="flex flex-col flex-1 px-6 py-8">
      <div className="w-full max-w-5xl mx-auto space-y-8">
        <DevScreenSwitcher current={screen} screens={screens} onChange={setScreen} roomCode={roomCode} />

        {screen === "H2" && (
          <section className="space-y-6">
            <h1 className="text-2xl font-bold">PAKLI ELŐKÉSZÍTÉSE</h1>
            <GenerationProgress processed={73} total={100} currentStep="Évszámok lekérése (MusicBrainz)…" />
            <div className="border-t border-border pt-6">
              <CoverageReport
                usable={mockDeck.report.usable}
                total={mockDeck.report.total}
                pct={mockDeck.report.coveragePct}
                excluded={mockDeck.report.excluded}
                meetsMinimum={mockDeck.report.meetsMinimum}
              />
            </div>
            <AppButton size="lg" fullWidth disabled={!mockDeck.report.meetsMinimum} onClick={() => setScreen("H3")}>
              SZOBA LÉTREHOZÁSA ▶
            </AppButton>
          </section>
        )}

        {screen === "H3" && (
          <section className="space-y-8 text-center">
            <h1 className="text-2xl font-bold">CSATLAKOZZ A JÁTÉKHOZ!</h1>
            <div className="flex flex-col md:flex-row items-center justify-center gap-10">
              <QRCodePanel joinUrl={`https://hitster.app/play/${roomCode}`} />
              <div>
                <div className="text-text-muted mb-2">Szobakód:</div>
                <RoomCodeBadge code={roomCode} />
              </div>
            </div>

            <div className="text-left">
              <h2 className="text-text-muted text-sm uppercase tracking-wide mb-3">
                Csatlakozott játékosok ({mockPlayers.length})
              </h2>
              <PlayerList players={mockPlayers} layout="grid" />
            </div>

            <div>
              <AppButton size="lg" disabled={mockPlayers.length < 2} onClick={() => setScreen("H4")}>
                START ▶
              </AppButton>
              <p className="text-text-muted text-sm mt-2">Legalább 2 játékos kell az induláshoz.</p>
            </div>
          </section>
        )}

        {screen === "H4" && (
          <section className="space-y-8">
            <div className="flex justify-between text-text-muted text-sm">
              <span>🔊 Most szól…</span>
              <span>
                Kör {mockRound.roundNo} · Pakli: 41 hátra
              </span>
            </div>

            <div className="flex flex-col items-center gap-6">
              <MysteryCard spinning size="lg" />
              <AudioProgressBar current={18} duration={30} playing />
            </div>

            <div className="bg-surface-2 rounded-[var(--radius-card)] px-6 py-4 text-center">
              <PlayerBadge name={activePlayer.name} color={activePlayer.color} state="active" size="lg" />
              <p className="text-text-muted mt-2">«húzza a kártyát…»</p>
            </div>

            <div>
              <h2 className="text-text-muted text-sm uppercase tracking-wide mb-3">Játékosok idővonalai</h2>
              <div className="space-y-2">
                {mockPlayers.map((p) => (
                  <PlayerTimelineRow
                    key={p.id}
                    player={p}
                    cards={mockTimelines[p.id] ?? []}
                    isActive={p.id === activePlayer.id}
                    ghostSlotIndex={p.id === activePlayer.id ? dragGhostIndex : null}
                  />
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  className="text-xs text-text-muted underline"
                  onClick={() => setDragGhostIndex((i) => (i === null ? 0 : (i + 1) % 6))}
                >
                  (demo: szellem-pozíció léptetése)
                </button>
                <button className="text-xs text-text-muted underline" onClick={() => setAudioLocked(true)}>
                  (demo: autoplay-blokk szimulálása)
                </button>
              </div>
            </div>

            <AppButton variant="secondary" onClick={() => setScreen("H5")}>
              (demo: → Reveal)
            </AppButton>

            <AudioUnlockOverlay visible={audioLocked} onUnlock={() => setAudioLocked(false)} />
          </section>
        )}

        {screen === "H5" && (
          <section className="flex flex-col items-center gap-8 py-8">
            <RevealCard
              artworkUrl={mockRoundReveal.revealedCard?.artworkUrl}
              title={mockRoundReveal.revealedCard!.title}
              artist={mockRoundReveal.revealedCard!.artist}
              year={mockRoundReveal.revealedCard!.year}
              flipped
            />
            <OutcomeBanner outcome="correct" playerName={activePlayer.name} />
            <p className="text-text-muted text-sm" aria-live="polite">
              «következő kör 5 mp múlva…»
            </p>
            <AppButton variant="secondary" onClick={() => setScreen("H4")}>
              (demo: → következő kör)
            </AppButton>
          </section>
        )}

        {screen === "H6" && (
          <section className="flex flex-col items-center gap-8 py-8 text-center">
            <h1 className="text-3xl font-bold">🎉 GYŐZELEM! 🎉</h1>
            <PlayerBadge name={winner.name} color={winner.color} size="lg" />
            <div>
              <h2 className="text-text-muted text-sm uppercase tracking-wide mb-3">
                {winner.name} nyertes idővonala
              </h2>
              <div className="flex gap-2 flex-wrap justify-center">
                {(mockTimelines[winner.id] ?? []).map((c) => (
                  <TimelineCard key={c.id} year={c.year} state="revealed" size="sm" />
                ))}
              </div>
            </div>

            <div className="text-left w-full max-w-sm">
              <h2 className="text-text-muted text-sm uppercase tracking-wide mb-3">Végeredmény</h2>
              <ul className="space-y-2">
                {mockPlayers
                  .map((p) => ({ p, count: (mockTimelines[p.id] ?? []).length }))
                  .sort((a, b) => b.count - a.count)
                  .map(({ p, count }, i) => (
                    <li key={p.id} className="flex items-center justify-between">
                      <PlayerBadge name={p.name} color={p.color} size="sm" />
                      <span className="font-numeric">
                        {count} kártya {i === 0 && "🥇"}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="flex gap-4">
              <AppButton size="lg" onClick={() => setScreen("H3")}>
                ÚJRA ↻
              </AppButton>
              <AppButton size="lg" variant="secondary" onClick={() => setScreen("H2")}>
                Új pakli
              </AppButton>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function DevScreenSwitcher({
  current,
  screens,
  onChange,
  roomCode,
}: {
  current: HostScreen;
  screens: HostScreen[];
  onChange: (s: HostScreen) => void;
  roomCode: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted border-b border-border pb-3">
      <span className="font-code">Host · {roomCode}</span>
      <span className="opacity-50">|</span>
      <span>demo nézetváltó:</span>
      {screens.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-2 py-1 rounded ${current === s ? "bg-accent text-white" : "bg-surface-2"}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
