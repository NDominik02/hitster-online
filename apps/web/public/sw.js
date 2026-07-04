// S43 (PWA, F4) — SZÁNDÉKOSAN minimális Service Worker.
//
// AC43.5: kizárólag a statikus asseteket (ikonok, offline-oldal) cache-eli;
// az API/Realtime hívásokat (Supabase fetch/WebSocket) NEM próbálja meg
// offline kiszolgálni vagy cache-elni — a fetch handler csak a NAVIGÁCIÓS
// (oldal-betöltési) kéréseket kezeli speciálisan, minden mást változatlanul
// a hálózatra enged (nincs `respondWith` hívás rájuk), hogy a játék valós
// idejű működését (ami eleve nem is működhet offline) semmiképp ne zavarja.

const CACHE_NAME = "hitster-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // AC43.4: csak a navigációs (teljes oldal-betöltési) kéréseknél adunk
  // offline fallback-et, ha a hálózat elérhetetlen — nem törött/üres oldal.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }
  // Minden más kérés (API, Realtime, JS/CSS asset) VÁLTOZATLANUL a hálózatra
  // megy — nincs respondWith, tehát a böngésző alapértelmezett viselkedése
  // érvényesül, a Service Worker itt egyáltalán nem avatkozik közbe.
});
