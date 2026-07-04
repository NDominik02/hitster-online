"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import clsx from "clsx";
import type { NameGuessInput, PlayerColorId, TimelineCardPublic } from "@/lib/game/types";
import { playerColorValue } from "@/lib/game/colors";
import { MysteryCard } from "./MysteryCard";
import { Timeline } from "./Timeline";
import { CountdownTimer } from "./CountdownTimer";
import { GuessInput } from "./GuessInput";
import { AppButton } from "../system/AppButton";

export interface TippingScreenProps {
  cards: TimelineCardPublic[];
  ownerColor: PlayerColorId;
  /** Fallback, ha nincs deadlineIso (pl. demo/mock mód). */
  timeLimitSec?: number;
  /** Szerver oldali abszolút deadline (round.placingDeadline) — ha van, ez az irányadó. */
  deadlineIso?: string | null;
  /** F2 (S21) — a lerakással EGYÜTT küldött opcionális bemondás; a szülő olvassa ki a LERAKOM-nál. */
  onConfirm: (slotIndex: number, nameGuess?: NameGuessInput | null) => void;
  onExpire: () => void;
}

/**
 * P3 — Tippelés (a játék szíve). dnd-kit alapú drag&drop VÍZSZINTES idővonalon
 * + KÖTELEZŐ tap-to-place fallback (D11) UGYANAZON a képernyőn.
 * DESIGN P3 wireframe + 4.1 interakció-részletek.
 */
export function TippingScreen({
  cards,
  ownerColor,
  timeLimitSec = 90,
  deadlineIso,
  onConfirm,
  onExpire,
}: TippingScreenProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [nameGuess, setNameGuess] = useState<NameGuessInput | null>(null);

  // Aktivációs késleltetés/távolság (DESIGN 4.1a): a drag csak akkor induljon, ha az ujj
  // elmozdul, hogy a görgetés (pan) ne keveredjen a húzással.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    if (typeof overId === "string" && overId.startsWith("slot-")) {
      setSelectedSlot(Number(overId.replace("slot-", "")));
    }
    // Résen kívüli elengedés: nincs teendő, a kártya visszaugrik (spring-back), a
    // kijelölés nem törlődik automatikusan itt — ha korábban volt kijelölés és most
    // résen kívülre engedte, a meglévő logika szerint megmarad; explicit törlés csak
    // ha a felhasználó újra a MysteryCardot húzza és nem talál slotot:
  }

  function handleExpire() {
    setExpired(true);
    onExpire();
  }

  const color = playerColorValue(ownerColor);

  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-bold text-lg" style={{ color }}>
          🟢 A TE KÖRÖD
        </span>
        <CountdownTimer
          seconds={timeLimitSec}
          deadlineIso={deadlineIso}
          onExpire={handleExpire}
          paused={expired}
        />
      </header>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex flex-col items-center gap-6 px-4 py-6">
          <p className="text-text-muted text-sm">Húzd a helyére! 👇 (vagy koppints a kártyára, majd egy résre)</p>

          <DraggableMysteryCard selected={selectedSlot !== null} />

          <div className="w-full">
            <div className="text-center text-xs text-text-muted mb-1">régebbi ◄─────────────► újabb</div>
            <Timeline
              cards={cards}
              slots
              activeSlotIndex={selectedSlot}
              ownerColor={color}
              onTapSelectSlot={setSelectedSlot}
            />
          </div>

          <GuessInput value={nameGuess} onChange={setNameGuess} disabled={expired} />
        </div>
      </DndContext>

      <footer className="p-4 border-t border-border">
        <AppButton
          size="lg"
          fullWidth
          disabled={selectedSlot === null}
          onClick={() => selectedSlot !== null && onConfirm(selectedSlot, nameGuess)}
        >
          {selectedSlot === null ? "Húzd egy résbe" : "LERAKOM ✓"}
        </AppButton>
      </footer>

      {expired && (
        <div
          role="alertdialog"
          aria-live="assertive"
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90"
        >
          <div className="text-center">
            <p className="text-2xl font-bold text-danger">Lejárt az idő!</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DraggableMysteryCard({ selected }: { selected: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: "mystery-card",
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y - 24}px, 0)`,
        zIndex: 10,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={clsx(isDragging && "scale-110 drop-shadow-2xl")}
    >
      <MysteryCard draggable size="md" className={clsx(selected && "opacity-60")} />
    </div>
  );
}
