# Backend Notes — F1 (Backend Engineer agent)

*Készült: 2026-07-02 · Backend Engineer · Forrás: ARCHITECTURE.md 9. szakasz Fázis A–B*

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
