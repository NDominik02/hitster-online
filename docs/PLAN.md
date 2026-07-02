# Hitster Online — Átfogó terv

*(munkacím: „Idővonal")*

## 1. Koncepció egy mondatban

Böngészőből játszható, telepítés nélküli party-játék: egy közös host képernyő szolgáltatja a zenét és a látványt, a játékosok a saját telefonjukon húzzák a felismert számokat a helyükre a saját idővonalukon — a paklikat bármilyen Spotify playlistből lehet generálni.

## 2. Játékszabályok (végleges specifikáció)

### Alapok
- **Játékosok**: 2–8 fő + 1 host eszköz (a host maga is játszhat).
- **Cél**: elsőként **10 kártyás** helyes idővonalat építeni. (Beállítható: 5 = gyors mód, 15 = maraton.)
- **Induláskor** minden játékos kap 1 felfedett kezdőkártyát az idővonalára és **2 tokent**.

### Egy kör lefolyása
1. A rendszer húz egy kártyát a pakliból → a host eszközön elindul a lejátszás (cím/előadó rejtve, a host képernyőn pörgő „?" kártya + lejátszási progress).
2. A **soron lévő játékos** a telefonján a saját idővonalára húzza a kártyát a választott résbe. Időlimit: **90 mp** (beállítható). Közben a host képernyőn élőben látszik, ahogy tologatja.
3. **Bemondás (opcionális)**: lerakás előtt a játékos megjelölheti, hogy tudja az előadót ÉS a címet → begépeli (fuzzy matching, ékezet/kisbetű-toleráns). Ha talál: **+1 token**.
4. **Steal-ablak (15 mp)**: a lerakás után, még a reveal előtt, bármelyik másik játékos költhet **1 tokent**, hogy fogadjon: a lerakás rossz, ÉS megjelöli a saját idővonalán a szerinte helyes pozíciót.
5. **Reveal**: nagy felfedő animáció a host képernyőn (albumborító, előadó, cím, év).
   - Soron lévő jó helyre tett → kártya beépül az idővonalába.
   - Rossz helyre tett → kártya elszáll; ha volt sikeres stealer, **ő kapja meg** a kártyát (több sikeres stealer esetén a körsorrendben következő). Sikertelen steal = a token elveszett.
6. Következő játékos.

### Tokenszabályok
- **Szerzés**: helyes előadó+cím bemondás (+1).
- **Költés**: 1 token = steal · 1 token = szám átugrása (új kártyát húz helyette) · **3 token = azonnali +1 kártya** (a pakli tetejéről, felfedve, be kell tudni illeszteni — ha nem sikerül, elveszik).

### Élsimítások
- **Azonos évszám**: ha a kártya éve megegyezik egy szomszédos kártyáéval, mindkét oldala helyesnek számít.
- **Vitagomb**: a reveal képernyőn „Rossz az évszám!" gomb → a host érvénytelenítheti a kört (a kártya kikerül a pakliból, senki nem veszít semmit).
- **Pakli kifogy** győzelem előtt: az nyer, akinek hosszabb az idővonala; egyenlőségnél több token.

## 3. Eszköz-architektúra és képernyők

```
        ┌─────────────────────────────┐
        │       HOST KÉPERNYŐ         │  laptop/TV/tablet/telefon hangszóróval
        │  🔊 zene · közös állás ·    │
        │  reveal-show · QR a lobbyba │
        └──────────────┬──────────────┘
                       │ Supabase Realtime
        ┌──────┬───────┼───────┬──────┐
      📱 Anna  📱 Bence  📱 Csilla  📱 Dani
      saját idővonal · drag&drop · tokenek
```

### Host nézet képernyői
| # | Képernyő | Tartalom |
|---|---|---|
| H1 | **Létrehozás** | playlist URL beillesztése VAGY pakli-könyvtár; beállítások (győzelmi limit, időlimit, steal be/ki); Spotify Premium csatlakoztatás (opcionális) |
| H2 | **Pakli-előkészítés** | progress bar a generálásról, lefedettségi riport („94/100 szám használható"), problémás számok listája |
| H3 | **Lobby** | nagy QR-kód + 4 betűs szobakód, csatlakozott játékosok listája színnel/névvel, Start gomb |
| H4 | **Játék** | középen „?" kártya + audio progress; körben az összes játékos mini-idővonala és tokenjei; a soron lévő játékos kiemelve, húzása élőben tükrözve |
| H5 | **Reveal** | teljes képernyős felfedés: albumborító flip-animációval, előadó/cím/év, helyes/hibás visszajelzés, steal-eredmények |
| H6 | **Győzelem** | győztes idővonala végigpörgetve, statisztikák, „Újra" gomb |

### Játékos nézet képernyői
| # | Képernyő | Tartalom |
|---|---|---|
| P1 | **Csatlakozás** | kód beírása / QR-ből érkezés, név + színválasztás |
| P2 | **Várakozás** | saját idővonal böngészése, többiek idővonalai megnézhetők |
| P3 | **Tippelés** (saját kör) | vízszintesen görgethető idővonal, a „?" kártyát a rések közé húzza; „Bemondom!" kapcsoló + beviteli mezők; nagy LERAKOM gomb + visszaszámláló |
| P4 | **Steal** (más köre) | „Szerinted rossz helyre tette?" → 1 tokenért pozíciót jelöl a sajátján |
| P5 | **Reveal-visszajelzés** | rövid, haptikus (vibráció) siker/kudarc |

**Pass-and-play mód** (v2, fallback): egy eszköz, „Add tovább Bencének 🙈" átadó-képernyőkkel. Steal ebben a módban kikapcsolva.

## 4. Zene-pipeline (kritikus út)

### Pakli-generálás (playlist URL → játszható pakli)
Edge Function-ben futó batch folyamat, eredménye cache-elt, újrafelhasználható pakli:

```
Spotify playlist URL
   │  Spotify Web API (client credentials — publikus playlist metaadat)
   ▼
track lista: cím, előadó, album, album-évszám, spotify URI, borító
   │  MusicBrainz API (1 req/s limit! → sorban, cache-elve)
   ▼
eredeti megjelenési év (first release date) — remaster/best-of korrekció
   │  iTunes Search API (ingyenes, ~20 req/perc → throttle)
   ▼
30 mp-es preview URL párosítás (cím+előadó fuzzy match, hossz-ellenőrzés)
   │
   ▼
deck_cards sorok + lefedettségi riport a hostnak
```

- A nem párosítható vagy évszám nélküli számok **kiesnek**, a host látja a riportot.
- Minimum pakliméret indításhoz: **~30 + játékosszám × 15**.
- A generált paklik **megoszthatók** (link).

### Lejátszás játék közben — két szint
1. **Ingyenes mód (MVP)**: iTunes 30 mp preview `<audio>` elemmel a host eszközön.
2. **Premium mód (v2)**: a host bejelentkezik Spotify-jal.
   - *Laptopon*: Web Playback SDK a böngészőben.
   - *Mobilon*: **Spotify Connect API** — a webapp a host telefonján futó Spotify appot vezérli.

### Anti-leak
A reveal előtt a szám kiléte **nem mehet ki** a játékos-kliensekre (a hálózati forgalomban sem). A host eszköz ingyenes módban **opaque proxy-URL**-t kap (az Edge Function streameli a preview-t, metaadat nélkül); Premium módban a Spotify URI nem rejthető → a host bizalmi szerep.

## 5. Műszaki architektúra

### Stack
- **Frontend**: Next.js (App Router) + TailwindCSS + **dnd-kit** + Framer Motion. Egy app, `/host/[room]` és `/play/[room]` nézetekkel. Mobil-first, PWA-képes.
- **Backend**: **Supabase**:
  - **Postgres** — a teljes játékállapot, a szerver az igazság forrása
  - **Realtime** (broadcast + presence) — állapot-szinkron, jelenlét/disconnect
  - **Edge Functions** — minden játéklogika-mutáció; a kliens **soha nem írja közvetlenül** a játéktáblákat
  - **Anonymous Auth** — a játékos-identitás localStorage-ben túléli a frissítést → reconnect
- **Hosting**: Vercel + Supabase free tier.

### Adatmodell (vázlat)

```sql
decks        (id, name, source_playlist_url, owner_id, coverage_pct, is_public, created_at)
deck_cards   (id, deck_id, title, artist, year, spotify_uri, preview_token, artwork_url)
rooms        (id, code CHAR(4), host_id, deck_id, status, settings JSONB,
              current_round_id, created_at)
players      (id, room_id, auth_uid, name, color, tokens INT, seat_order INT,
              connected BOOL, joined_at)
timeline_cards (id, player_id, card_id, position INT)
rounds       (id, room_id, round_no, card_id, active_player_id,
              phase ENUM(playing, placing, stealing, reveal, done),
              placement INT, name_guess JSONB, steals JSONB, outcome JSONB)
```

- **RLS**: a `deck_cards`-ból a kliens csak a *már felfedett* kártyákat SELECT-elheti; az aktuális kör kártyája a reveal pillanatáig csak az Edge Functionök számára létezik.
- A `rounds.phase` átmeneteit kizárólag Edge Function léptetheti.

### Realtime folyam (egy kör)

```
EdgeFn: draw_card ──► rounds INSERT (phase: playing)
   ├─► host kliens: kap egy preview_tokent → audio indul
   └─► minden kliens: "X köre van" állapot
player: drag-pozíció (broadcast, csak vizuális)
player: LERAKOM ──► EdgeFn: place_card (phase: stealing, 15s timer)
players: steal ──► EdgeFn: register_steal
EdgeFn: resolve_round ──► kiértékelés, timeline_cards, tokenek, phase: reveal
EdgeFn: next_turn (5s múlva)
```

### Hibatűrés
- **Játékos lecsatlakozik**: presence jelzi; köre max 1× kihagyható, utána auto-skip; visszatérve (localStorage token) folytatja.
- **Host lecsatlakozik**: PAUSE, 2 perc türelmi idő; a host bármely eszközről visszaléphet.
- **Verseny-helyzetek**: minden mutáció Edge Function-ben, `round_id + phase` optimista zárral.

## 6. Ütemterv

### F0 — Kockázat-validálás (ELSŐ lépés)
Csupasz script: playlist URL → pakli. Kimenet: lefedettségi % valós playlisteken (magyar zenékre külön teszt!), évszám-pontosság szúrópróba.

### F1 — Játszható MVP
Szoba létrehozás/csatlakozás, lobby QR-ral; core loop: húzás → preview → drag&drop → reveal → pontozás → győzelem. Nincs még token/steal/bemondás/Premium.

### F2 — A teljes játék
Tokenek, bemondás fuzzy matchinggel, steal; reveal-show animációk, hangeffektek, vibráció; vitagomb, reconnect, auto-skip.

### F3 — Premium és kényelem
Spotify Premium mód; pakli-könyvtár; beállítások.

### F4 — Extrák
Pass-and-play · statisztikák · távoli játék mód · PWA install.

## 7. Kockázatok

| Kockázat | Súly | Kezelés |
|---|---|---|
| iTunes preview-lefedettség magyar zenéknél | 🔴 | F0-ban mérjük; fallback: Deezer preview API |
| MusicBrainz évszám-találati arány | 🟡 | fallback album-évre + vitagomb |
| Spotify dev kvóta (development mode, 25 user) | 🟡 | pakli-generáláshoz csak szerveroldali kulcs kell; csak a Premium mód érintett |
| Web Playback SDK mobilböngészőben | 🟡 | Connect API a mobil-út; ingyenes mód mindig működik |
| Jogi: preview-k nyilvános lejátszása | 🟢 | baráti kör, nem kereskedelmi |

## 8. Teszt-playlistek (a tulajtól, F0-hoz)

- https://open.spotify.com/playlist/63bLUR4eamvtD9ArI4LFy9
- https://open.spotify.com/playlist/3cmVUEjMK7RkTe6ONRTQeJ
- https://open.spotify.com/playlist/5ID9QTUkVIztPYqRuoP7Vw

A tulajnak van Spotify Premiumja (a v2 Premium mód teszteléséhez).
