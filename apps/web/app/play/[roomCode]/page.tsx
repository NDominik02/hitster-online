"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AppButton } from "@/components/system/AppButton";
import { RoomCodeInput } from "@/components/lobby/RoomCodeInput";
import { ColorPicker } from "@/components/lobby/ColorPicker";
import { PlayerList } from "@/components/lobby/PlayerList";
import { Timeline } from "@/components/game/Timeline";
import { TippingScreen } from "@/components/game/TippingScreen";
import { OutcomeBanner } from "@/components/game/OutcomeBanner";
import type { PlayerColorId } from "@/lib/game/types";
import { mockPlayers, mockRoundReveal, mockTimelines } from "@/lib/mock-data";
import type { PlayerScreen } from "@/lib/game/state";

/**
 * Player shell — P1 (ha még nem tag) → P2..P5 a fázis alapján (ARCHITECTURE 5.1).
 * JELENLEG mock adattal fut — a join_room/reconnect Edge Function elkészülte után
 * (docs/BACKEND-NOTES.md) itt kell bekötni a valós hívást + useRoomChannel feliratkozást.
 * Mobil-first, thumb-zone: a fő akció mindig az alsó képernyőharmadban.
 */
export default function PlayRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode;

  const [screen, setScreen] = useState<PlayerScreen>("P1");
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColorId | null>(null);

  const me = mockPlayers[0]; // demo: "Anna"
  const takenColors = mockPlayers.filter((p) => p.id !== me.id).map((p) => p.color);
  const takenByName = Object.fromEntries(
    mockPlayers.filter((p) => p.id !== me.id).map((p) => [p.color, p.name])
  ) as Partial<Record<PlayerColorId, string>>;

  const screens: PlayerScreen[] = ["P1", "P2", "P2-observer", "P3", "P5", "P5-end"];

  return (
    <div className="flex flex-col flex-1 min-h-screen">
      <DevScreenSwitcher current={screen} screens={screens} onChange={setScreen} roomCode={roomCode} />

      {screen === "P1" && (
        <div className="flex-1 flex flex-col justify-center px-6 py-8 gap-6 max-w-sm mx-auto w-full">
          <div className="text-center">
            <div className="text-3xl mb-1" aria-hidden>
              🎵
            </div>
            <h1 className="text-xl font-bold">HITSTER</h1>
            <p className="text-text-muted mt-1">Csatlakozz a játékhoz</p>
          </div>

          <div>
            <label className="block mb-1 font-medium text-sm">Szobakód</label>
            <RoomCodeInput value={roomCode.toUpperCase()} onChange={() => {}} disabled />
          </div>

          <div>
            <label className="block mb-1 font-medium text-sm" htmlFor="player-name">
              Neved
            </label>
            <input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 12))}
              placeholder="Anna"
              className="w-full min-h-11 rounded-[var(--radius-button)] bg-surface-2 border-2 border-border focus-visible:border-accent px-4 py-3 text-base"
            />
          </div>

          <div>
            <label className="block mb-2 font-medium text-sm">Színed</label>
            <ColorPicker taken={takenColors} selected={color} onSelect={setColor} takenByName={takenByName} />
          </div>

          <AppButton
            size="lg"
            fullWidth
            disabled={!name.trim() || !color}
            onClick={() => setScreen("P2")}
          >
            BELÉPEK ▶
          </AppButton>
        </div>
      )}

      {screen === "P2" && (
        <div className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-sm mx-auto w-full">
          <div>
            <span className="font-bold" style={{ color: "var(--player-green)" }}>
              🟢 {me.name} (te)
            </span>
          </div>
          <p className="text-text-muted">Várj a hostra…</p>
          <p className="text-text-muted text-sm">«a host mindjárt elindítja»</p>

          <div>
            <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">A te idővonalad</h2>
            <Timeline cards={mockTimelines[me.id]?.slice(0, 1) ?? []} />
          </div>

          <div>
            <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">Többiek</h2>
            <PlayerList players={mockPlayers.filter((p) => p.id !== me.id)} />
          </div>
        </div>
      )}

      {screen === "P2-observer" && (
        <div className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-sm mx-auto w-full">
          <div>
            <span className="font-bold" style={{ color: "var(--player-blue)" }}>
              🔵 Bence köre
            </span>
            <p className="text-text-muted text-sm">«húzza a kártyát…»</p>
          </div>

          <div>
            <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">Bence idővonala</h2>
            <Timeline cards={mockTimelines.p2 ?? []} />
          </div>

          <div>
            <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">A te idővonalad</h2>
            <Timeline cards={mockTimelines[me.id] ?? []} />
          </div>

          <p className="text-text-muted text-sm">Zene szól a közös képernyőn 🔊</p>
          <p className="text-text-muted">Várd ki a köröd 🙂</p>
        </div>
      )}

      {screen === "P3" && (
        <TippingScreen
          cards={mockTimelines[me.id] ?? []}
          ownerColor={me.color}
          timeLimitSec={47}
          onConfirm={() => setScreen("P5")}
          onExpire={() => setScreen("P5")}
        />
      )}

      {screen === "P5" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6 max-w-sm mx-auto w-full text-center">
          <OutcomeBanner outcome="correct" />
          <p className="text-lg">Eltaláltad! 🎉</p>
          <p className="text-text-muted">A kártya beépült az idővonaladba.</p>
          <p className="font-semibold">
            {mockRoundReveal.revealedCard?.artist} – {mockRoundReveal.revealedCard?.year}
          </p>
          <div>
            <h2 className="text-text-muted text-sm uppercase tracking-wide mb-2">A te idővonalad</h2>
            <Timeline cards={mockTimelines[me.id] ?? []} />
          </div>
          <p className="text-text-muted text-sm" aria-live="polite">
            «következő kör…»
          </p>
        </div>
      )}

      {screen === "P5-end" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-4 text-center">
          <p className="text-2xl font-bold">🎉 Nyert: Anna 🟢</p>
          <p className="text-text-muted">A győzelem részletei a közös képernyőn láthatók.</p>
        </div>
      )}
    </div>
  );
}

function DevScreenSwitcher({
  current,
  screens,
  onChange,
  roomCode,
}: {
  current: PlayerScreen;
  screens: PlayerScreen[];
  onChange: (s: PlayerScreen) => void;
  roomCode: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-text-muted border-b border-border px-3 py-2">
      <span className="font-code">Player · {roomCode}</span>
      {screens.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-1.5 py-0.5 rounded ${current === s ? "bg-accent text-white" : "bg-surface-2"}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
