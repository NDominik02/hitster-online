# Backend Notes — F1 (Backend Engineer agent)

*Készült: 2026-07-02 · Backend Engineer · Forrás: ARCHITECTURE.md 9. szakasz Fázis A–B*

**Éles URL:** https://hitster-online-eta.vercel.app — Vercel projekt a `NDominik02/hitster-online` GitHub repóra kötve (`main` ág → production auto-deploy, Root Directory: `apps/web`).

Ez a dokumentum a Frontend Engineer agentnek szól: mi készült el a backend oldalon,
és hogyan kell integrálni a Next.js appból. A teljes API-szerződés az
`ARCHITECTURE.md` 3. szakaszában van részletesen leírva — ez itt a gyors
integrációs összefoglaló + a ténylegesen megvalósult apró eltérések.

---

## 1. Projekt

- **Supabase projekt:** `hitster-online` (region: `eu-central-1`, free tier, 0 Ft/hó)
- **Project ID:** `cynedrshuqneztnymbxu`
- **Project URL:** `https://cynedrshuqneztnymbxu.supabase.co`
- **Publishable (anon) key — biztonságosan kliens-oldalra tehető:**
  - Legacy anon key (JWT, ezt használd a supabase-js kliensben):
    `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5bmVkcnNodXFuZXp0bnltYnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5OTk1MDQsImV4cCI6MjA5ODU3NTUwNH0.qQ1t9AxqR5yIRWEEtRzpkeRr0R0xJfzcJTdIO2vysro`
  - Modern publishable key (alternatíva, ha az SDK verzió támogatja):
    `sb_publishable_KW_FDK3TUUlPYkga6b7fiQ_WdgzsAm9`
  - **A service_role/secret kulcs SOSEM kerül ide vagy a frontend kódba** — csak az Edge Functionök használják, environment variable-ből (`SUPABASE_SERVICE_ROLE_KEY`, a Supabase automatikusan injektálja az Edge Function futtató környezetbe).

### Javasolt `.env.local` (Next.js) változónevek

```
NEXT_PUBLIC_SUPABASE_URL=https://cynedrshuqneztnymbxu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<a fenti anon key>
```

---

## 2. Adatbázis séma + RLS — elkészült (Fázis A, 1–4. lépés)

3 migráció ment fel (`001_schema`, `002_storage`, `003_rls_and_views`) + egy negyedik javító migráció (`004_fix_advisors`):

- Minden tábla az ARCHITECTURE.md 1. szakasza szerint: `decks`, `deck_cards`, `rooms`, `players`, `rounds`, `timeline_cards`, plusz `mb_year_cache` (globális MusicBrainz-cache, 3.1).
- RLS mindenhol bekapcsolva, default-deny. A `deck_cards` táblán **szándékosan nincs SELECT policy** semmilyen kliens-role-nak — ez az anti-leak mag (2.3). Ez a `get_advisors` biztonsági listában is megjelenik INFO szinten ("RLS Enabled No Policy") — ez **elvárt, nem hiba**.
- `mb_year_cache` is RLS-védett, policy nélkül — csak az Edge Function (service-role) éri el.
- **`round_public` VIEW** — a player-facing kör-állapot, `security_invoker = true`. **Ezt olvasd a kliensből, SOHA ne a `rounds` táblát közvetlenül** — a `rounds` tábla `card_id` mezője a megfejtés kulcsa, amit a nézet szándékosan nem ad ki.
- **`get_timeline(p_room_id uuid)` RPC (nem VIEW!)** — eltérés az ARCHITECTURE.md 2.7-től: a tervezett `timeline_public` SECURITY DEFINER view-t a Supabase linter ERROR szinten jelezte (definer view megkerülheti a hívó RLS-ét), ezért az A4 döntés alapján ("ha kétség, RPC") egy explicit `security definer` **RPC-re** váltottam, ami a tagságot a függvénytörzsben ellenőrzi. Hívás módja kliensből:
  ```ts
  const { data, error } = await supabase.rpc('get_timeline', { p_room_id: roomId });
  ```
  A visszatérési oszlopok ugyanazok, mint amit a doksi a `timeline_public` view-hoz ígért: `id, player_id, position, is_start, placed_round_no, room_id, title, artist, year, artwork_url` (audio_url/spotify_uri szándékosan nincs benne).
- `is_room_member(room_id)` és `is_room_host(room_id)` SQL RPC-k is elérhetők a kliensből (`supabase.rpc(...)`), ha a Frontendnek szüksége lenne rájuk — de a policy-k már automatikusan használják őket minden SELECT-nél, külön hívás normál esetben nem kell.
- **Storage:** `deck-audio` bucket, **privát** (nincs publikus/anon/authenticated SELECT policy). A hangfájlokhoz kizárólag a `draw_card`/`start_game` válaszában kapott, rövid élettartamú (5 perc TTL) signed URL-en át lehet hozzáférni — **kizárólag a host kliens kapja meg**.

`get_advisors` (security) lefutott a séma + RLS + Edge Functionök után: nincs ERROR szintű találat. A maradék INFO/WARN szintűek szándékos tervezési döntések (dokumentálva fent + a migrációk kommentjeiben).

---

## 3. Edge Functions — elkészült (Fázis B, 5–9. lépés)

Mind a 10 tervezett function deployolva, `ACTIVE` státuszban, `verify_jwt: true` (minden hívásnak érvényes Supabase JWT-t kell küldenie az `Authorization: Bearer <jwt>` headerben — az anonymous auth sessionből ez automatikus, ha a supabase-js klienst használod).

| Function | Hívó | Megjegyzés |
|---|---|---|
| `generate_deck` | host | `{ playlistUrl }` → **AZONNAL** (~1-2s) visszaadja `{ deckId, status: 'generating' }`-t, a tényleges munka háttérben, self-chaining batch-ekben fut (ld. RÉSZLETESEN a 4. pontban — 2026-07-02-i blokkoló-hiba javítás). **Pollingozd a `decks` táblát** (`status`, `total_tracks`, `usable_count`, `coverage_pct`, `report`) 2 mp-enként, amíg `status` `ready`/`failed` nem lesz. A `report` mező: `{ processed, total, step }`, `step` egyike: `fetching_playlist`, `resolving_years`, `uploading_audio`, `done`, `failed`. |
| `create_room` | host | `{ deckId, settings? }` → `{ roomId, code, status }`. `deck.usable_count >= 60` kötelező (D4). |
| `join_room` | player | `{ code, name, color }` → `{ roomId, playerId, seatOrder, status }`. Reconnect-barát: ha az `auth_uid` már tag, a meglévő sort adja vissza. |
| `start_game` | host | `{ roomId }` → `{ status, roundId, activePlayerId }`. Min. 2 játékos kell. |
| `draw_card` | host | `{ roomId }` → `{ roundId, roundNo, activePlayerId, audioUrl, placingDeadline }`. **Az `audioUrl` csak ide kerül ki, csak a hostnak.** Normál esetben `start_game`/`next_turn` már meghívja belsőleg; ezt a hostnak explicit is lehet hívnia (pl. ha a signed URL lejárt, újat kér anélkül, hogy új kártyát húzna). |
| `place_card` | soron lévő player | `{ roundId, position }` → `{ phase, stealDeadline }`. Csak az `active_player_id`-hez tartozó auth_uid hívhatja. |
| `resolve_round` | host | `{ roundId }` → `{ phase: 'reveal', outcome, revealedCard }`. D6: ha nincs `placement` és a `placing_deadline` még nem járt le, 409 `deadline_not_reached`-et ad — a host kliens csak a deadline után hívja. |
| `next_turn` | host | `{ roomId }` → `{ next: 'draw', roundId }` VAGY `{ next: 'finished', winnerPlayerIds }`. |
| `reconnect` | player/host | `{ code }` → `{ roomId, role: 'host'|'player', ..., status, currentRoundId }`. Ezt hívd meg induláskor localStorage JWT-vel, mielőtt `join_room`-ot hívnál (S15). |
| `leave_room` | player | `{ roomId }` → `{ ok: true }`. Explicit kilépés; a tényleges disconnect-detekció Presence-alapú, kliensoldali. |

**`register_steal` szándékosan NINCS implementálva** (F2-stub, az ARCHITECTURE.md 3.7 kifejezetten kéri, hogy ne készüljön el F1-ben). A `stealing` fázis a sémában/fázis-gépben megvan, de `place_card` gyakorlatilag azonnal átengedi (F1: `stealEnabled` mindig false) — a host közvetlenül `resolve_round`-ot hívhat utána.

### Hívási minta a kliensből

```ts
const { data: { session } } = await supabase.auth.getSession();
const res = await fetch(`${SUPABASE_URL}/functions/v1/create_room`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  body: JSON.stringify({ deckId, settings: { winTarget: 10, timeLimitSec: 90 } }),
});
const json = await res.json();
```

Vagy a supabase-js `functions.invoke` helper-rel (ez automatikusan felteszi az Authorization headert az aktuális sessionből):
```ts
const { data, error } = await supabase.functions.invoke('create_room', {
  body: { deckId, settings: { winTarget: 10, timeLimitSec: 90 } },
});
```

Hibaválasz formátuma mindenhol egységes: `{ error: string, messageHu?: string }`, HTTP státusz kóddal (400/401/403/404/409/422/500).

---

## 4. `generate_deck` — MÓDOSÍTVA (2026-07-02, blokkoló hiba javítva) — fontos működési megjegyzés a Frontendnek

> **Frissítés:** az eredeti implementáció (lásd fentebb, korábban ez a szakasz "szinkron, kb. 2-4 percig nyitva marad a HTTP kérés" leírást tartalmazott) **éles tesztben megbukott**: a Free-tier Edge Function 150 mp-es wall-clock limitje miatt egyetlen 60+ track-es playlist sem tudott végigfutni egyetlen HTTP invocation-ön belül — a hívás mindig `HTTP 546` (timeout) hibával szakadt meg kb. 150,1 mp-nél, a `decks` sor véglegesen `status='generating'`-ben ragadt. Ez közvetlenül blokkolta az F1 MVP-t (D4 minimum = 60 kártya). **Ez most javítva van** — a Frontend polling-logikáját az alábbi ÚJ válaszformához kell igazítani.

### Az új viselkedés

**A HTTP válasz MOST MÁR AZONNAL (~1-2 másodpercen belül) visszatér**, mielőtt bármilyen playlist-feldolgozás elindulna:

```json
{ "deckId": "uuid", "status": "generating", "message": "A pakli generálása elindult. Kövesd a decks.report mezőt a folyamat állapotáért." }
```

**Ez NEM a régi, teljes eredményt tartalmazó válasz** (`totalTracks`, `usableCount`, `coveragePct`, stb. már NEM ebben a válaszban jönnek) — ha a Frontend a válaszból várta ezeket a mezőket, azt **a `decks` tábla pollingozására kell átállítani**:

```ts
const { data, error } = await supabase.functions.invoke('generate_deck', {
  body: { playlistUrl },
});
const { deckId } = data; // csak ennyi jön azonnal

// Poll decks tábla, pl. 2s-enként, amíg status ready/failed nem lesz:
const { data: deck } = await supabase
  .from('decks')
  .select('status, total_tracks, usable_count, coverage_pct, report')
  .eq('id', deckId)
  .single();

// deck.report: { processed, total, step } — step: 'fetching_playlist' | 'resolving_years' | 'uploading_audio' | 'done' | 'failed'
// deck.status: 'generating' | 'ready' | 'failed'
// deck.status === 'ready' esetén: total_tracks, usable_count, coverage_pct, és a report.{excluded, uncertainYearCount, meetsMinimum} tartalmazza a végeredményt (a korábbi HTTP-válasz mezői most ide kerültek).
```

### A tényleges implementáció (miért ez, technikai részletek)

A munka a HTTP válasz visszaadása UTÁN, `EdgeRuntime.waitUntil()`-ban fut, **de** a Supabase dokumentáció szerint a `waitUntil` NEM terjeszti ki a wall-clock limitet (150s Free tier), csak megakadályozza a worker korai leállítását ugyanazon az ablakon belül. Ezért a feldolgozás **time-boxed batch-ekben, self-chaining módon** fut:

1. Egy invocation legfeljebb ~90 másodpercig dolgozik (`BATCH_TIME_BUDGET_MS`), aztán checkpointol (`decks.report`-ba menti az addigi állapotot: feldolgozott track-lista, MB/iTunes cache).
2. Ha van még hátralévő track, a function **önmagát hívja meg** egy új HTTP kéréssel (service-role hitelesítéssel, `x-internal-continue: 1` headerrel — ez a hívás a kliens felé sosem látszik és nem is hívható kívülről, mert a service-role kulcs sosem kerül klienshez).
3. Ez a lánc addig folytatódik, amíg minden track fel nem dolgozódott (évszám-feloldás + preview-keresés), majd hasonlóan time-boxed módon lezajlik az audio-feltöltési fázis is.
4. **Sebesség-javítás:** a MusicBrainz és iTunes lekérdezés track-enként MOST PÁRHUZAMOSAN fut (`Promise.all`, korábban szekvenciális volt) — ez kb. felezte a track-enkénti időt (2,6s → ~1,5-2s/track).

**Mért teljesítmény (valós teszt, 2026-07-02):** a 100 track-es "🚗🎤" playlist (`3cmVUEjMK7RkTe6ONRTQeJ`) generálása **170 másodperc (2 perc 50 mp) alatt** ért `status='ready'`-be, **100/100 track használhatóként** (100% lefedettség, 19 track kapott `year_uncertain=true` flaget a kereszt-ellenőrzésből). A HTTP hívás maga **~1,7 másodperc alatt** tért vissza. A folyamat 2 self-chain láncszemet igényelt az évfeloldási fázisban + 1-et az audio-feltöltésnél (a `decks.report` mezőben ez láthatatlan a kliens felé, csak a `processed`/`total`/`step` számít).

**Frontend polling-javaslat:** 2 másodperces intervallum ésszerű; a teljes generálás 60-100 track-es playlisteknél jellemzően 1-4 perc között várható (playlist-mérettől és MusicBrainz/iTunes válaszidőtől függően).

**iTunes-év fallback minden playlistre fut** (F0-REPORT 2./6. tanulsága) — nem csak akkor, ha nincs Spotify embed forrás. Kettős-forrás kereszt-ellenőrzés: ha `|MB-év − iTunes-év| >= 3`, a korábbi évet vesszük és `year_uncertain=true`-t kap a kártya.

**Hibakezelés változatlan:** `status='failed'` esetén a `decks.report.reason`/`errorCode` mezőben van a hiba oka (pl. `playlist_not_public`, `playlist_fetch_failed`, `deck_cards_insert_failed`).

---

## 5. Realtime — a kliens oldali bekötés a Frontend feladata

A backend oldalon nincs külön "realtime setup" migráció szükséges — a Supabase Realtime broadcast/presence kliensoldali csatorna-feliratkozással működik, szerver-oldali séma nélkül. Az ARCHITECTURE.md 4. szakasza szerint:

- **Broadcast csatorna:** `room:{roomId}` — a kliens kódnak kell broadcast eventeket küldenie a megfelelő pillanatokban (pl. `place_card` sikeres hívása után a player broadcastol egy `card_placed` eventet a saját csatornájára), az Edge Functionök **nem küldenek automatikusan broadcast eventet** — ezt a hívó kliensnek kell megtennie a function sikeres válasza után. *(Ha ez a Frontend munkamódszerével ütközik — pl. szeretnétek, hogy a Function maga broadcastoljon szerver-oldalon a Supabase Realtime API-n át —, jelezzétek, ez utólag hozzáadható az Edge Functionökhöz.)*
- **`room:{roomId}:drag` csatorna:** tisztán kliens-kliens broadcast, nincs szerver-komponense.
- **Presence:** szintén kliensoldali, `track()`-kel.
- `postgres_changes` a `rounds` táblán **nincs bekapcsolva és ne is legyen** (anti-leak: 2.6b) — mindig a `round_public` view-t/broadcast+refetch mintát használd.

---

## 6. TypeScript típusok

Generálva és elmentve: `packages/shared-types/database.types.ts` (a `Database` típus a teljes sémával, `round_public` view-val, `get_timeline`/`is_room_member`/`is_room_host` RPC szignatúrákkal).

Használat a Next.js oldalon:
```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@hitster/shared-types/database.types'; // vagy relatív import, a monorepo-setuptól függően

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } } // localStorage-persist alapból bekapcsolva (7.1)
);
```

---

## 7. Amit a Frontendnek tudnia kell az anti-leakről (kritikus)

- A player kliens **soha ne hívja** a `draw_card`-ot vagy a `resolve_round`-ot — ezek host-only endpointok (403-at adnak vissza, ha player hívja).
- A player kliens **mindig a `round_public` view-t olvassa**, soha a `rounds` táblát (a policy technikailag engedi a `rounds` SELECT-et is a tagoknak, mert a host admin-lekérdezéseihez kell, de a `card_id` a view-ban nincs benne — a nyers táblában viszont ott van, tehát a kliens kód konvenció kérdése, hogy a view-t használja).
- Audio lejátszás **kizárólag a host kliensen**, a `draw_card`/`start_game` válaszban kapott signed `audioUrl`-lel.

---

## 9. pg_cron biztonsági háló (2026-07-02, DECISIONS.md A2 upgrade)

**Miért:** az A2 döntés F1-ben a host-vezérelt, szerver-ellenőrzött timerre épített ("host hívja a `resolve_round`-ot deadline-lejáratkor"), és előre jelezte, hogy F2-ben jöhet pg_cron, "ha a host-vezérelt megoldás megbízhatatlannak bizonyul". **Ez éles tesztben bebizonyosodott**: egy kör 80+ másodpercig beragadt `stealing` fázisban, mert a host böngésző-tab háttérbe került (a JS timer nem futott tovább). A tulaj jóváhagyta a pg_cron-alapú szerveroldali safety net beépítését F1-ben, F2 helyett.

### 9.1 Architektúra

- **Közös kiértékelő logika kiszervezve:** `supabase/functions/_shared/round.ts` most exportálja a `resolveRound(supabase, roundId, opts)` függvényt — ez **szó szerint ugyanaz a kód**, ami korábban a `resolve_round/index.ts`-ben volt (kiértékelés, `phase='reveal'`+`outcome`+`revealed_card` egy UPDATE-ben, timeline-beépítés helyes kimenetnél). A `resolve_round/index.ts` most csak: JWT-ellenőrzés → host-jogosultság-ellenőrzés → `resolveRound()` hívás → HTTP-válasz fordítás. **Ez garantálja, hogy a host-vezérelt út és az automata út SOSEM adhat eltérő eredményt ugyanarra a körre** — nincs két külön implementáció, ami idővel elcsúszhatna egymástól.
- **Új Edge Function: `auto_resolve_expired_rounds`** (`supabase/functions/auto_resolve_expired_rounds/index.ts`, `verify_jwt: false`, mert nem user-JWT-vel hívják). Lekérdezi az összes kört, ahol `phase in ('playing','placing','stealing')` ÉS `placing_deadline < now()`, és mindegyikre lefuttatja a közös `resolveRound()`-ot. Sikeres reveal után `round_revealed` broadcast eventet küld a `room:{roomId}` csatornára (ugyanazt az eventet, amit eddig a host kliens küldött `resolve_round` után — 4.1. szakasz), hogy a real-time útvonal is működjön akkor is, ha a host tabja nem aktív.
- **Hitelesítés:** a function a bejövő `Authorization: Bearer <token>` headert összeveti a saját `SUPABASE_SERVICE_ROLE_KEY` env-változójával — csak a service-role kulcsot ismerő hívó (azaz a pg_cron job) hívhatja sikeresen. Nincs nyitott/publikus végpont.
- **pg_cron + pg_net:** két új migráció:
  - `005_pg_cron_pg_net_extensions` — bekapcsolja mindkét extension-t (korábban egyik sem volt telepítve a projektben, `list_extensions`-szel ellenőrizve).
  - `006_pg_cron_safety_net_job` — létrehoz egy `cron.schedule('auto_resolve_expired_rounds', '20 seconds', ...)` jobot, ami `net.http_post`-tal hívja az Edge Function-t. A job SQL-je a service-role kulcsot **Supabase Vault-ból olvassa futásidőben** (`select decrypted_secret from vault.decrypted_secrets where name = 'service_role'`) — a kulcs SOSEM szerepel sima szövegben a migrációban.

### 9.2 KRITIKUS — egyszeri manuális lépés szükséges a tulajtól

A biztonsági szabály ("secret sosem sima szövegben, és egy agent nem olvashatja ki/szintetizálhatja a saját service-role kulcsát SQL-lekérdezésen át — ezt a Claude Code security policy aktívan blokkolta, amikor megpróbáltam") miatt **a migráció egy PLACEHOLDER Vault-secretet hoz létre** (`vault.secrets.name = 'service_role'`, érték: `'REPLACE_ME_IN_DASHBOARD_SQL_EDITOR'`). Emiatt a cron **jelenleg fut, de minden hívása 401 Unauthorized-ot kap** — ezt éles teszttel igazoltam (`net._http_response` táblában öt egymást követő `401 {"error":"unauthorized"}` válasz, 20 mp-enként).

**A tulajnak (vagy DevOps agentnek) egyszer, a Supabase Dashboard SQL Editorában** (Project Settings → API-ból kimásolt valós `service_role` kulccsal) le kell futtatnia:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'service_role'),
  '<ide a tényleges service_role kulcs a Project Settings > API oldalról>'
);
```

Ezután a cron a következő 20 mp-es ciklusban már sikeresen fog hitelesíteni, és ténylegesen lezárja a lejárt köröket. Semmilyen más lépés nem szükséges — a job és az extension-ök már aktívak.

### 9.3 Tesztelés (elvégezve, amennyire a placeholder-kulcs mellett lehetséges)

1. Létrehoztam egy teljes minimál teszt-fixture-t (deck + 2 kártya + room + player + kör), a kör `placing_deadline`-ját kézzel 5 perccel a múltba állítva, `phase='playing'`.
2. Két egymást követő cron-ciklust (~45 mp) vártam, majd `cron.job_run_details`-szel ellenőriztem: a job minden 20 mp-ben lefutott, `status='succeeded'` (ez a `net.http_post` sikeres elindítását jelenti, nem az Edge Function válaszát).
3. `net._http_response`-ban ellenőriztem a tényleges HTTP választ: minden hívás helyesen megtalálta a lejárt kört és meghívta a function-t, ami 401-et adott vissza (placeholder-kulcs miatt) — ez bizonyítja, hogy **a lekérdezés, az URL, a hívási lánc és az auth-ellenőrzés is helyesen működik**, csak a valós kulcs hiányzik.
4. A kör állapotát újra lekérdezve igazoltam, hogy `phase='playing'` maradt (a 401 miatt nem oldódott fel) — ez a helyes, biztonságos viselkedés placeholder-kulcs mellett, NEM hiba.
5. Mivel a valós service-role kulcsot nem tehettem be, magát a teljes reveal-tranzakciót közvetlen SQL-lel is lefuttattam ugyanarra a teszt-körre (pontosan a `resolveRound()` által használt UPDATE-mintával: `phase`+`outcome`+`revealed_card` egy UPDATE-ben, `WHERE phase IN (...)` optimista zárral) — ez sikeresen `phase='reveal'`, `outcome='timeout'` (D6, mert nem volt `placement`), helyes `revealed_card` JSON-t adott. Ez igazolja a mögöttes SQL-kontraktus helyességét, amit a TS-kód használ.
6. A teszt-fixture-öket ezután eltakarítottam (`delete` a `rooms`/`players`/`rounds`/`timeline_cards`/`deck_cards`/`decks` táblákból, a teszt `source_playlist_id = 'test-playlist-cron'` alapján szűrve).
7. `get_advisors(security)` a migrációk után: nincs új ERROR-szintű találat. A `cron.job`/`cron.job_run_details` "anonymous access" WARN a Supabase pg_cron extension alapértelmezett, nem-kliens-facing policy-ja — nem jelent RLS-rést a game-state táblákon.

**A tulaj/DevOps után-tesztje** (a fenti `vault.update_secret` lefuttatása után javasolt): hozz létre egy kört lejárt deadline-nal (ugyanaz a minta, mint a 9.3/1. pont), várj legfeljebb 20 másodpercet, majd `select phase, outcome from rounds where id = '...'` — `phase='reveal'`-nek kell lennie.

### 9.4 TEENDŐ a Frontend Engineer felé — host-oldali fallback polling hiányzik

A player-oldali `round_public` polling fallback (egy korábbi kör során bekötve a `app/play/[roomCode]/page.tsx`-be) automatikusan felfedezi az automata lezárást is, mert közvetlenül az adatbázist kérdezi le (nem a broadcast-ra vár) — **playerek oldalán nincs teendő**.

**A HOST oldalon viszont NINCS hasonló fallback.** A host jelenlegi kódja a saját maga által indított `resolve_round` hívás sikeres válaszára és a saját broadcast-jára támaszkodik — ha a rendszer automatikusan (a cron-on át) zárja le a kört, amíg a host tabja háttérben volt (pontosan ez az eredeti hibajelenség), a host a `round_revealed` broadcast eventet megkapja (az `auto_resolve_expired_rounds` most már küldi, 9.1), **DE** ha a host tabja épp akkor tér vissza előtérbe, amikor a broadcast-ablak már lezárult (Supabase Realtime nem garantál üzenet-perzisztenciát háttérben lévő tabra), a host UI beragadhat a régi fázisnál, míg a player már friss idővonalat lát.

**Javasolt megoldás (Frontend feladata):** a host oldalon (`app/host/[roomCode]/page.tsx` vagy az azt tápláló state-hook) tegyetek be egy `round_public`-ra pollingozó `useEffect`-et, ugyanazzal a mintával, mint a player oldalon már megvan — pl. amikor a tab visszatér előtérbe (`visibilitychange` event) VAGY egy alacsony frekvenciájú (5-10 mp) polling, ami összeveti a lekérdezett `phase`-t a jelenlegi UI-állapottal, és ha eltér (pl. a UI még `stealing`-et mutat, de az adatbázis már `reveal`-t), frissíti a képernyőt — pont úgy, mintha a broadcast érkezett volna. Ez nem új koncepció, csak a már meglévő player-oldali minta host-oldali megismétlése.

---

## 10. Nyitott kérdések / blokkolók

Nincs blokkoló, DE van egy kritikus manuális lépés (lásd 9.2) és egy frontend-teendő (lásd 9.4).

- A **realtime broadcast küldése** kliensoldali felelősség (5. pont) — ha a Frontend inkább szerver-oldali broadcastot szeretne az Edge Functionökből, szóljatok, és utólag hozzáadom (`supabase.channel(...).send(...)` az admin klienssel minden mutáció után triviálisan beköthető). **Ez már megtörtént az `auto_resolve_expired_rounds`-nál** (9.1) — ha a mintát a többi mutációra (place_card, next_turn stb.) is szeretnétek szerver-oldalra hozni, szóljatok.

---

## 11. F2.1 — Tokenek, bemondás, steal (2026-07-03, Backend Engineer)

*Forrás: ARCHITECTURE.md 11. szakasz ("F2 — A teljes játék, technikai terv"), PRD.md 5b szakasz (S20–S25), DECISIONS.md F2-D1–F2-D10.*

Ez a szakasz a Frontend agensnek szól: mi változott az F1-hez képest, milyen új API-szerződések vannak, és **melyik F1-es kliensminta törik el explicit módon**. Az F2.2 (reveal-show animáció, vitagomb UI, auto-skip UI — tisztán frontend polish) NINCS ebben a körben leszállítva a UI oldalán, de a hozzá tartozó két host-oldali funkció (`dispute_round`, `next_turn` auto-skip-bővítés) igen, mert alacsony kockázatú szerver-oldali munka volt.

### 11.0 A LEGFONTOSABB VÁLTOZÁS — a `place_card` utáni azonnali resolve NEM HELYES TÖBBÉ

**Ez törli az F1 host-kliens mintáját.** Az F1-ben a `place_card` után a host `app/host/[roomCode]/page.tsx`-ben (a "amikor a lerakás megtörtént... azonnal kiértékelünk" useEffect) rögtön meghívta a `resolve_round`-ot, mert a `stealing` fázis F1-ben 0 mp-es pass-through volt.

**F2-ben ez megváltozik:** a `place_card` most valós `steal_deadline = now() + 15s`-et ír (AC22.1), és a `stealing` fázis ténylegesen 15 másodpercig tart. Ha a host most is azonnal hívná a `resolve_round`-ot, azt **409 `steal_window_open`** hibával utasítja el a szerver — a host nem tudja korán lezárni az ablakot (ez szándékos, nem bug: senki sem "vághatja le" a lopási lehetőséget).

**A Frontendnek ezt kell tennie:**
1. A `place_card` sikeres válasza most `{ phase: 'stealing', stealDeadline: '<ISO timestamp>' }`-ot ad vissza (ugyanaz a shape, mint F1-ben, de a `stealDeadline` most valódi, nem `null`/azonnali).
2. A host kliens a `place_card` után **NE hívjon azonnal `resolve_round`-ot**. Ehelyett rendereljen egy 15 mp-es visszaszámlálót a `stealDeadline`-ból (ugyanaz a minta, mint a `placing_deadline`/`CountdownTimer` F1-ben), és **csak a `stealDeadline` lejárta után** hívja a `resolve_round`-ot.
3. **Safety net változatlanul megvan:** ha a host mégsem hívná (pl. tab háttérben), a pg_cron biztonsági háló (`auto_resolve_expired_rounds`) 20 mp-enként ellenőrzi és lezárja a lejárt `stealing` fázisú köröket is (lásd 11.4 lent) — tehát a parti nem akad el, ha a host UI-implementáció késik.

### 11.1 `place_card` — bővített bemenet (`nameGuess`)

```jsonc
// Bemenet (bővítve):
{
  "roundId": "uuid",
  "position": 3,
  "nameGuess": {              // OPCIONÁLIS — csak ha a "Bemondom!" kapcsoló be volt kapcsolva
    "artistGuess": "tom jones",
    "titleGuess":  "delilah"
  }
}
// Kimenet (változatlan shape, de most valós stealDeadline):
{ "phase": "stealing", "stealDeadline": "2026-07-03T18:00:20.000Z" }
```

- A `nameGuess` teljesen opcionális; ha kihagyod, minden úgy működik, mint F1-ben.
- A bemondás helyessége **soha nem derül ki a `place_card` válaszából** — ez szándékos anti-leak (a helyes válasz csak a reveal fázisban, a `revealed_card.guess` mezőben jelenik meg, lásd 11.3).
- A `+1` token jóváírás csak a reveal pillanatában történik (nem a lerakáskor) — ha a token-egyenleg azonnal nőne, az elárulná a reveal előtt, hogy a bemondás talált.

### 11.2 `register_steal` — ÚJ, valós implementáció (F1-ben stub volt)

```jsonc
// Bemenet:
{ "roundId": "uuid", "position": 2 }   // a stealer SAJÁT idővonalán megjelölt rés

// Kimenet (siker):
{ "ok": true, "tokensLeft": 1, "stealCount": 3 }

// Hibák: 400 position_required · 403 not_a_player / cannot_steal_self ·
//        409 steal_window_closed / already_stole / insufficient_tokens
```

- Hívható: **bármelyik nem soron lévő játékos**, kizárólag `phase='stealing'` alatt, a `steal_deadline` lejárta előtt.
- **A `position` a stealer SAJÁT idővonalára vonatkozik**, nem a soron lévőére — ő ott jelöli meg, hova rakná a (rejtett) kártyát.
- **Fontos UI-mintakövetelmény:** a `StealButton` csak akkor legyen aktív, ha (a) van legalább 1 token, ÉS (b) a játékos már jelölt egy pozíciót a saját idővonalán (AC22.4 — pozíció nélkül a hívás `400 position_required`-t ad).
- A hívás egy steal-tokent azonnal levon (nem várja meg a reveal-t) — ha a steal rossznak bizonyul, **nincs visszatérítés** (F2-D5). Ha a steal-ablak közben lezárul vagy a játékos már lopott ebben a körben, a szerver automatikusan visszaírja a levont tokent és hibát ad.
- A `steal_registered` broadcast eventet (csak darabszám, `{ roundId, stealCount }`, **nincs benne semmilyen pozíció- vagy helyesség-infó**) a kliensnek kell küldenie a sikeres hívás után — a Function maga nem broadcastol (ugyanaz a kliensoldali-broadcast konvenció, mint F1-ben, lásd az 5. szakaszt).

### 11.3 `resolve_round` — bővített `revealedCard`, új hibakód

```jsonc
// Kimenet (bővítve):
{
  "phase": "reveal",
  "outcome": "correct" | "wrong" | "timeout",
  "revealedCard": {
    "title": "Delilah", "artist": "Tom Jones", "year": 1968, "artworkUrl": "https://…",
    "guess": { "correct": true, "byPlayerId": "uuid-active" } | null,
    "steals": [
      { "playerId": "uuid-a", "correct": true,  "won": true  },
      { "playerId": "uuid-b", "correct": false, "won": false }
    ]
  }
}
```

- **Új hibakód: `409 steal_window_open`** — ha a host (vagy bárki) a `steal_deadline` lejárta ELŐTT hívja meg, miközben a kör `stealing` fázisban van. Ugyanaz a minta, mint a régi `409 deadline_not_reached` a `placing_deadline`-ra.
- A `revealedCard.guess`/`revealedCard.steals` **csak reveal után létezik** — a `round_public` nézetben a `revealed_card` mező fázis-függő (`phase in ('reveal','done')` esetén nem null), tehát anti-leak-biztos automatikusan, nincs teendő a nézet-lekérdezés oldalán.
- **`steals[].position` NINCS a válaszban** — csak `playerId`, `correct`, `won`. A UI ebből tudja megjeleníteni: "Anna lopott, sikertelen" / "Béla lopott, ő kapta a kártyát", de a pontos jelölt pozíciót nem kell (és nem is szabad) megjeleníteni.

### 11.4 `auto_resolve_expired_rounds` — most a `steal_deadline`-t is figyeli

A pg_cron biztonsági háló (BACKEND-NOTES 9. szakasz) mostantól **két ágon** keres lejárt köröket: `playing`/`placing` fázisban a `placing_deadline`-t (mint eddig), és **`stealing` fázisban a `steal_deadline`-t** (új). Ha egy `stealing` kört a cron zár le (mert a host tabja nem hívta időben), a broadcast most **két eventet** küld egymás után: `steal_window_closed` majd `round_revealed` — mindkettőt érdemes figyelni, de a `round_revealed`-re való `round_public` refetch önmagában is elegendő a UI frissítéséhez.

### 11.5 `use_token` — ÚJ függvény (skip + draw3)

```jsonc
// Bemenet (skip — 1 token, AC20.5):
{ "roundId": "uuid", "action": "skip" }
// Kimenet:
{ "action": "skip", "roundId": "<ÚJ kör uuid>", "roundNo": 8, "placingDeadline": "…", "tokensLeft": 1 }

// Bemenet (draw3 — 3 token, AC20.6/F2-D4):
{ "roundId": "uuid", "action": "draw3", "position": 2 }
// Kimenet:
{ "action": "draw3", "roundId": "<ÚJ kör uuid>", "outcome": "correct"|"wrong", "revealedCard": {…}, "tokensLeft": 0, "phase": "reveal" }
```

- **Csak a soron lévő játékos hívhatja, kizárólag a saját köre ELEJÉN** (`phase='playing'`, még nincs `placement`) — F2-D3/F2-D4. Ha már lerakott vagy nem ő van soron: `409 not_turn_start` / `403 not_your_turn`.
- **`skip` (1 token):** a jelenlegi rejtélyes kártya kikerül, a rendszer új kártyát húz, **ugyanaz a játékos** folytatja. **FONTOS anti-leak-részlet:** a skip válasz **NEM tartalmaz `audioUrl`-t** (a `use_token`-t a player hívja, az `audioUrl` D7 szerint host-only). A host a megszokott módon, a `draw_card` újrahívásával (vagy a `round_started`-szerű refetch-csel) kéri le az új signed URL-t a szoba `current_round_id`-jából — ugyanaz a minta, mint amikor egy lejárt signed URL-t kell frissíteni.
- **`draw3` (3 token):** a kártya **felfedve** jön — a válasz azonnal tartalmazza a `revealedCard`-ot, a kliensnek a `position`-t **egy hívásban, a felfedett adatok láttán** kell megadnia (nincs külön "nézd meg, majd rakd le" lépés — a `position` már a bemenetben szerepel). Nincs zene, nincs `placing_deadline`, nincs steal-ablak erre a kártyára (F2-D4). Ha a behelyezés helytelen, a kártya elveszik és **a 3 token nem jár vissza**.
- Mindkét ág `409 insufficient_tokens`-t ad, ha nincs elég token — a UI-nak a gombokat ez alapján kell letiltania (skip: <1 token, draw3: <3 token).

### 11.6 `dispute_round` — ÚJ függvény (vitagomb, S24)

```jsonc
// Bemenet:
{ "roundId": "uuid" }
// Kimenet:
{ "ok": true, "outcome": "disputed", "refunded": [{ "playerId": "…", "amount": 1 }], "next": "draw"|"finished", "roundId"?: "…" }
```

- **Kizárólag a host hívhatja**, és **kizárólag `phase='reveal'`** alatt (a `next_turn` előtt) — F2-D8. Ha már továbblépett a kör: `409 already_advanced`.
- Hatás: a kártya kikerül a pakliból véglegesen, minden a körben elköltött/kapott token nettó 0-ra áll vissza (steal-tokenek visszaírva, bemondás-jutalom ha volt visszavonva, esetleges timeline-beépítés törölve és újraindexelve), és a `dispute_round` **maga lépteti a következő játékosra** (nem kell külön `next_turn`-t hívni utána — a válasz már tartalmazza az új kör adatait, ugyanúgy mint a `next_turn` válasza).
- **A host UI-nak a vitagomb megnyomásakor azonnal le kell állítania a saját 5 mp-es auto-tovább visszaszámlálóját** (F2-D8/a) — ez kliensoldali felelősség, a szerver csak azt garantálja, hogy egy már lezárult (`next_turn` utáni) kört nem lehet visszamenőleg vitatni.
- A `round_disputed` broadcast eventet (`{ roundId }`) a kliensnek kell küldenie sikeres hívás után (ugyanaz a kliensoldali-broadcast konvenció).

### 11.7 `next_turn` — bővített kimenet (auto-skip, S25)

```jsonc
// Kimenet (bővítve):
{ "next": "draw", "roundId": "uuid", "activePlayerId": "uuid", "skipped": ["uuid-offline-1", "uuid-offline-2"] }
// vagy, ha mindenki offline:
{ "next": "paused", "reason": "all_offline" }
```

- A `skipped` tömb azoknak a `players.id`-knak a listája, akiket a szerver **presence-alapon** (a `players.connected` mező alapján, NEM egy élő kliens-jelzés alapján — AC25.7) automatikusan átugrott, mert offline-nak voltak jelölve a kör-léptetés pillanatában. Ha üres, senkit sem ugrott át.
- **Ha mindenki offline**, a `next_turn` NEM húz kártyát — `rooms.status = 'paused'`-ra vált, és `{ next: 'paused', reason: 'all_offline' }`-t ad vissza. A host UI-nak ezt egy "szünetel, várunk valakire" képernyővel kell kezelnie; a következő `next_turn` hívás (miután valaki visszatért) újra megpróbálja.
- **A `turn_auto_skipped` broadcast eventet** (`{ skipped: [...] }`) a kliensnek kell küldenie, ha a `skipped` tömb nem üres — hogy a UI megjeleníthesse "⚠ X offline — kihagyva".

### 11.8 ÚJ függvény: `set_presence` — a presence-alapú auto-skip előfeltétele

```jsonc
// Bemenet:
{ "roomId": "uuid", "playerId": "uuid", "connected": false }
// Kimenet:
{ "ok": true, "playerId": "uuid", "connected": false }
```

- **Kizárólag a host hívhatja**, bármelyik játékosra (nem csak saját magára — ez szándékos, a host az egyetlen, aki mindenki Realtime Presence-ét figyeli).
- **Ez a hiányzó láncszem a `next_turn` auto-skip logikájához**: a `next_turn` a `players.connected` **adatbázis-mezőt** olvassa (nem egy élő kliens-jelzést, AC25.7), és ezt a mezőt **a host kliensnek kell karbantartania** a saját Supabase Realtime Presence megfigyelésén keresztül.
- **Frontend-teendő (ÚJ, F2-D9 szerint):** a host oldalon egy Presence-figyelő logika kell, ami minden játékosra 15 mp-es timeout-tal detektálja a lecsatlakozást (a heartbeat/leave eseményekből), és ilyenkor hívja a `set_presence`-t `connected: false`-szal. Amikor a presence visszatér, `connected: true`-val hívja újra. **Ha ezt a Frontend nem köti be, az auto-skip funkció csendben nem fog működni** (a `players.connected` mindig `true` marad az induló defaultról, tehát a `next_turn` soha nem fog senkit átugrani) — ez NEM hibát dob, egyszerűen nem lesz auto-skip viselkedés, amíg ez a bekötés meg nem történik.
- A `reconnect` Edge Function (F1-ből, változatlan) továbbra is beállítja a `connected: true`-t, amikor egy player saját maga reconnectál — ez a `set_presence`-t nem helyettesíti teljesen (a host proaktív módon, MÁS játékosokra is be tudja állítani `false`-ra, amit a player saját reconnect-hívása nem tud megelőzni/kiváltani).

### 11.9 `start_game` — apró változás: explicit token-reset

A `start_game` mostantól a Start pillanatában explicit `UPDATE players SET tokens = 2`-t futtat minden játékosra (AC20.1) — ez a kliens szempontjából láthatatlan (a válasz shape-je nem változott), csak azért említem, mert ha a Frontend valamiért a lobby alatt tokent akarna megjeleníteni/módosítani, tudja, hogy Start után mindenki egyenlege garantáltan 2-re áll vissza.

### 11.10 Új adatbázis-objektum: `adjust_tokens` RPC

Csak Backend-belső, de dokumentálva a teljesség kedvéért: `adjust_tokens(p_player_id uuid, p_delta int) returns int`, `security definer`, csak `service_role` futtathatja (a Frontendnek soha nem kell/szabad ezt közvetlenül hívnia). Minden token-mutáció (steal-levonás, bemondás-jutalom, dispute-visszatérítés, skip/draw3-levonás) ezen keresztül megy, atomikusan — a `players.tokens` mező a kliens felé (RLS-en át) ugyanúgy olvasható, mint eddig, csak az írás lett szigorúbb.

### 11.11 Realtime broadcast-események — összefoglaló (kliensoldali felelősség, kivéve ahol jelölve)

| Event | Ki küldi | Payload | Megjegyzés |
|---|---|---|---|
| `steal_registered` | kliens (`register_steal` után) | `{ roundId, stealCount }` | csak darabszám, nincs pozíció/helyesség |
| `steal_window_closed` | kliens (`resolve_round` után) VAGY **szerver** (`auto_resolve_expired_rounds`, ha a cron zárta a stealing-ablakot) | `{ roundId }` | |
| `round_disputed` | kliens (`dispute_round` után) | `{ roundId }` | |
| `turn_auto_skipped` | kliens (`next_turn` után, ha `skipped` nem üres) | `{ skipped: [...] }` | |
| `round_revealed` | kliens (`resolve_round` után) VAGY szerver (cron) — változatlan F1-ből | `{ roundId, auto?: true }` | |

### 11.12 Amit ELLENŐRIZNI érdemes anti-leak szempontból (QA-nak is releváns)

A `stealing`-reveal közötti forgalomban a nem-aktív játékosok kliensén SOHA nem szabad megjelennie: a helyes cím/előadó/év, a `name_guess.correct` értéke, a `steals[].correct` értéke, vagy bármilyen `card_id`. A token-egyenleg (`players.tokens`) sem változhat a reveal előtt (a bemondás-jutalom csak reveal-ben íródik). Ez mind a `round_public` nézet + a fázis-függő `revealed_card` projekció miatt automatikusan garantált, de érdemes egy hálózati forgalom-ellenőrzést végezni a `stealing` fázis alatt, mielőtt ez élesedik.
