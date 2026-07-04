/**
 * S23 (reveal-show) hangeffekt — Web Audio API oszcillátorral generált, NEM
 * külső hangfájl (0 Ft, nincs licenc-kockázat, nincs extra betöltés — a UX
 * Designer terve szerint). Csak a host eszközön szól (AC23.1).
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** A host-oldali audio-unlock kattintáskor (vagy bármely user-gesture-nél) hívható,
 * hogy a Chrome/Safari ne "suspended" állapotban tartsa az első reveal-ig. */
export function primeSoundContext(): void {
  getAudioContext();
}

function beep(ctx: AudioContext, freq: number, startTime: number, duration: number, gainPeak = 0.15) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playRevealSound(outcome: "correct" | "wrong" | "timeout"): void {
  const ctx = getAudioContext();
  if (!ctx) return; // feature-detection: néma fallback, sosem dob hibát
  const now = ctx.currentTime;
  if (outcome === "correct") {
    beep(ctx, 1046.5, now, 0.12);
    beep(ctx, 1318.5, now + 0.13, 0.16);
  } else {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.42);
  }
}
