"use client";

import Link from "next/link";
import { AppButton } from "@/components/system/AppButton";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { ConnectionOverlay } from "@/components/system/ConnectionOverlay";
import { RoomCodeBadge } from "@/components/lobby/RoomCodeBadge";
import { QRCodePanel } from "@/components/lobby/QRCodePanel";
import { RoomCodeInput } from "@/components/lobby/RoomCodeInput";
import { ColorPicker } from "@/components/lobby/ColorPicker";
import { PlayerBadge } from "@/components/lobby/PlayerBadge";
import { PlayerList } from "@/components/lobby/PlayerList";
import { TimelineCard } from "@/components/game/TimelineCard";
import { MysteryCard } from "@/components/game/MysteryCard";
import { Timeline } from "@/components/game/Timeline";
import { CountdownTimer } from "@/components/game/CountdownTimer";
import { RevealCard } from "@/components/game/RevealCard";
import { OutcomeBanner } from "@/components/game/OutcomeBanner";
import { PlayerTimelineRow } from "@/components/game/PlayerTimelineRow";
import { AudioProgressBar } from "@/components/game/AudioProgressBar";
import { CoverageReport } from "@/components/game/CoverageReport";
import { GenerationProgress } from "@/components/game/GenerationProgress";
import { mockDeck, mockJoinUrl, mockPlayers, mockRoom, mockTimelines } from "@/lib/mock-data";
import { useState } from "react";

/**
 * /dev-preview — Storybook-szerű demo route. Minden DESIGN.md 5. szakasz komponens
 * önmagában bemutatható itt, mock adattal, a Backend-integrációtól függetlenül.
 * Nem production route (nincs rá link a landing oldalról).
 */
export default function DevPreviewPage() {
  const [segValue, setSegValue] = useState(10);
  const [colorSel, setColorSel] = useState<null | (typeof mockPlayers)[number]["color"]>(null);
  const [showConnOverlay, setShowConnOverlay] = useState<null | "reconnecting" | "host-paused">(null);

  return (
    <div className="flex-1 px-6 py-10 max-w-5xl mx-auto w-full space-y-12">
      <header>
        <h1 className="text-2xl font-bold">Dev Preview — komponens-galéria</h1>
        <p className="text-text-muted text-sm mt-1">
          Mock adattal (lib/mock-data.ts). Lásd még: <Link href="/host/RGBZ" className="underline">/host/RGBZ</Link>{" "}
          és <Link href="/play/RGBZ" className="underline">/play/RGBZ</Link>.
        </p>
      </header>

      <Section title="AppButton">
        <div className="flex flex-wrap gap-3">
          <AppButton variant="primary">Primary</AppButton>
          <AppButton variant="secondary">Secondary</AppButton>
          <AppButton variant="ghost">Ghost</AppButton>
          <AppButton variant="danger">Danger</AppButton>
          <AppButton disabled>Disabled</AppButton>
        </div>
      </Section>

      <Section title="SegmentedControl">
        <SegmentedControl
          label="Győzelmi limit"
          value={segValue}
          onChange={setSegValue}
          options={[
            { value: 5, label: "5 · gyors" },
            { value: 10, label: "10 · alap" },
            { value: 15, label: "15 · maraton" },
          ]}
        />
      </Section>

      <Section title="RoomCodeBadge + QRCodePanel">
        <div className="flex flex-wrap items-center gap-8">
          <RoomCodeBadge code={mockRoom.code} />
          <QRCodePanel joinUrl={mockJoinUrl} />
        </div>
      </Section>

      <Section title="RoomCodeInput">
        <RoomCodeInputDemo />
      </Section>

      <Section title="ColorPicker">
        <ColorPicker
          taken={mockPlayers.slice(1).map((p) => p.color)}
          selected={colorSel}
          onSelect={setColorSel}
        />
      </Section>

      <Section title="PlayerBadge / PlayerList">
        <div className="flex flex-wrap gap-4 mb-4">
          <PlayerBadge name="Anna" color="green" state="online" />
          <PlayerBadge name="Bence" color="blue" state="active" />
          <PlayerBadge name="Dani" color="orange" state="offline" />
        </div>
        <PlayerList players={mockPlayers} layout="grid" />
      </Section>

      <Section title="TimelineCard states">
        <div className="flex gap-3 flex-wrap">
          <TimelineCard year={1975} title="Bohemian Rhapsody" artist="Queen" state="revealed" />
          <TimelineCard year={1991} state="placed" />
          <TimelineCard year={2004} state="ghost" color="purple" />
          <TimelineCard year={0} state="unknown" size="sm" />
        </div>
      </Section>

      <Section title="MysteryCard">
        <div className="flex gap-6">
          <MysteryCard size="sm" />
          <MysteryCard size="md" spinning />
          <MysteryCard size="lg" draggable />
        </div>
      </Section>

      <Section title="Timeline (görgethető + rések)">
        <Timeline cards={mockTimelines.p1} slots activeSlotIndex={2} />
      </Section>

      <Section title="CountdownTimer">
        <div className="flex gap-6 items-center">
          <CountdownTimer seconds={47} />
          <CountdownTimer seconds={8} />
        </div>
      </Section>

      <Section title="RevealCard">
        <RevealCard title="Bohemian Rhapsody" artist="Queen" year={1975} flipped />
      </Section>

      <Section title="OutcomeBanner">
        <div className="space-y-3">
          <OutcomeBanner outcome="correct" playerName="Anna" />
          <OutcomeBanner outcome="wrong" />
          <OutcomeBanner outcome="timeout" />
        </div>
      </Section>

      <Section title="PlayerTimelineRow (host H4)">
        <div className="space-y-2">
          {mockPlayers.map((p) => (
            <PlayerTimelineRow
              key={p.id}
              player={p}
              cards={mockTimelines[p.id] ?? []}
              isActive={p.id === "p1"}
              ghostSlotIndex={p.id === "p1" ? 2 : null}
            />
          ))}
        </div>
      </Section>

      <Section title="AudioProgressBar">
        <AudioProgressBar current={18} duration={30} playing />
      </Section>

      <Section title="CoverageReport">
        <CoverageReport
          deckId={mockDeck.id}
          usable={mockDeck.report.usable}
          total={mockDeck.report.total}
          pct={mockDeck.report.coveragePct}
          excluded={mockDeck.report.excluded}
          meetsMinimum={mockDeck.report.meetsMinimum}
          onRescued={() => {}}
        />
      </Section>

      <Section title="GenerationProgress">
        <GenerationProgress processed={73} total={100} currentStep="Évszámok lekérése (MusicBrainz)…" />
      </Section>

      <Section title="ConnectionOverlay">
        <div className="flex gap-3">
          <AppButton variant="secondary" onClick={() => setShowConnOverlay("reconnecting")}>
            Reconnecting overlay
          </AppButton>
          <AppButton variant="secondary" onClick={() => setShowConnOverlay("host-paused")}>
            Host-paused overlay
          </AppButton>
        </div>
        {showConnOverlay && (
          <div className="relative mt-4">
            <button className="text-xs underline" onClick={() => setShowConnOverlay(null)}>
              Bezárás
            </button>
            <ConnectionOverlay mode={showConnOverlay} />
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

function RoomCodeInputDemo() {
  const [val, setVal] = useState("RG");
  return <RoomCodeInput value={val} onChange={setVal} />;
}
