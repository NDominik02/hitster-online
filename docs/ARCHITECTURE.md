# Hitster Online — ARCHITECTURE (Műszaki architektúra)

*Munkacím: „Idővonal" · Verzió: 1.0 · Készítette: System Architect agent · Fókusz: F1 (MVP) scope, F2-kész sémával · Forrás: [PLAN.md](PLAN.md), [PRD.md](PRD.md), [DESIGN.md](DESIGN.md), [F0-REPORT.md](F0-REPORT.md), [DECISIONS.md](DECISIONS.md)*

> Ez a dokumentum a véglegesített műszaki terv, amelyből a Backend és Frontend Engineer implementál. Eltérés esetén ezt a doksit frissíteni kell (CLAUDE.md szabály). A `docs/DECISIONS.md` minden döntése (D1–D13) kötelező input; ahol a séma vagy API ezekre épül, ott hivatkozom rá.
>
> **Alapelvek, amelyekre az egész architektúra épül:**
> - **A szerver az igazság forrása.** Minden játéklogika-mutáció Edge Function-ben történik; a kliens SOHA nem írja közvetlenül a játéktáblákat (CLAUDE.md).
> - **Anti-leak (D7):** a fel nem fedett kör kártyájának adata (cím, előadó, év, audio_url) SOHA nem kerülhet a player kliensek felé menő forgalomba a reveal előtt. Ezt RLS + a `rounds` tábla oszlop-szintű tervezése együtt garantálja.
> - **Host ≠ játékos (D5):** külön nézet, külön jogosultság; a host a saját szobája teljes állapotát látja, a player csak a rá tartozó, felfedett részt.
> - **0 Ft költségcél:** Supabase + Vercel free tier; a teljes proxy-streaming F2-re csúszik (D7), F1-ben a Storage-beli stabil URL host-only átadása elég.

---

## 0. Tech stack (véglegesítve, indoklással)

A PLAN.md és CLAUDE.md a stacket lényegében rögzíti; itt csak az architekturálisan releváns indoklást és a finomításokat adom.

| Réteg | Választás | Indoklás (miért ez, nem az alternatíva) |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) + TailwindCSS + dnd-kit + Framer Motion | Egyetlen app két route-tal (`/host`, `/play`); az App Router szerver-komponensei a kezdeti betöltést gyorsítják, de a játékállapot **kliensoldali realtime**. dnd-kit: touch-first drag&drop, `activationConstraint`-tal a görgetés/húzás elkülönítésre (DESIGN 4.1). Alternatíva (react-dnd) nincs touch-first fókusszal → elvetve. |
| **Backend** | Supabase: Postgres + Realtime + Edge Functions (Deno) + Anonymous Auth + Storage | Egyetlen menedzselt platform, free tier, integrált RLS. Az RLS a Postgres-szinten adja az anti-leak garanciát, amit kliens-kód nem tud megkerülni. Külön Node backend felesleges: nincs saját szerver-üzemeltetés, a mutációk Edge Function-ök. |
| **Audio** | Spotify embed preview (`p.scdn.co`) → Supabase Storage áttöltés generáláskor; iTunes fallback (D12) | Lásd 6. szakasz. A Storage a stabilitást (nem tudni, meddig élnek az eredeti linkek) ÉS az anti-leaket (opaque URL, nincs benne metaadat) egyszerre adja. |
| **Realtime** | Supabase Realtime — **Broadcast** (állapot-jelzés + élő húzás) + **Presence** (jelenlét/disconnect) | Broadcast a fázisváltás-értesítéshez (a kliens ilyenkor újraolvassa az állapotot RLS-en át), Presence a `connected` státuszhoz. A Postgres `postgres_changes` replikáció **nem** elég szelektív az anti-leakhez (a fel nem fedett kártyát nem szabad WAL-on kiküldeni), ezért a fázisváltást broadcast-tal jelezzük, és a kliens **RLS-védett SELECT-tel** húzza le, amit szabad látnia. Lásd 4. szakasz. |
| **Hosting** | Vercel (frontend) + Supabase (backend), mindkettő free tier | 0 Ft költségcél. |
| **Auth** | Supabase Anonymous Auth, a JWT localStorage-ben túléli a frissítést (reconnect, D6/S15) | Nincs regisztráció (PRD Persona 2). A `auth.uid()` az RLS és a player-identitás alapja. Lásd 7. szakasz. |

---

## 1. Postgres séma (végleges — CREATE TABLE)

> Konvenciók: minden PK `uuid default gen_random_uuid()`; időbélyegek `timestamptz default now()`. A game-state táblákra **nincs kliens INSERT/UPDATE/DELETE grant** — kizárólag Edge Function írja őket (a Function a service-role kulccsal fut, ami megkerüli az RLS-t). A kliens csak SELECT-el, RLS-en át (2. szakasz). Az F2-kész mezőket `-- F2` jelöli: már a sémában vannak, F1-ben nem használjuk.

```sql
-- =====================================================================
-- Extensions
-- =====================================================================
create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- =====================================================================
-- ENUM típusok
-- =====================================================================
create type room_status as enum ('lobby', 'playing', 'paused', 'finished');
create type round_phase as enum ('playing', 'placing', 'stealing', 'reveal', 'done');
create type card_outcome as enum ('correct', 'wrong', 'timeout', 'disputed');
-- 'disputed' = F2 vitagomb; F1-ben nem állítjuk be, de a típus előre kész.

-- =====================================================================
-- decks — egy generált, újrafelhasználható pakli (playlistből)
-- =====================================================================
create table decks (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  source_playlist_id  text not null,                    -- Spotify playlist id (parse-playlist-id.js)
  source_playlist_url text,
  owner_id            uuid,                              -- auth.uid() of the host who generated it (nullable: shared decks)
  total_tracks        int  not null default 0,          -- a playlist teljes track-száma (riporthoz)
  usable_count        int  not null default 0,          -- év + audio megvan (D4: >= 60 kell)
  coverage_pct        numeric(5,2) not null default 0,  -- usable / total * 100
  is_public           bool not null default true,       -- megosztható link (AC1.5)
  status              text not null default 'ready',     -- 'generating' | 'ready' | 'failed'
  report              jsonb not null default '{}'::jsonb,-- lefedettségi riport: kimaradt számok + okok (CoverageReport)
  created_at          timestamptz not null default now()
);

create index decks_owner_idx           on decks (owner_id);
create index decks_source_playlist_idx on decks (source_playlist_id);

-- =====================================================================
-- deck_cards — egy pakli játszható kártyái (a generálás eredménye)
-- =====================================================================
create table deck_cards (
  id                  uuid primary key default gen_random_uuid(),
  deck_id             uuid not null references decks(id) on delete cascade,
  title               text not null,
  artist              text not null,
  year                int  not null,                    -- csak év-adattal rendelkező kártya kerül be
  year_source         text not null,                    -- 'musicbrainz' | 'itunes' | 'crosschecked'
  year_uncertain      bool not null default false,      -- F0: |MB - iTunes| >= 3 → flag (F0-REPORT 4.)
  audio_url           text not null,                    -- D12: STABIL Supabase Storage-beli URL (nem p.scdn.co!)
  audio_source        text not null,                    -- 'spotify_embed' | 'itunes' (melyikből töltöttük fel)
  artwork_url         text,                             -- albumborító (reveal); külső URL is lehet
  spotify_uri         text,                             -- F2/F3 Premium mód (Web Playback SDK / Connect)
  duration_ms         int,
  sort_seed           double precision not null default random(), -- determinisztikus keverés generáláskor
  created_at          timestamptz not null default now()
);

create index deck_cards_deck_idx on deck_cards (deck_id);
-- FONTOS: erre a táblára NINCS kliens SELECT grant az RLS-ben (2. szakasz):
-- a kártya-metaadat (cím/előadó/év/audio_url) SOHA nem megy ki közvetlenül a kliensnek.
-- A felfedett kártyát a reveal után a rounds/timeline_cards join-olja be, kontrolláltan.

-- =====================================================================
-- rooms — egy játékszoba
-- =====================================================================
create table rooms (
  id                uuid primary key default gen_random_uuid(),
  code              char(4) not null unique,            -- 4 betűs szobakód, nagybetűs (AC3.2)
  host_uid          uuid not null,                      -- auth.uid() of the host device (D5: NEM játékos)
  deck_id           uuid not null references decks(id),
  status            room_status not null default 'lobby',
  settings          jsonb not null default '{}'::jsonb, -- { winTarget:10, timeLimitSec:90, stealEnabled:false }
  current_round_id  uuid,                               -- FK a rounds-ra, körkörös → külön ALTER-rel kötjük
  deck_cursor       int not null default 0,             -- hányadik kártyánál tartunk a kevert pakliban (draw)
  winner_player_ids uuid[] not null default '{}',       -- D3: megosztott győzelem → több győztes
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index rooms_code_active_idx on rooms (code) where status <> 'finished';
-- a kód csak az aktív szobák közt egyedi; befejezett szobák kódja újrahasznosítható.

-- =====================================================================
-- players — egy szoba játékosai (a host NEM itt van, kivéve ha külön belép, D5)
-- =====================================================================
create table players (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references rooms(id) on delete cascade,
  auth_uid     uuid not null,                           -- reconnect kulcs (D6/S15): stabil identitás
  name         text not null,
  color        text not null,                           -- 8 játékos-szín egyike (DESIGN 6.2)
  seat_order   int  not null,                           -- körsorrend (0-alapú), a join sorrendje adja
  tokens       int  not null default 2,                 -- F2: token-rendszer; F1-ben beállítjuk 2-re, de nem használjuk
  connected    bool not null default true,              -- Presence tükrözi ide (S15/AC15.2)
  missed_turns int  not null default 0,                 -- F2 auto-skip számláló; F1-ben nem használt
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index players_room_uid_idx   on players (room_id, auth_uid);   -- egy uid = egy játékos/szoba (S15/AC15.3: nincs duplikátum)
create unique index players_room_color_idx on players (room_id, color);      -- szín-ütközés tiltása (AC5.3)
create unique index players_room_seat_idx  on players (room_id, seat_order);
create index players_room_idx on players (room_id);

-- =====================================================================
-- rounds — egy játékkör (a fázis-gép állapota)
-- =====================================================================
-- ANTI-LEAK KULCS: a card_id NULLABLE és csak a szerver tölti ki, DE a player
-- kliens az RLS-ben SOHA nem látja a card_id-t reveal előtt (2. szakasz).
-- A kártya-metaadatot (cím/előadó/év/audio_url) semmilyen player-facing view
-- nem join-olja be a 'reveal' fázis előtt.
create table rounds (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references rooms(id) on delete cascade,
  round_no         int  not null,
  card_id          uuid references deck_cards(id),      -- a húzott kártya; player RLS elrejti reveal előtt
  active_player_id uuid not null references players(id),-- kinek a köre
  phase            round_phase not null default 'playing',
  placement        int,                                 -- a lerakott rés indexe (place_card írja)
  outcome          card_outcome,                        -- resolve_round tölti ki
  placing_deadline timestamptz,                         -- időlimit vége (draw_card számolja: now + timeLimitSec)
  steal_deadline   timestamptz,                         -- F2 15 mp steal-ablak vége
  name_guess       jsonb,                               -- F2 bemondás { artist, title }
  steals           jsonb not null default '[]'::jsonb,  -- F2 steal-lista [{playerId, position, tokenSpent}]
  revealed_card    jsonb,                               -- reveal-kor IDE másoljuk a publikus kártya-adatot
                                                        --   { title, artist, year, artworkUrl } — EZT látja a player
  created_at       timestamptz not null default now()
);

create unique index rounds_room_no_idx on rounds (room_id, round_no);
create index rounds_room_idx on rounds (room_id);

-- körkörös FK a rooms.current_round_id-ra (a rounds létezése után)
alter table rooms
  add constraint rooms_current_round_fk
  foreign key (current_round_id) references rounds(id) on delete set null;

-- =====================================================================
-- timeline_cards — egy játékos idővonalára beépült kártyák
-- =====================================================================
create table timeline_cards (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  card_id     uuid not null references deck_cards(id),
  position    int  not null,                            -- rendezési index az idővonalon (0-alapú)
  is_start    bool not null default false,              -- a kezdőkártya (S7) jelölése
  placed_round_no int,                                  -- melyik körben került be (null a kezdőkártyánál)
  created_at  timestamptz not null default now()
);

create unique index timeline_cards_player_pos_idx on timeline_cards (player_id, position);
create index timeline_cards_player_idx on timeline_cards (player_id);
-- FONTOS: a timeline_cards SELECT-hez a klienst a card_id-n keresztül a deck_cards
-- adataihoz kell juttatni — de CSAK a MÁR beépült (felfedett) kártyákhoz. Mivel
-- ide csak reveal után kerül sor, ez definíció szerint biztonságos: ami az
-- idővonalon van, az már felfedett. A player-facing hozzáférést egy VIEW adja (2. szakasz).
```

**Séma-döntések, amelyek túlmutatnak a PLAN.md vázlatán (indoklással):**

1. **`deck_cards.audio_url` = Storage-beli stabil URL, nem `p.scdn.co` (D12).** A PLAN vázlat `preview_token`-t írt; a D12 döntés alapján a generáláskor áttöltjük a Spotify embed MP3-at Supabase Storage-ba, és az `audio_url` erre a stabil, opaque URL-re mutat. `audio_source` rögzíti, spotify_embed-ből vagy iTunes-fallbackből jött-e (6. szakasz).
2. **`rooms.deck_cursor` + `deck_cards.sort_seed`.** A pakli-keverést generáláskor determinisztikussá tesszük (`sort_seed`), a `draw_card` a `deck_cursor`-t lépteti — így a húzás sorrendje szerver-oldali, kliens nem tudja előre a következő kártyát (anti-leak támogatás).
3. **`rounds.revealed_card` jsonb.** Ez a **kritikus anti-leak mező**: a reveal pillanatában a `resolve_round` ide **másolja** a kártya publikus adatait ({title, artist, year, artworkUrl}). A player kliens RLS-ben CSAK ezt a mezőt (és a `phase = reveal`-t) látja — a `card_id`-t és a `deck_cards` sort soha. Így fizikailag lehetetlen, hogy a kliens reveal előtt lássa a megfejtést.
4. **`tokens`, `missed_turns`, `steals`, `name_guess`, `steal_deadline`, `disputed` — mind F2-kész, F1-ben inaktív.** A prompt kérése szerint séma-szinten már megvannak, hogy F2-ben ne kelljen migrálni.
5. **`winner_player_ids uuid[]` (D3):** megosztott győzelem → tömb, nem egyetlen FK.

---

## 2. RLS policy-k (row-level security)

> Elv: **default deny.** Minden game-state táblán RLS engedélyezve, és a kliensnek CSAK olvasási (SELECT) policy-ja van, az is szűkítve. Írás nincs: a mutációkat az Edge Function service-role kulccsal végzi, ami megkerüli az RLS-t (`bypassrls`). Az `anon`/`authenticated` role-oknak nincs INSERT/UPDATE/DELETE grantja a game-state táblákra.

```sql
alter table decks          enable row level security;
alter table deck_cards     enable row level security;
alter table rooms          enable row level security;
alter table players        enable row level security;
alter table rounds         enable row level security;
alter table timeline_cards enable row level security;
```

### 2.1 Segéd: „ehhez a szobához tartozom-e?"

A policy-k egy stabil kritériumra épülnek: a hívó `auth.uid()`-je vagy a szoba **hostja** (`rooms.host_uid`), vagy **játékosa** (`players.auth_uid`). Ezt egy `security definer` függvénnyel kapszulázzuk (elkerüli a policy-beli rekurzív self-join gondokat):

```sql
create or replace function is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms  r where r.id = p_room_id and r.host_uid = auth.uid())
      or exists (select 1 from players p where p.room_id = p_room_id and p.auth_uid = auth.uid());
$$;

create or replace function is_room_host(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms r where r.id = p_room_id and r.host_uid = auth.uid());
$$;
```

### 2.2 `decks` — publikus vagy saját pakli olvasható

```sql
create policy decks_select on decks for select to authenticated
  using ( is_public = true or owner_id = auth.uid() );
```
- A generált pakli metaadata (név, lefedettség, riport) látható a hostnak és — ha `is_public` — link útján bárkinek (AC1.5 megosztás). A `deck_cards` NEM válik ezzel láthatóvá (külön tábla, saját policy).

### 2.3 `deck_cards` — a kliens SOHA nem olvassa közvetlenül (anti-leak mag)

```sql
-- SZÁNDÉKOSAN NINCS SELECT POLICY az anon/authenticated role-nak.
-- Így RLS-default-deny miatt egyetlen kliens sem SELECT-elhet deck_cards sort.
-- A kártya-adatokhoz kizárólag a kontrollált csatornákon lehet hozzáférni:
--   - reveal után: rounds.revealed_card jsonb (a szerver másolta be),
--   - idővonalra beépült kártya: player_timeline_view (2.7), csak felfedett kártyák.
-- Az Edge Function (service-role) természetesen mindent lát.
```
- **Ez a döntés implementálja az AC8.3 / AC11.3 / Success-metric „Anti-leak"-et a legerősebb szinten:** a fel nem fedett kártya adata sosem hagyja el a szervert player-facing SELECT-ben, mert a tábla egyáltalán nem olvasható kliensről. A host sem olvassa közvetlenül — ő a preview URL-t Edge Function válaszban kapja (2.8 + 6.4).

### 2.4 `rooms` — a szoba tagjai látják

```sql
create policy rooms_select on rooms for select to authenticated
  using ( is_room_member(id) );
```
- A host és a szoba játékosai látják a szoba állapotát (`status`, `settings`, `current_round_id`, `deck_cursor`, `winner_player_ids`). A `deck_cursor` nem árul el kártya-adatot (csak indexet), így biztonságos.
- **Fontos:** a `rooms` SELECT-hez a lobby-ban a csatlakozáshoz a kód-alapú lookupot NEM ez adja (a csatlakozó még nem tag) — azt a `join_room` Edge Function végzi (3.3), ami service-role-lal keres kódra. A kliens sosem kérdez le szobát puszta kódra RLS-en át (nem is tudná: nem tag).

### 2.5 `players` — a szoba tagjai látják egymást

```sql
create policy players_select on players for select to authenticated
  using ( is_room_member(room_id) );
```
- A lobby-lista (név + szín + connected) és a host H4 nézet minden játékost lát a szobán belül (AC6.1). A `tokens`/`missed_turns` mezők is kimennek, de F1-ben nem jelenítjük meg (DESIGN: ⟨F2⟩ hely).
- Más szoba játékosait senki nem látja.

### 2.6 `rounds` — tagok látják, DE a fel nem fedett kártya rejtve

Ez a legkényesebb tábla. A `rounds` sorban van `card_id` (a megfejtés kulcsa). Két mechanizmust kombinálunk:

**(a) Player-facing VIEW, oszlop-szintű szűréssel** — a player kliens NEM a `rounds` táblát olvassa, hanem egy nézetet, amely a `card_id`-t soha nem adja ki, a `revealed_card`-ot pedig csak `reveal`/`done` fázisban:

```sql
create view round_public as
  select
    r.id, r.room_id, r.round_no, r.active_player_id, r.phase,
    r.placement, r.outcome, r.placing_deadline, r.steal_deadline,
    -- a megfejtés CSAK reveal/done fázisban:
    case when r.phase in ('reveal','done') then r.revealed_card else null end as revealed_card
    -- card_id, name_guess (F2), steals belső mezők NEM szerepelnek a nézetben
  from rounds r;

alter view round_public set (security_invoker = true);  -- a hívó RLS-ével fut

create policy rounds_member_select on rounds for select to authenticated
  using ( is_room_member(room_id) );
```
- A `security_invoker` miatt a nézet a hívó jogaival fut, tehát a `rounds` RLS is érvényes rajta (tag-e). A nézet **oszlop-projekcióval** garantálja, hogy a `card_id` és a belső mezők soha nem hagyják el a szervert player felé.
- A `case when phase in ('reveal','done')` garantálja, hogy a `revealed_card` (title/artist/year/artwork) csak a reveal pillanatától látszik. A `resolve_round` a `phase = reveal`-t és a `revealed_card` beírását **egy tranzakcióban** végzi (3.6), így nincs olyan pillanat, amikor a fázis már reveal, de az adat még nincs meg — vagy fordítva.
- **A kliens kód konvenciója:** a player app KIZÁRÓLAG a `round_public` nézetet kérdezi, sosem a `rounds` táblát. (A `rounds` táblára is van SELECT policy tagoknak, mert a host oldali admin-lekérdezésekhez kell — de a `card_id` a host kliensnek sem szükséges, ezért a host is a nézetet használja a UI-hoz; a tényleges kártya-adatot a host az Edge Function draw válaszából kapja, lásd 2.8.)

**(b) Realtime nem replikálja a `rounds` táblát.** A `rounds` táblára NEM engedélyezünk `postgres_changes` realtime publikációt (különben a WAL kiküldené a `card_id`-t is). A fázisváltást broadcast-tal jelezzük, és a kliens a `round_public` nézetből olvassa újra az állapotot (4. szakasz). Így a WWW-forgalomban sosem jelenik meg a fel nem fedett `card_id`.

### 2.7 `timeline_cards` — csak felfedett, beépült kártyák, tag által

Az idővonalon lévő kártya definíció szerint már felfedett (reveal után került be). A kliensnek látnia kell az évet (mindenki idővonalán) és a saját kártyái címét/előadóját. A `deck_cards` viszont nem olvasható közvetlenül (2.3). Megoldás: **egy `security definer` nézet**, amely a beépült kártyák publikus mezőit adja (title/artist/year/artwork), de a `deck_cards` egyéb mezőit (audio_url, spotify_uri) nem:

```sql
create view timeline_public
with (security_invoker = false) as   -- definer: a nézet férhet a deck_cards-hoz, a kliens nem közvetlenül
  select
    tc.id, tc.player_id, tc.position, tc.is_start, tc.placed_round_no,
    p.room_id,
    dc.title, dc.artist, dc.year, dc.artwork_url
    -- audio_url, spotify_uri SZÁNDÉKOSAN kimarad
  from timeline_cards tc
  join players p    on p.id = tc.player_id
  join deck_cards dc on dc.id = tc.card_id;

-- a nézeten a szoba-tagság szűrést policy-szerű WHERE-rel kell adni; mivel definer,
-- a hozzáférést egy wrapper RLS-sel a timeline_cards-on tartjuk kézben:
create policy timeline_member_select on timeline_cards for select to authenticated
  using ( exists (select 1 from players p where p.id = player_id and is_room_member(p.room_id)) );
```
- **Miért definer nézet:** a nézetnek join-olnia kell a `deck_cards`-hoz (amit a kliens közvetlenül nem olvashat), de csak a publikus mezőket (title/artist/year/artwork) exponálja, az `audio_url`/`spotify_uri`-t nem. Ez biztonságos, mert az idővonalra csak felfedett kártya kerül. A tagság-szűrést a kliens a `where room_id = ...` feltétellel + a `timeline_cards` RLS-ével együtt kapja meg. (Implementációs megjegyzés a Backendnek: definer nézetnél a tagság-szűrést a lekérdezésbe kell tenni; ha ez kockázatosnak tűnik, alternatíva egy `security definer` RPC függvény, amely paraméterként kapja a `room_id`-t és ellenőrzi a tagságot — lásd Implementációs jegyzék.)

### 2.8 A host és a preview URL (D7 anti-leak)

- A player kliens a `deck_cards.audio_url`-t **soha** nem kapja meg (2.3: nincs SELECT policy). A host kliensnek **kell** az audio_url, hogy lejátssza a preview-t — de a host sem a `deck_cards`-ból olvassa (az RLS neki is tiltja), hanem a **`draw_card` Edge Function válaszában** kapja meg, közvetlenül (3.5). Így a preview URL csak egyetlen kliensnek (a hostnak) és csak Edge Function válaszban jelenik meg, RLS-sel védve a többiek elől (D7).
- F1-ben ez elég (D7: nincs teljes streaming-proxy). A Storage URL opaque (nem tartalmaz cím/előadó-metaadatot, F0-REPORT 5.), így ha valaki elkapná is, a megfejtést nem árulja el — csak a hangot.

---

## 3. Edge Functions (végleges API)

> Minden Edge Function Deno-ban fut, service-role kulccsal (megkerüli az RLS-t, ő az egyetlen, aki írhat game-state-et). Minden hívás elején **JWT-ellenőrzés** (`auth.uid()`) + jogosultság-ellenőrzés (a lenti „Jogosultság" pontok). A fázis-átmenetek **optimista zárral** védettek: az UPDATE mindig tartalmaz egy `where phase = <elvárt> and id = <round_id>` feltételt, és ha 0 sort érint, a hívás versenyhelyzet-hibát ad vissza (PLAN 5.: „round_id + phase optimista zár").

### Áttekintő táblázat

| Function | Hívó | Fázis-átmenet | Fő jogosultság-ellenőrzés |
|---|---|---|---|
| `generate_deck` | host | — (pakli, nem kör) | bármely authenticated; rate-limit |
| `create_room` | host | — → `lobby` | authenticated; a deck usable_count ≥ 60 (D4) |
| `join_room` | player | `lobby` | authenticated; szoba `lobby`, < 8 játékos, szabad szín |
| `start_game` | host | `lobby` → `playing` (+ első `draw`) | **csak host**; ≥ 2 játékos (D5) |
| `draw_card` | szerver* | új `rounds`, `phase=playing` | csak host (vagy szerver-trigger next_turn-ből) |
| `place_card` | player | `playing`/`placing` → `stealing` | csak `active_player_id`; a kör aktív |
| `register_steal` | player | `stealing` (F2-STUB) | **F2 — nem implementált**, csak a helye |
| `resolve_round` | szerver* | `stealing`/`placing` → `reveal` | csak host vagy szerver-timer |
| `next_turn` | szerver* | `reveal`/`done` → új kör vagy `finished` | csak host vagy szerver-timer |
| `leave_room` / `reconnect` | player | — (presence) | a saját `auth_uid` sorára |

*„szerver": F1-ben ezeket a host kliens hívja meg a megfelelő pillanatban (pl. az időlimit lejártakor a host hívja a `resolve_round`-ot), mert nincs külön szerver-scheduler a free tierben. A `placing_deadline`/`steal_deadline` szerver-oldali időbélyeg biztosítja, hogy a host ne tudjon csalni az időzítéssel: a `resolve_round` ellenőrzi, hogy a deadline tényleg lejárt-e. Lásd „Időzítés" a 3.10-ben.

---

### 3.1 `generate_deck` — pakli-generálás (a pipeline Edge Function-ná alakítva)

A `tools/deck-pipeline/` prototípus logikáját portoljuk (NEM találjuk ki újra). A 3 lépés + a D12 Storage-áttöltés:

**Bemenet:**
```json
{ "playlistUrl": "https://open.spotify.com/playlist/63bLUR4eamvtD9ArI4LFy9" }
```
**Kimenet (végleges, sikeres):**
```json
{
  "deckId": "uuid",
  "name": "🎤",
  "totalTracks": 100,
  "usableCount": 94,
  "coveragePct": 94.0,
  "meetsMinimum": true,           // usableCount >= 60 (D4)
  "excluded": [
    { "title": "…", "artist": "…", "reason": "no_preview" },
    { "title": "…", "artist": "…", "reason": "no_year" }
  ],
  "uncertainYearCount": 21        // F0-REPORT 4.: bizonytalan-év flag
}
```
**Progress (streaming):** a H2 GenerationProgress komponens élő progresst vár (DESIGN). Mivel az Edge Function-nek van időkorlátja és a MusicBrainz 1 req/s miatt egy 100-as pakli ~2+ perc, a generálás **aszinkron**: a Function létrehoz egy `decks` sort `status='generating'` állapottal, majd háttérben dolgozik, és a `decks.report` mezőt inkrementálisan frissíti (`{ processed, total, currentStep }`). A host kliens ezt **pollingozza** (vagy egy dedikált broadcast-csatornán figyeli, 4.5). Kész: `status='ready'`.

> **Architektúra-döntés — a pipeline portolása (a `tools/deck-pipeline/` alapján):**
> A 3 lépés-script logikája szinte változtatás nélkül átemelhető Deno-ba (natív `fetch`, nincs Node-specifikus függés a hálózati részben). A portolás pontjai:
> 1. **1. lépés (playlist → tracks):** `01-fetch-playlist.js` `fetchPlaylistViaEmbed` — a Spotify embed `__NEXT_DATA__` parse. Változatlan. A `spotifyPreviewUrl` (`p.scdn.co`) **itt jön** — ez lesz az elsődleges audio-forrás (D12).
> 2. **2. lépés (évszám):** `02-resolve-years.js` `pickEarliestYear` — MusicBrainz recording-keresés, release-group first-release-date preferálással. **A cache** (`musicbrainz-lookup-cache.json`) helyett egy **globális Postgres cache-tábla** (lásd lentebb) — így a MusicBrainz lassúsága több pakli közt amortizálódik, és a 1 req/s limit globálisan tartható.
> 3. **3. lépés (iTunes):** `03-match-previews.js` — F1-ben **kettős szerepet** kap: (a) fallback preview-forrás (ha nincs Spotify embed preview), (b) **évszám-keresztellenőrzés** (F0-REPORT 4.): az iTunes `releaseDate` évét összevetjük a MusicBrainz-évvel; ha |eltérés| ≥ 3, a korábbit vesszük és `year_uncertain=true`.
> 4. **ÚJ lépés (D12 Storage-áttöltés):** minden játszható tracknél a Function letölti a `p.scdn.co` (vagy iTunes) MP3-at, és feltölti a Supabase Storage `deck-audio/{deckId}/{cardId}.mp3` útvonalra, majd a `deck_cards.audio_url` erre a Storage-URL-re mutat. Lásd 6. szakasz.
>
> **MusicBrainz cache-tábla** (a fájl-cache pótlása, globális):
> ```sql
> create table mb_year_cache (
>   norm_key   text primary key,          -- normalize(title)|normalize(artist)
>   year       int,
>   year_source text,
>   match_score numeric,
>   resolved_at timestamptz default now()
> );
> ```
> A `normalize()` és `similarity()` segédfüggvényeket (util.js) TypeScript-re portoljuk az Edge Function `_shared/` mappájába.

**Rate-limit betartás (AC1.3):** a MusicBrainz 1 req/s-et egy Function-on belül soros `await sleep(1100)` tartja (mint a prototípus). Mivel egy Edge Function invokáció hosszú futású, itt **Supabase háttér-feladatként** (`EdgeRuntime.waitUntil`) fut, hogy ne blokkolja a HTTP-választ. Ha egy pakli túl hosszú (>100 track), a 100-as embed-limit (F0-REPORT) miatt F1-ben a 100 track a felső határ; a lapozás F2 (KÉRDÉS lentebb).

**Hibák:** privát/nem elérhető playlist → `{ error: "playlist_not_public", messageHu: "Csak nyilvános playlist használható…" }` (F0-REPORT: az anonim embed privátnál 404). Érvénytelen URL → `{ error: "invalid_url" }` (AC1.6).

---

### 3.2 `create_room` — szoba létrehozása

**Bemenet:**
```json
{ "deckId": "uuid", "settings": { "winTarget": 10, "timeLimitSec": 90, "stealEnabled": false } }
```
**Kimenet:**
```json
{ "roomId": "uuid", "code": "RGBZ", "status": "lobby" }
```
- **Jogosultság:** authenticated. A hívó `auth.uid()` lesz a `host_uid` (D5: host nem játékos).
- **Ellenőrzés:** a `deck.usable_count >= 60` (D4), különben `{ error: "deck_too_small" }`. Egyedi 4 betűs kód generálása (ütközés esetén újra, a `rooms_code_active_idx` miatt).
- **Fázis:** `status = lobby`.

### 3.3 `join_room` — csatlakozás

**Bemenet:**
```json
{ "code": "RGBZ", "name": "Anna", "color": "#2ECC71" }
```
**Kimenet:**
```json
{ "roomId": "uuid", "playerId": "uuid", "seatOrder": 0, "status": "lobby" }
```
- **Jogosultság:** authenticated. A Function service-role-lal keresi meg a szobát a kódra (a kliens nem tag még, RLS-en át nem látná — 2.4).
- **Ellenőrzés:** szoba létezik és `status = lobby`; játékosszám < 8 (AC5.5) → különben `{ error: "room_full" }`; a szín szabad (AC5.3, `players_room_color_idx`) → különben `{ error: "color_taken" }`; ha ugyanaz az `auth_uid` már bent van → **nem duplikál**, a meglévő sort adja vissza (reconnect-barát, AC15.3).
- **Fázis:** marad `lobby`. `seat_order` = a jelenlegi max+1.

### 3.4 `start_game` — játék indítása

**Bemenet:** `{ "roomId": "uuid" }`
**Kimenet:** `{ "status": "playing", "roundId": "uuid", "activePlayerId": "uuid" }`
- **Jogosultság:** **csak a host** (`is_room_host`). Különben `{ error: "not_host" }`.
- **Ellenőrzés:** ≥ 2 játékos (D5) → különben `{ error: "not_enough_players" }`.
- **Teendő (egy tranzakcióban):**
  1. Minden játékosnak **kezdőkártya** (S7): a kevert pakli tetejéről (`deck_cursor` léptetve) minden játékosnak egy `timeline_cards` sor `is_start=true`, `position=0`. (Minden játékos külön kezdőkártyát kap; a `deck_cursor` ennyivel előre.)
  2. `rooms.status = playing`.
  3. Meghívja a `draw_card`-ot az első körre (belső hívás).
- **Fázis:** `lobby → playing`, majd az első `rounds` sor `phase=playing`.

### 3.5 `draw_card` — kártya húzása (kör kezdete)

**Bemenet:** `{ "roomId": "uuid" }` (belső hívás start_game / next_turn-ből, vagy host indítja)
**Kimenet (CSAK a host kliensnek, ez a D7 anti-leak pont):**
```json
{ "roundId": "uuid", "roundNo": 7, "activePlayerId": "uuid",
  "audioUrl": "https://<supabase>/storage/v1/.../deck-audio/…/….mp3",
  "placingDeadline": "2026-07-02T18:00:00Z" }
```
- **Jogosultság:** csak host / szerver-belső. **Az `audioUrl` KIZÁRÓLAG ebben a válaszban, csak a host felé megy** (D7). A player kliensek a `draw_card`-ot nem hívják és a választ nem kapják.
- **Teendő:** a következő kártyát húzza (`deck_cursor`++), új `rounds` sort ír `card_id`-vel, `phase=playing`, `placing_deadline = now() + settings.timeLimitSec`. A `card_id`-t a player RLS elrejti (2.6).
- **Fázis:** új kör `phase=playing`. Broadcast: „új kör, X köre van" (kártya-adat NÉLKÜL). A host az `audioUrl`-ből elindítja a `<audio>`-t; a player kliensek csak azt tudják, ki van soron.
- **Pakli-kifogyás:** ha nincs több kártya (`deck_cursor >= deck size`), a `draw_card` nem húz, hanem `next_turn` game-end ágára vezet (D3, 3.7 / AC16).

### 3.6 `place_card` — lerakás

**Bemenet:** `{ "roundId": "uuid", "position": 3 }` (a választott rés indexe)
**Kimenet:** `{ "phase": "stealing", "stealDeadline": "…" }` (F1-ben a steal-ablak azonnal lejár → gyakorlatilag reveal felé megy, lásd lent)
- **Jogosultság:** csak a `rounds.active_player_id`-hez tartozó játékos (`players.auth_uid = auth.uid()`), és a kör a hívóé (AC9.4). Különben `{ error: "not_your_turn" }`.
- **Optimista zár:** `update rounds set placement=$pos, phase='stealing' where id=$rid and phase in ('playing','placing') returning *`. Ha 0 sor → `{ error: "phase_conflict" }` (már lerakva/lejárt).
- **Fázis:** `playing → stealing`. **F1-ben a steal ki van kapcsolva (stealEnabled=false),** ezért a `place_card` a `stealing` fázist gyakorlatilag azonnal átugorja: a válasz után a host rögtön `resolve_round`-ot hív (nincs 15 mp ablak). A `stealing` fázis és a `steal_deadline` a sémában és a fázis-gépben marad (F2-kész), de F1-ben 0 mp.
- A **kliens nem írja a táblát** (AC9.3): a `place_card` Edge Function az egyetlen író.

### 3.7 `register_steal` — **F2-STUB (NEM implementálandó F1-ben)**

> **Ez a function F1-ben NEM készül el.** Csak jelzem a helyét a fázis-gépben és az API-felületet, hogy F2-ben a séma és a fázis-átmenet már készen álljon.
>
> **Bemenet (F2):** `{ "roundId": "uuid", "position": 2 }` — a stealer 1 tokenért fogad, hogy a lerakás rossz, és megjelöli a szerinte helyes pozíciót.
> **Fázis (F2):** `stealing` alatt hívható, a `steal_deadline`-ig. A `rounds.steals` jsonb-be fűz, a `players.tokens`-t csökkenti. **Jogosultság:** a szoba játékosa, DE nem az `active_player_id`; van elég tokenje.
> F1-ben a `stealing` fázis 0 mp, ezért ez a függvény sosem hívódik. Ne implementáld.

### 3.8 `resolve_round` — kiértékelés + reveal

**Bemenet:** `{ "roundId": "uuid" }`
**Kimenet:** `{ "phase": "reveal", "outcome": "correct", "revealedCard": { "title":"…","artist":"…","year":1975,"artworkUrl":"…" } }`
- **Jogosultság:** host / szerver-belső. (A player nem hívhatja — ő csak a `round_public` nézetből olvassa az eredményt reveal után.)
- **Teendő (egy tranzakcióban — ez a kritikus anti-leak pillanat, 2.6):**
  1. Betölti a `deck_cards` sort a `card_id`-hez (service-role, ő látja).
  2. **Kiértékelés (S12, S13):** a `placement` rés helyes-e? A kártya `year`-je a szomszédos idővonal-kártyák évei közé esik-e. **Azonos-évszám élsimítás (S13/AC13):** ha a kártya éve megegyezik egy szomszéd évével, mindkét oldal helyes. **Időlimit-lejárat (D6):** ha a `placement` null ÉS a `placing_deadline` lejárt → `outcome='timeout'` (a kártya elveszik). A kiértékelés **kizárólag itt, szerveroldalon** (AC12.3).
  3. Ha `correct`: új `timeline_cards` sor az aktív játékosnak a `position`-nél, a többi kártyát átindexeli. Ha `wrong`/`timeout`: nem épül be (F1-ben steal nélkül egyszerűen kikerül, AC12.2).
  4. **`revealed_card` beírása** ({title, artist, year, artworkUrl}) ÉS `phase='reveal'` ÉS `outcome=…` — **egy UPDATE-ben**, hogy a player egyszerre lássa a fázist és az adatot (nincs leak-rés).
  5. Optimista zár: `where id=$rid and phase in ('stealing','placing','playing')`.
- **Fázis:** `stealing/placing → reveal`. Broadcast: „reveal" → a kliensek újraolvassák a `round_public` nézetet (most már látják a `revealed_card`-ot).

### 3.9 `next_turn` — következő kör vagy játék vége

**Bemenet:** `{ "roomId": "uuid" }` (a host hívja ~5 mp reveal után, DESIGN H5)
**Kimenet:** `{ "next": "draw", "roundId": "uuid" } | { "next": "finished", "winnerPlayerIds": ["uuid"] }`
- **Jogosultság:** host / szerver-belső.
- **Teendő:**
  1. **Győzelem-ellenőrzés (S14/AC14):** ha bármely játékos `timeline_cards` száma ≥ `settings.winTarget` → `rooms.status='finished'`, `winner_player_ids` beállítva. Több egyidejű elérőnél mind győztes (D3).
  2. **Pakli-kifogyás (S16/AC16):** ha nincs több húzható kártya → játék vége; győztes a leghosszabb idővonal; holtversenynél **megosztott győzelem** (D3) → több `winner_player_ids`.
  3. Egyébként: `phase='done'` az előző körre, a `active_player_id` a `seat_order` szerinti következő játékos, majd `draw_card` hívás.
- **Fázis:** `reveal → done`, majd új kör `playing` VAGY `rooms.status=finished`.

### 3.10 `leave_room` / `reconnect` — jelenlét

- **`reconnect`:** a kliens indításkor a localStorage-beli anon JWT-vel autentikál; a Function megkeresi a `players` sort `auth_uid + room` alapján, `connected=true`, `last_seen_at=now()`. Visszaadja a szoba+player állapotot, hogy a kliens folytassa (S15, 7. szakasz). Nincs új sor (AC15.3).
- **`leave_room`:** explicit kilépés (ritka F1-ben); `connected=false`. A tényleges disconnect-detektálás Presence-alapú (4. szakasz), nem ez.

**Időzítés (a „szerver-timer" free tierben):** F1-ben nincs cron/scheduler. A `placing_deadline`/`steal_deadline` **szerver által számolt** `timestamptz`, amit a host kliens figyel, és lejáratkor meghívja a `resolve_round`-ot. A `resolve_round` **ellenőrzi**, hogy a deadline tényleg lejárt-e (nem fogad el korai host-hívást timeout-ként) — így a host nem tud a timerrel csalni. Ez a minimál-megoldás a 0 Ft költségcélhoz; F2-ben pg_cron / Edge scheduler jöhet.

---

## 4. Realtime csatorna-terv

> Elv (2.6b): a fázisváltásokat **broadcast**-tal jelezzük, az állapotot a kliens **RLS-védett SELECT-tel** (a `round_public` / `timeline_public` nézetekből) húzza le. A `postgres_changes` replikációt a `rounds`-ra NEM engedélyezzük (anti-leak: a `card_id` nem mehet WAL-on). A `players`/`rooms` táblákra engedélyezhető `postgres_changes` (nincs bennük titok), de a konzisztencia kedvéért F1-ben egységesen a broadcast+refetch mintát használjuk.

### 4.1 Csatorna: `room:{roomId}` (broadcast)

Egy csatorna szobánként. Minden tag (host + playerek) csatlakozik. Események:

| Event | Küldi | Payload | Ki reagál | Reakció |
|---|---|---|---|---|
| `player_joined` | join_room (Function trigger vagy host) | `{ playerId }` | host | lobby-lista refetch (`players`) |
| `game_started` | start_game | `{ }` | mind | átváltás játék-nézetre; refetch rooms + timeline |
| `round_started` | draw_card | `{ roundId, activePlayerId }` | mind | refetch `round_public`; host indítja az audiót; **kártya-adat NINCS a payloadban** |
| `card_placed` | place_card | `{ roundId }` | mind | refetch `round_public` (phase=stealing/reveal felé) |
| `round_revealed` | resolve_round | `{ roundId }` | mind | refetch `round_public` → most látszik a `revealed_card`; host H5, player P5 |
| `turn_advanced` | next_turn | `{ }` | mind | refetch; új kör vagy győzelem |
| `game_finished` | next_turn | `{ winnerPlayerIds }` | mind | H6 / P5' vég-képernyő |

- **Kulcs anti-leak szabály:** egyetlen broadcast payload sem tartalmaz kártya-metaadatot vagy `card_id`-t. A payload csak „mi történt" jelzés; a „mit szabad látni"-t az RLS dönti el a refetch-nél.

### 4.2 Csatorna: `room:{roomId}:drag` (broadcast — élő húzás, D8)

- **Csak vizuális, nem játékállapot** (AC10.1). A soron lévő player a húzás közben throttle-ölt (~10–15/s) pozíció-eventet küld: `{ slotIndex, playerId }`.
- **Ki hallgatja:** F1-ben **csak a host** (D8: a player telefonokon nem tükrözzük). A host H4-en a `ghostSlotIndex`-et frissíti (PlayerTimelineRow „szellem" kártya, DESIGN 4.2).
- Késés-tűrő (p95 < 500 ms cél, AC10.2): jitter esetén sem okoz hibás állapotot, mert csak a UI-t mozgatja. Interpoláció simítja (DESIGN 4.2).

### 4.3 Presence: `room:{roomId}` presence-state

- Minden kliens `track({ playerId | host: true, name })`-el jelen van.
- **Host figyeli** a presence `join`/`leave` eseményeket → a `players.connected`-et frissíti (a host hív egy könnyű Edge Function-t, vagy közvetlen a host-only mezőre — F1-ben a host kliens hívja a `reconnect`/presence-sync Function-t). Offline játékos a lobby/H4-en elhalványul + `⚠ offline` (DESIGN 4.3a).
- **Player figyeli** a saját kapcsolatát → disconnect esetén „Újracsatlakozás…" overlay (DESIGN 4.3a); a host presence eltűnése → „Szünet — host offline" overlay (PLAN 2 perc türelmi idő).

### 4.4 Mit hallgat a host vs. a player (összefoglaló)

- **Host kliens** csatlakozik: `room:{id}` (minden event), `room:{id}:drag` (fogadó), presence (figyeli mindenki jelenlétét). A host az **egyetlen**, aki a `draw_card` válaszból az `audioUrl`-t megkapja.
- **Player kliens** csatlakozik: `room:{id}` (minden event → refetch), presence (saját track + host jelenlét figyelése). A soron lévő player a `:drag` csatornára **küld** (nem fogad). Player audio-t sosem játszik (DESIGN 4.4).

### 4.5 Pakli-generálás progress (opcionális csatorna)

- A `generate_deck` háttérfutása alatt a host a `decks.report` mezőt pollingozza (2 s), VAGY egy `deck:{deckId}` broadcast-csatornán kap `progress` eventeket (`{ processed, total, step }`). F1-ben a polling elég (egyszerűbb); a broadcast opcionális finomítás.

---

## 5. Next.js app-struktúra

### 5.1 Route-ok (App Router)

```
app/
  layout.tsx                      // globális providerek: SupabaseProvider, ReactQuery/SWR, ThemeProvider (dark)
  page.tsx                        // belépő: "Új játék" (host) / "Csatlakozás kóddal" (player) választó
  host/
    page.tsx                      // H1 Létrehozás (playlist URL + beállítások) → create_room → redirect
    [roomCode]/
      page.tsx                    // host shell: az aktuális rooms.status alapján rendereli H2..H6-ot
  play/
    [roomCode]/
      page.tsx                    // player shell: P1 (ha még nem tag) → P2..P5 a fázis alapján
  api/                            // (nincs saját API-route; minden mutáció Edge Function)
lib/
  supabase/client.ts              // browser client (anon key), auth-persist localStorage
  supabase/functions.ts           // typed wrapperek az Edge Function hívásokhoz
  game/state.ts                   // a szerver-állapot → UI-állapot leképezés (fázis → képernyő)
  game/useRoomChannel.ts          // realtime csatorna hook (broadcast + presence + refetch)
components/                       // a DESIGN 5. komponenslistája (lásd lent)
```

- **Route-döntés:** a `[roomCode]` a URL-ben (nem `[roomId]`), mert a QR és a kézi belépés a 4 betűs kódra épül (AC4.2). A kliens a kódból a `join_room`/`reconnect` Function-nel oldja fel a `roomId`-t; a kód → id feloldás nem RLS-en megy (a csatlakozó még nem tag).
- **Host és player külön route-fa (D5):** külön shell, külön jogosultság, külön realtime-szerep. Közös csak a `components/` és a `lib/`.

### 5.2 Komponensek elhelyezése (a DESIGN 5. listájából)

| Komponens (DESIGN) | Hol renderel | Megjegyzés |
|---|---|---|
| `Timeline`, `TimelineCard`, `TimelineSlot`, `MysteryCard` | `play/[roomCode]` P3 (aktív) + `host/[roomCode]` H4 (mini) | a drag&drop (dnd-kit) csak a player P3-on aktív |
| `CountdownTimer` | P3 (player), H4 (host — audio helyett a kör-timer) | `placing_deadline`-ből számol |
| `RevealCard`, `OutcomeBanner` | H5 (host), P5 (player) | `variant='simple'` F1-ben (DESIGN 6.5) |
| `PlayerTimelineRow` | H4 (host) | `ghostSlotIndex` az élő húzáshoz (4.2) |
| `RoomCodeBadge`, `QRCodePanel` | H3 (host lobby) | QR a `/play/[code]`-ra |
| `RoomCodeInput`, `ColorPicker`, `PlayerBadge`, `PlayerList` | P1 (player), H3 (host) | foglalt szín tiltás a `players` state-ből |
| `AudioProgressBar`, `AudioUnlockOverlay` | H4 (host) | az autoplay-fallback (DESIGN 4.3b) kritikus |
| `CoverageReport`, `GenerationProgress`, `SegmentedControl` | H1/H2 (host) | a `decks.report`-ból |
| `ConnectionOverlay` | mind | presence-alapú (4.3) |
| `AppButton` | mind | design-system alap |
| ⟨F2⟩ `TokenCounter`, `StealButton`, `GuessInput` | — | F1-ben nem renderel, a hely megvan |

### 5.3 State-kezelés elve (hol a szerver-forrás, hol az optimista UI)

**Alapelv:** a szerver az igazság forrása; a UI-állapot a `rooms.status` + `round_public.phase`-ből **derivált** (`lib/game/state.ts`). A fázis dönti el, melyik képernyő aktív:

| Adat | Forrás | Frissítés | Optimista? |
|---|---|---|---|
| Szoba/fázis/kör állapot | `rooms` + `round_public` (RLS SELECT) | broadcast → refetch (4.1) | **Nem** — szerver az igazság |
| Idővonalak (mindenki) | `timeline_public` (RLS) | refetch reveal után | Nem |
| Reveal-adat (title/artist/year/artwork) | `round_public.revealed_card` | csak reveal fázisban jelenik meg | Nem (anti-leak) |
| Lobby-lista, connected | `players` (RLS) + Presence | broadcast/presence | Nem |
| **Drag-pozíció (élő húzás)** | **kliens-lokális** | a player a saját ujját követi | **IGEN — teljesen optimista** |
| Host „szellem" kártya (H4) | `:drag` broadcast (4.2) | ~10–15/s | Vizuális, nem állapot |
| Preview audio (host) | `draw_card` válasz `audioUrl` | kör kezdetén | — |

- **Optimista UI CSAK a drag-pozíciónál (D8 kontextusban):** a soron lévő player a saját telefonján a kártyát **azonnal, lokálisan** mozgatja (nincs szerver-roundtrip húzás közben — az akadós lenne). A tényleges lerakás (`place_card`) az egyetlen szerver-mutáció; amíg a válasz meg nem jön, a UI „lerakás folyamatban" állapotot mutat, de a pozíciót nem véglegesíti a szerver megerősítése előtt (AC9.3: a kliens nem írja a táblát).
- **A host H4 élő tükrözése** a `:drag` broadcastból jön (optimista, vizuális) — ez a közös élmény (S10), de sosem befolyásolja a játékállapotot (AC10.1).
- **Minden más állapotváltás pesszimista:** broadcast érkezik → a kliens a megfelelő RLS-nézetet újraolvassa. Ez garantálja, hogy a kliens sosem „talál ki" játékállapotot, és az anti-leak sem sérül (a kliens csak azt látja, amit az RLS enged).

---

## 6. Anti-leak implementáció konkrétan (D12 + D7)

### 6.1 A probléma és a megoldás egy mondatban

A reveal előtt a kártya kiléte nem szabad, hogy kimenjen a player-klienshez (D7). A `p.scdn.co` URL bár opaque, törékeny (dokumentálatlan, bármikor változhat, F0-REPORT 5.). Megoldás (D12): **generáláskor** áttöltjük a preview MP3-at Supabase Storage-ba, és a játék a saját, stabil, opaque URL-ünkről megy — a host-only átadással (D7) együtt ez adja az anti-leaket.

### 6.2 Storage-áttöltés a `generate_deck` Function-ben (D12)

Minden játszható tracknél, a pipeline 3 lépése UTÁN:

```
minden usable track:
  forrás_url = track.spotifyPreviewUrl  (p.scdn.co)     # elsődleges (D12)
              ?? track.previewUrl        (iTunes)         # fallback (D12), ha nincs Spotify embed preview
  mp3 = await fetch(forrás_url).arrayBuffer()            # ~360 KB / 30 mp (F0-REPORT)
  path = `deck-audio/${deckId}/${cardId}.mp3`
  await storage.from('deck-audio').upload(path, mp3, { contentType: 'audio/mpeg' })
  deck_cards.audio_url    = <stabil Storage URL a path-ra>
  deck_cards.audio_source = forrás_url === spotify ? 'spotify_embed' : 'itunes'
```

- **Méret:** 100 track ≈ 36 MB (F0-REPORT); a free tier 1 GB-jába sok pakli belefér.
- **A Storage URL formája:** a `deck-audio` bucket **privát** (nem publikus). Az `audio_url`-t **nem** publikus URL-ként tároljuk, hanem a **path**-ot, és a host a lejátszáshoz **signed URL**-t kap (6.4). Így a player nem tudja kitalálni/elérni a fájlt sem.
- **Opaque:** a `{cardId}.mp3` fájlnév uuid — nem árul el címet/előadót (F0-REPORT anti-leak bónusz megmarad).

### 6.3 Storage bucket + hozzáférés

```sql
-- privát bucket, nincs publikus olvasás
insert into storage.buckets (id, name, public) values ('deck-audio', 'deck-audio', false);

-- NINCS anon/authenticated storage.objects SELECT policy a deck-audio bucketre:
-- a fájlokat kizárólag signed URL-lel lehet elérni, amit az Edge Function ad ki,
-- kizárólag a host kliensnek, kizárólag a saját aktuális köréhez (6.4).
```

### 6.4 A host signed URL-t kap — csak a saját köréhez (D7)

- A `draw_card` (3.5) a válaszában **nem** a nyers Storage-path-ot adja, hanem egy **rövid élettartamú signed URL**-t (pl. TTL = `timeLimitSec + puffer`, kb. 2 perc), amit a service-role generál (`createSignedUrl`) **kizárólag az aktuális kör `card_id`-jéhez** tartozó `audio_url`-ra.
- **Ki kapja:** csak a host (a `draw_card`-ot csak a host/szerver hívja, és a válasz csak neki megy). A player kliensek soha nem hívják a `draw_card`-ot és nem kapnak signed URL-t.
- **Miért biztonságos:**
  1. A player nem olvashatja a `deck_cards.audio_url`-t (RLS: 2.3 nincs SELECT policy).
  2. A player nem éri el a Storage-fájlt (privát bucket, nincs SELECT policy: 6.3).
  3. A signed URL rövid életű és csak a hosthoz kerül (D7), az aktuális kártyához kötve — nem szivárog ki, és lejár.
  4. Ha mégis kiszivárogna: az opaque uuid-fájlnév nem árulja el a megfejtést (csak a hang jönne, ami úgyis szól a közös képernyőn).
- **F1 = ez elég (D7).** A teljes streaming-proxy (az Edge Function maga streameli a bájtokat metaadat nélkül) F2, a 0 Ft költségcél miatt (a signed URL nem terheli az Edge-hívás-kvótát lejátszás közben, a proxy terhelné).

---

## 7. Reconnect-logika (D6/D5 kontextusban, S15)

### 7.1 Az identitás alapja: Anonymous Auth + localStorage

- Belépéskor (első `/play/[code]` megnyitás) a kliens `supabase.auth.signInAnonymously()`-t hív → kap egy anon usert stabil `auth.uid()`-vel, a JWT a **localStorage-ben perzisztál** (Supabase alap viselkedés). Ez az uid a `players.auth_uid` — ez a **reconnect-kulcs**.
- **Böngésző-frissítés / net-szakadás után (AC15.1):** a kliens ugyanazt a localStorage JWT-t tölti vissza → ugyanaz az `auth.uid()` → a `reconnect` Function (3.10) megtalálja a `players` sort `(room_id, auth_uid)` alapján (a `players_room_uid_idx` egyediségi index garantálja: 1 uid = 1 játékos/szoba, AC15.3 nincs duplikátum).

### 7.2 A reconnect folyamat

```
kliens indul /play/[code]-ra
  → betölti a localStorage JWT-t (ha van); ha nincs, signInAnonymously
  → reconnect({ code }) Edge Function:
       megkeresi a players sort (room + auth_uid)
       ha VAN:  connected=true, last_seen_at=now(); visszaadja a teljes állapotot
                → a kliens a rooms.status + round_public.phase alapján a helyes képernyőre ugrik
       ha NINCS: a kliens a P1 csatlakozás-képernyőre megy (új játékos)
  → a kliens csatlakozik a room:{id} broadcast + presence csatornákhoz (4.)
  → presence track → a host látja, hogy visszatért (connected=true, DESIGN 4.3a "vissza" jelzés)
```

- **Nincs adatvesztés (AC15.3):** a `timeline_cards` a `player_id`-hez kötött (nem session-höz), ezért a reconnect után az idővonal érintetlen. A `players` sor `tokens`/`seat_order` is megmarad.
- **Host reconnect (D5):** a host identitása szintén anon uid (localStorage). Ha a host lecsatlakozik, a szoba `paused` státuszba mehet (F1-ben opcionális; PLAN 2 perc türelmi idő), és a host bármely eszközről visszatér ugyanazzal az uid-del — VAGY (ha az uid elveszne, pl. más eszköz) a `host_uid` átvétele egy F2-kérdés. F1-ben feltételezzük, hogy a host ugyanarról az eszközről tér vissza.
- **Presence vs. connected:** a `connected` bool a `players`-ben a **tartós** állapot (RLS-en át mindenki látja); a Presence a **pillanatnyi** jelenlét (real-time). A host a Presence-eseményekből szinkronizálja a `connected`-et (4.3). Az F1 auto-skip (lecsatlakozott soron lévő) nincs (D-nélküli, PRD S25 = F2); F1-ben a reconnect a fő védelem, és a soron lévő offline játékos körét a host manuálisan léptetheti (vagy a timeout lejár → `resolve_round` timeout-tal, D6).

---

## 8. Performance és skálázási megfontolások (MVP-szint)

> Az MVP terhelése kicsi (2–8 játékos + 1 host / szoba, baráti körök). Nem over-engineer-elünk; a lenti pontok a valós szűk keresztmetszetekre fókuszálnak.

- **Pakli-generálás (a fő bottleneck):** a MusicBrainz 1 req/s → egy 100-as pakli ~2 perc. Enyhítés: globális `mb_year_cache` tábla (3.1) — ismételt előadók/számok közti amortizáció; a Spotify embed és iTunes gyors. A generálás háttérfeladat (`waitUntil`), nem blokkolja a UI-t (H2 progress).
- **Realtime forgalom:** a `:drag` csatorna a legbeszédesebb (~10–15/s húzás közben), de csak a soron lévő player küld és csak a host fogad (D8) → 1:1, elhanyagolható. A többi event ritka (körönként néhány). A free tier bőven bírja.
- **Storage sávszél:** a preview lejátszás a host signed URL-jéről megy, közvetlenül a Storage CDN-ről (nem Edge Function-ön át) → nem terheli a függvény-kvótát. 30 mp × ~360 KB / kör, egyetlen host → minimális.
- **Anti-leak vs. teljesítmény:** a broadcast+refetch minta (a `postgres_changes` helyett) egy extra SELECT-et jelent eventenként, de a szoba-scope kicsi (max 8 sor players, 1 round) → olcsó, és ez az ára a biztonságos anti-leaknek. Megéri.
- **DB indexek:** a fenti sémában minden gyakori query-pattern fedve (room-scope lekérdezések a `*_room_idx`-eken, kód-lookup a `rooms_code_active_idx`-en, reconnect a `players_room_uid_idx`-en).

---

## 9. Implementációs jegyzék a Backend és Frontend agenteknek

> Sorrend és függőségek. A `[BE]`/`[FE]` jelöli a felelőst. A Supabase-projektet a Backend hozza létre a koordinátor jóváhagyása után (CLAUDE.md — költség-megerősítés, free tier).

**Fázis A — Adatréteg (BE, minden más előfeltétele):**
1. `[BE]` Supabase projekt létrehozása (jóváhagyás + cost-megerősítés után). `pgcrypto` extension.
2. `[BE]` **Migráció 1 — séma:** az 1. szakasz összes `CREATE TYPE` / `CREATE TABLE` / index / a körkörös FK (`rooms_current_round_fk`) + a `mb_year_cache` tábla (3.1).
3. `[BE]` **Migráció 2 — Storage:** `deck-audio` privát bucket (6.3).
4. `[BE]` **Migráció 3 — RLS + nézetek:** a 2. szakasz összes `enable row level security`, `is_room_member`/`is_room_host` függvény, policy, `round_public` és `timeline_public` nézet. **Ez a kritikus anti-leak réteg — külön reviewt érdemel** (Security Analyst később). Ellenőrzés: anon kliensként a `deck_cards`/`rounds.card_id` NEM olvasható.
   - *Megjegyzés a `timeline_public`-höz (2.7):* ha a definer-nézet tagság-szűrése kockázatosnak bizonyul, cseréld `security definer` RPC-re (`get_timeline(room_id)`), amely explicit ellenőrzi `is_room_member`-t. Döntést a BE hozza meg a review során.

**Fázis B — Edge Functions (BE, a séma után):**
5. `[BE]` `_shared/`: a `normalize`, `similarity`, `primaryArtist`, `parsePlaylistId` portolása TS-re (a `tools/deck-pipeline/lib/util.js` + `parse-playlist-id.js` alapján — NE írd újra a logikát, portold).
6. `[BE]` **`generate_deck`** (3.1) — a 3 pipeline-lépés portja + a D12 Storage-áttöltés + kettős évszám-keresztellenőrzés (F0-REPORT 4.). Ez a legnagyobb darab; a prototípus (`tools/deck-pipeline/`) a referencia-implementáció.
7. `[BE]` `create_room`, `join_room`, `start_game` (3.2–3.4) — lobby-út.
8. `[BE]` `draw_card`, `place_card`, `resolve_round`, `next_turn` (3.5–3.9) — a kör-hurok, a fázis-géppel és optimista zárral. **A `resolve_round` a kritikus anti-leak pont** (2.6, egy-tranzakciós reveal). A `register_steal` NEM készül (F2-stub, 3.7).
9. `[BE]` `reconnect`/`leave_room` + presence-sync (3.10, 7.).

**Fázis C — Frontend (FE, az Edge Functions után, de a shell-ekkel párhuzamosítható):**
10. `[FE]` `lib/supabase` (anon client, localStorage-perzisztencia), `lib/game/state.ts` (fázis → képernyő leképezés), `lib/game/useRoomChannel.ts` (broadcast + presence + refetch, 4.).
11. `[FE]` **Host shell** (`host/[roomCode]`): H1 (create_room) → H2 (generate_deck progress-polling) → H3 (lobby + QR + start_game) → H4/H5/H6 (a kör-hurok követése, audio + AudioUnlockOverlay). A host az egyetlen, aki az `audioUrl`-t kezeli (6.4).
12. `[FE]` **Player shell** (`play/[roomCode]`): P1 (join_room/reconnect) → P2/P2' → **P3 drag&drop** (dnd-kit, DESIGN 4.1, a legkritikusabb; tap-to-place fallback is F1, D11) → P5. A player sosem játszik audiót, sosem lát kártya-adatot reveal előtt.
13. `[FE]` A DESIGN 5. komponenslistája (5.2 táblázat), a style guide (DESIGN 6.) alapján.

**Fázis D — Integráció + verifikáció (BE+FE, majd QA):**
14. **Anti-leak hálózati ellenőrzés:** a player kliens forgalmában (DevTools/Network) a reveal előtt SEHOL nem jelenik meg cím/előadó/év/audio_url/card_id. Ez a Success-metric „Anti-leak" (PRD 6.) és a QA/Security felelőssége is, de a BE+FE integrációkor először itt ellenőrizzük.
15. **Reconnect-teszt** (AC15): frissítés + net-le/fel → ugyanaz a játékos, nincs duplikátum, nincs kártyavesztés.
16. **Végigjátszás:** 3–4 anon kliens + 1 host, egy teljes játék indulástól győzelemig (a Success-metric „Végigjátszhatóság").

---

## 10. Nyitott kérdések (KÉRDÉS A TULAJHOZ)

Ahol tudtam, magam döntöttem és dokumentáltam (a korábbi agentek mintájára); az alábbiak maradtak, amelyekhez tulaj-döntés kell, DE egyik sem blokkolja a Fázis A–B indulását.

- **KÉRDÉS A TULAJHOZ (A1):** A 100-track feletti playlisteknél az embed levágja a listát (F0-REPORT). F1-ben elfogadjuk-e a **100-track felső limitet** (a legtöbb barát-playlist belefér, és 60 kártya kell csak), és a lapozás (bejelentkezett fetch / Spotify API kulcs) marad F2? *Az én döntésem, ha nincs válasz: igen, F1-ben 100 a limit, figyelmeztetéssel a H2-n.*
- **KÉRDÉS A TULAJHOZ (A2):** A „szerver-timer" F1-ben a host kliensre támaszkodik (a host hívja a `resolve_round`-ot deadline-lejáratkor, a szerver ellenőrzi a deadline-t, 3.10). Elfogadható-e ez a 0 Ft-os minimál-megoldás F1-re, vagy már F1-ben kell pg_cron/Edge-scheduler (kis extra komplexitás)? *Alapértelmezett döntésem: host-vezérelt timer F1-ben, mert a deadline szerver-ellenőrzött, így nem csalható, és 0 Ft.*
- **KÉRDÉS A TULAJHOZ (A3):** Host-reconnect eszközváltással (D5 kontextus): F1-ben feltételezem, hogy a host ugyanarról az eszközről tér vissza (localStorage uid). Kell-e F1-ben a „host átvétele másik eszközről" (pl. kód+PIN alapú host-claim), vagy ez F2? *Alapértelmezett döntésem: F1-ben ugyanaz az eszköz; host-claim F2.*
- **KÉRDÉS A TULAJHOZ (A4):** A `timeline_public` hozzáférés (2.7) definer-nézet VS. definer-RPC — ezt implementáció közben a Backend eldöntheti biztonsági szempontból, de ha a tulaj/koordinátor preferálja az explicit RPC-t (átláthatóbb tagság-ellenőrzés), jelezze. *Alapértelmezett: a BE dönti a review-n; ha kétség, RPC.*

---

*Következő lépés a csapat-munkamódszer szerint: a Backend Engineer a Fázis A–B-ből (9. szakasz) indul (Supabase projekt jóváhagyás után), a Frontend Engineer a Fázis C-ből. Eltérés esetén ezt a doksit frissíteni kell (CLAUDE.md szabály).*
