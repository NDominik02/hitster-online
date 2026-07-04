/**
 * S23 (reveal-show) haptika — csak a player telefonon (P5), feature-detection
 * mögött (AC23.3: iOS Safari-n nincs Vibration API, ez néma no-op, sosem hibázik).
 */
export function vibrateOutcome(outcome: "correct" | "wrong" | "timeout"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    if (outcome === "correct") {
      navigator.vibrate([80, 60, 80]); // rövid dupla rezgés
    } else {
      navigator.vibrate(350); // egy hosszú rezgés
    }
  } catch {
    // egyes böngészők (letiltott engedély) dobhatnak — némán elnyeljük (AC23.3)
  }
}
