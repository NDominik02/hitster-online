"use client";

import { useEffect } from "react";

/** S43 (PWA) — feature-detection mögött, néma no-op böngészőkben, ahol nincs támogatás. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Néma hiba — a PWA-telepíthetőség opcionális kényelmi funkció, nem
      // szabad, hogy a regisztráció sikertelensége bármit is törjön az appban.
    });
  }, []);

  return null;
}
