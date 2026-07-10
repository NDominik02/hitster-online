# Hitster Online — DESIGN (UX/UI Design dokumentum)

*Munkacím: „Idővonal" · Verzió: 1.0 · Készítette: UX/UI Designer agent · Forrás: [PRD.md](PRD.md), [PLAN.md](PLAN.md), [DECISIONS.md](DECISIONS.md)*

> Ez a dokumentum a PRD F1 (MVP) scope-ját fordítja le konkrét user flow-kra, wireframe-ekre, interakció-részletekre, komponensekre és style guide-ra. A layout **helyet hagy az F2 elemeknek** (token-számláló, steal-gomb), hogy azok bevezetésekor ne kelljen újratervezni. Eltérés esetén a PRD/DECISIONS az irányadó, és ezt a doksit frissíteni kell.
>
> **Kritikus döntések, amikre a design épül (DECISIONS.md):**
> - **D5:** A host képernyő **NEM játékos** — külön nézet. Ha a host játszani akar, külön telefonnal QR-ral belép játékosként. Start-feltétel: **min. 2 csatlakozott játékos** (a host eszköz nem számít bele).
> - **D6:** Időlimit lejáratakor, ha nincs véglegesített lerakás → **a kártya elveszik** (rossz tipp). Ha van épp kijelölt rés, az számít lerakásnak a lejárat pillanatában.
> - **D7:** F1 anti-leak: a preview URL csak a host kliens kapja meg; nincs teljes proxy.
> - **D3:** Pakli kifogyásakor azonos idővonal-hossznál → **megosztott győzelem**.
> - **D4:** Fix **60 használható kártya** a szoba-létrehozás feltétele.

---

## 0. Tervezési alapelvek (a party-kontextusból)

A tervezés minden döntése ebből a használati képből indul: **nappaliban, este, baráti társaság, egy közös nagy képernyő (TV/laptop) + mindenki a saját telefonján.** Ebből következik:

1. **Két, radikálisan eltérő képernyő-osztály.** A *host* képernyő távolról nézett, passzív, „színpad" — nagy betű, magas kontraszt, semmi apró interaktív elem, 3 méterről olvasható. A *player* képernyő közeli, aktív, hüvelykujjal használt — nagy touch-targetek, alsó képernyőharmadban a fő akciók (thumb zone).
2. **A telefon az input, a TV a kimenet.** A játékos a telefonján cselekszik, de az *élményt* a közös képernyőn éli meg a társasággal. Ezért a host képernyő reveal/állás mindig a „nagy pillanat", a telefon inkább vezérlő.
3. **Nulla súrlódás a belépésnél.** QR → név → szín → bent. Semmi regisztráció, semmi jelszó, semmi telepítés (PRD Persona 2).
4. **Sötét alap.** Este játszanak, a sötét téma kíméli a szemet és „party/klub" hangulatot ad. A TV-n is jobban néz ki, kevésbé vakít.
5. **A szín soha nem az egyetlen jel.** Minden játékos-színhez tartozik **név + ikon/monogram** is (accessibility + 8 hasonló szín megkülönböztethetősége).
6. **F1 = funkcionális, F2 = látványos.** Az F1 reveal egyszerű flip; a hangeffekt/vibráció/reveal-show F2. A layout viszont már most helyet hagy nekik.

---

## 1. User flow-k

### 1.1 Host flow (szöveges diagram)

```
                         ┌──────────────────────────────────────────────┐
                         │  HOST FLOW  (laptop / TV / tablet — nem játszik) │
                         └──────────────────────────────────────────────┘

   [Belépő / „Új játék"]
          │
          ▼
   ┌─────────────────┐   playlist URL + beállítások (limit, időlimit)
   │ H1 Létrehozás   │───────────────────────────────┐
   └─────────────────┘                               │
          │ „Pakli generálása"                        │
          ▼                                           │
   ┌─────────────────┐   progress bar, majd lefedettségi riport         │
   │ H2 Pakli-riport │                                                  │
   └─────────────────┘                                                  │
      │           │                                                     │
      │ < 60 kártya│ ≥ 60 kártya (D4) → „Szoba létrehozása" aktív       │
      │ (elutasít) │                                                     │
      ▼           ▼                                                     │
  [Hibaüzenet]  ┌─────────────────┐   QR + 4 betűs kód                  │
  „Válassz más  │ H3 Lobby        │◄── játékosok élőben csatlakoznak    │
   playlistet"  └─────────────────┘                                     │
                     │  Start (aktív, ha ≥ 2 játékos — D5)              │
                     ▼                                                   │
                ┌─────────────────┐   „?" kártya + audio progress       │
        ┌──────►│ H4 Játék        │   körben a játékosok mini-idővonalai │
        │       └─────────────────┘   soron lévő húzása élőben tükrözve  │
        │            │ lerakás történt / időlimit lejárt (D6)           │
        │            ▼                                                   │
        │       ┌─────────────────┐   albumborító flip, előadó/cím/év    │
        │       │ H5 Reveal       │   helyes/hibás visszajelzés          │
        │       └─────────────────┘                                     │
        │            │ 5 mp múlva auto → next_turn                       │
        │            ▼                                                   │
        │      ┌──────────────┐  nincs győztes → következő játékos      │
        └──────┤  győztes?    │                                          │
               └──────────────┘                                          │
                     │ van győztes (≥ limit) VAGY pakli kifogyott        │
                     ▼                                                   │
                ┌─────────────────┐   győztes idővonala, „Újra" gomb     │
                │ H6 Győzelem     │──── „Újra" → H1/H3 ugyanazzal a ─────┘
                └─────────────────┘         paklival/társasággal
```

**Host flow — kulcsdöntési pontok:**
- **H2 → H3 kapu:** ha < 60 használható kártya (D4), a „Szoba létrehozása" gomb **letiltva**, és a riport magyarázza, miért.
- **H3 Start-kapu:** a Start csak **≥ 2 csatlakozott játékossal** aktív (D5); a host eszköz nem számít játékosnak.
- **H4 → H5:** a fázisváltást a szerver (Edge Function) hajtja, a host csak követi (nem host-vezérelt, hogy egységes maradjon az állapot).
- **H6 „Újra":** ugyanaz a pakli és társaság, új parti — nem kell újragenerálni.

### 1.2 Player flow (szöveges diagram)

```
                         ┌──────────────────────────────────────────────┐
                         │  PLAYER FLOW  (telefon — mobil-first, thumb)   │
                         └──────────────────────────────────────────────┘

   QR beolvasás  ─────────────►  /play/[room]
   VAGY 4 betűs kód beírása ───►      │
                                      ▼
                             ┌─────────────────┐  név + szín (foglalt szín tiltva)
                             │ P1 Csatlakozás  │
                             └─────────────────┘
                                      │ „Belépek"
                                      ▼
                             ┌─────────────────┐  saját (kezdő)idővonal, többiekét is nézheti
                             │ P2 Várakozás    │◄──────────────┐
                             └─────────────────┘               │
                                      │ host Start → játék      │
                                      ▼                         │
                             ┌──────────────┐                  │
                        ┌───►│  én jövök?   │                  │
                        │    └──────────────┘                  │
                        │      │ NEM (más köre)  │ IGEN (én)    │
                        │      ▼                 ▼              │
                        │  ┌─────────────┐  ┌─────────────────┐│
                        │  │ P2' Megfigy-│  │ P3 Tippelés     ││  ← a játék szíve
                        │  │ elő nézet   │  │ (drag&drop,     ││
                        │  │ (más húz)   │  │  visszaszámláló)││
                        │  └─────────────┘  └─────────────────┘│
                        │      │                 │ LERAKOM      │
                        │      │                 │ VAGY időlimit│
                        │      │                 │ lejárt (D6)  │
                        │      └────────┬────────┘              │
                        │               ▼                       │
                        │      ┌─────────────────┐              │
                        │      │ P5 Reveal-       │  siker/kudarc│
                        │      │ visszajelzés     │  (F2: vibráció)
                        │      └─────────────────┘              │
                        │               │ 5 mp → következő kör  │
                        └───────────────┴───────────────────────┘
                                        │ valaki nyert
                                        ▼
                             ┌─────────────────┐  „Nyert: Anna 🟢" / „Te nyertél!"
                             │ P5' Vég-képernyő│  (a győzelem részletei a hoston)
                             └─────────────────┘
```

> **F1 megjegyzés:** a **P4 Steal** képernyő az F2-höz tartozik (token-rendszer), így az F1 flow-ban kihagyva. A layoutban viszont a helye fenntartva (lásd 3. és 4. szakasz).

**Player flow — kulcsdöntési pontok:**
- **P1 színválasztás:** foglalt szín nem választható (PRD AC5.3); ütközésnél a szerver dönt.
- **„Én jövök?" elágazás:** a saját körben P3 (aktív, drag&drop), másnál P2' (passzív, megfigyelő). Ugyanaz a képernyő-váz, más mód.
- **P3 kilépés:** kétféleképp — kézzel a LERAKOM gomb, vagy időlimit-lejárat (D6). Mindkettő → P5 reveal-visszajelzés.

---

## 2. Képernyő-inventár (F1) és felelősség

| Képernyő | Eszköz | Fő cél | Interaktivitás |
|---|---|---|---|
| H1 Létrehozás | host | pakli + beállítás | közepes (form) |
| H2 Pakli-riport | host | döntés: játszható-e | alacsony (olvasás + 1 gomb) |
| H3 Lobby | host | csatlakozás megvárása, Start | alacsony |
| H4 Játék | host | zene + közös állás | **passzív** (nézni) |
| H5 Reveal | host | a nagy pillanat | passzív |
| H6 Győzelem | host | lezárás | alacsony (Újra) |
| P1 Csatlakozás | player | belépés | közepes (név/szín) |
| P2 / P2' Várakozás/Megfigyelő | player | böngészés / követés | alacsony |
| P3 Tippelés | player | **tipp lerakása** | **magas (drag&drop)** ← a játék szíve |
| P5 Reveal-visszajelzés | player | siker/kudarc | passzív |

---

## 3. Wireframe-ek (ASCII, annotációkkal)

> Konvenció: `[ ... ]` = gomb, `( ... )` = beviteli mező / kapcsoló, `« »` = dinamikus/valós idejű elem, `▓` = kiemelt/aktív, `░` = inaktív/másodlagos. A ⟨F2⟩ jelölés fenntartott helyet jelöl a későbbi funkcióhoz.

### H1 — Létrehozás (host)

```
┌───────────────────────────────────────────────────────────────────┐
│  🎵  HITSTER ONLINE                                    [ ? Súgó ]    │
│                                                                     │
│      ÚJ JÁTÉK LÉTREHOZÁSA                                            │
│                                                                     │
│   Pakli forrása                                                     │
│   ┌───────────────────────────────────────────────────────────┐   │
│   │ ( https://open.spotify.com/playlist/...              )     │   │  ← nagy input, placeholder példával
│   └───────────────────────────────────────────────────────────┘   │
│   ↳ Illeszd be egy Spotify playlist linkjét.                        │  ← segéd-szöveg
│                                                                     │
│   Beállítások                                                       │
│   ┌─────────────────────┐   ┌─────────────────────┐                │
│   │ Győzelmi limit       │   │ Időlimit             │                │
│   │  [5] [▓10▓] [15]     │   │  [60] [▓90▓] [120] mp│                │  ← szegmentált kapcsoló, alap kiemelve
│   │  gyors  alap maraton │   │                      │                │
│   └─────────────────────┘   └─────────────────────┘                │
│                                                                     │
│   ⟨F2⟩ ( ◻ Steal engedélyezése )   ( ◻ Spotify Premium )           │  ← F2/F3 helye, F1-ben rejtve/letiltva
│                                                                     │
│                        [   PAKLI GENERÁLÁSA   ▶ ]                    │  ← elsődleges CTA, csak érvényes URL-nél aktív
└───────────────────────────────────────────────────────────────────┘
```
**Annotációk:**
- A steal/Premium kapcsolók F1-ben **rejtve vagy `disabled`** (helyük fenntartva F2/F3-ra). Ne bontsuk meg a layoutot később.
- Az URL-mező inline validál: érvénytelen forma → piros keret + magyar hibaüzenet (PRD AC1.6), a CTA letiltva.
- Szegmentált kapcsolók (nem dropdown): 3 méterről is látszik, egy koppintás.

### H2 — Pakli-előkészítés / lefedettségi riport (host)

```
┌───────────────────────────────────────────────────────────────────┐
│  PAKLI ELŐKÉSZÍTÉSE                                                  │
│                                                                     │
│  Generálás…                                                         │
│  «████████████████████░░░░░░░░»  73%   (feldolgozva: 73 / 100)      │  ← élő progress + számláló
│  ↳ Évszámok lekérése (MusicBrainz)…                                 │  ← aktuális lépés (lassú, jelezni kell)
│                                                                     │
│  ── generálás kész ──────────────────────────────────────────────  │
│                                                                     │
│   ┌───────────────────────────────────────────────────────────┐   │
│   │   ✅  94 / 100 szám használható        (94% lefedettség)   │   │  ← nagy, zöld, megnyugtató fő szám
│   └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Kimaradt számok (6):                             [ mutat ▾ ]      │  ← összecsukható lista
│     • Nirvana – Something in the Way   → nincs preview             │
│     • XYZ – Cím                        → nincs évszám              │
│     …                                                               │
│                                                                     │
│                        [   SZOBA LÉTREHOZÁSA   ▶ ]                   │  ← csak ha ≥ 60 használható (D4)
└───────────────────────────────────────────────────────────────────┘
```
**Annotációk:**
- **< 60 használható kártya (D4):** a fő panel narancs/piros, a „Szoba létrehozása" **letiltva**, szöveg: „Ehhez a paklihoz kevés a játszható szám (60 kell). Próbálj hosszabb vagy ismertebb playlistet." + `[ Másik playlist ]` visszalépő gomb H1-re.
- A progress **soha nem tűnhet fagyottnak**: mindig mutassa az aktuális lépést (MusicBrainz lassú, 1 req/s), különben a host azt hiszi, elakadt.
- A kimaradt lista alapból **összecsukott** — a fő üzenet a nagy „használható" szám.

### H3 — Lobby (host)

```
┌───────────────────────────────────────────────────────────────────┐
│  CSATLAKOZZ A JÁTÉKHOZ!                                              │
│                                                                     │
│    ┌───────────────────┐        Szobakód:                           │
│    │                   │                                            │
│    │   ███ QR-KÓD ███  │          ┌───────────────────┐            │
│    │   ███       ███   │          │   R   G   B   Z    │            │  ← 4 betűs kód, HATALMAS, monospace
│    │   ███  ███  ███   │          └───────────────────┘            │     (3 m-ről olvasható)
│    │                   │                                            │
│    └───────────────────┘        hitster.app/play                    │  ← rövid URL kézi beíráshoz
│                                                                     │
│  ── Csatlakozott játékosok (3) ─────────────────────────────────   │
│                                                                     │
│    🟢 Anna        🔵 Bence        🟣 Csilla                          │  ← szín + monogram/ikon + név (nem csak szín!)
│                                    «…Dani csatlakozik»               │  ← élő, presence-alapú
│                                                                     │
│                                                                     │
│              [   START   ▶ ]   (aktív, ha ≥ 2 játékos)              │  ← D5: host nem számít bele
│              ↳ Legalább 2 játékos kell az induláshoz.               │  ← ha < 2, ez a szöveg + gomb letiltva
└───────────────────────────────────────────────────────────────────┘
```
**Annotációk:**
- A **QR és a kód egyszerre** látszik (PRD AC4.1) — QR a gyors útnak, kód annak, aki nem tud QR-t olvasni.
- A játékos-lista **valós idejű** (presence): csatlakozás/kilépés < 1 s (PRD AC6.1). Új játékos rövid „pop" animációval jelenik meg.
- Minden játékosnál **szín + monogram + név** — a színvakok és a 8 hasonló szín miatt (accessibility).
- Start gomb `disabled` < 2 játékosnál, alatta magyarázó szöveg (D5).

### H4 — Játék-képernyő (host) — RÉSZLETES (a közös élmény központja)

```
┌───────────────────────────────────────────────────────────────────┐
│  🔊  Most szól…                              Kör 7 · Pakli: 41 hátra│  ← fejléc: kontextus, halk
│                                                                     │
│               ╔═══════════════════════════╗                         │
│               ║                           ║                         │
│               ║             ?             ║   « ◐ pörgő »           │  ← „?" kártya, lassan forog (F1: egyszerű)
│               ║                           ║                         │
│               ╚═══════════════════════════╝                         │
│         «▶ ●━━━━━━━━━━━━━━━━━━━━━━░░░░░░░  0:18 / 0:30»              │  ← audio progress, nagy, jól látható
│                                                                     │
│         ┌─────────────────────────────────────────────┐           │
│         │  🟢 ANNA következik                          │           │  ← soron lévő játékos KIEMELVE (szín+név)
│         │  «húzza a kártyát…»                          │           │  ← élő státusz-szöveg
│         └─────────────────────────────────────────────┘           │
│                                                                     │
│  ── Játékosok idővonalai ───────────────────────────────────────   │
│                                                                     │
│  ▓🟢 Anna  ⟨F2:🪙2⟩   [1985][1991]«[ ? ]»[2004][2010][2019]        │  ← AKTÍV sor kiemelve; élő tükrözés a résben
│   🔵 Bence ⟨F2:🪙2⟩   [1972][1988][1995][2001][2015]                │
│   🟣 Csilla⟨F2:🪙1⟩   [1969][1980][2003][2012]                      │  ← mini-idővonalak, évszámokkal
│   🟠 Dani  ⟨F2:🪙2⟩   [1998][2007][2011]                            │
│                                                                     │
└───────────────────────────────────────────────────────────────────┘
```
**Annotációk (H4 — kiemelt képernyő):**
- **„?" kártya** középen, nagy: F1-ben lassú, egyszerű forgás (CSS `rotate`), nem látványshow. A cím/előadó **rejtve** (PRD AC8.2, anti-leak).
- **Audio progress**: vastag sáv + `mm:ss / 0:30`. Ez az egyetlen jel arról, meddig szól a zene — legyen távolról olvasható. Ha az audio nem indul (autoplay-policy), lásd 4.4 (nagy PLAY fallback a host képernyőn).
- **Soron lévő játékos kiemelése**: külön panel + az ő idővonal-sora `▓`-val kiemelve, a színével keretezve. A társaság mindig lássa, kire vár.
- **Élő tükrözés (PRD S10):** a soron lévő játékos idővonalán a `«[ ? ]»` kártya **valós időben** mozog a rések között, ahogy a telefonján húzza (Realtime broadcast, csak vizuális). Ez a közös élmény lényege.
- **Mini-idővonalak**: minden játékos sora az évszámokkal. F1-ben az évszám a beépült kártyák jele. Túl hosszú idővonal (10 kártya) esetén a sor **zsugorodik/görget** — de a soron lévőé mindig teljes.
- **⟨F2⟩ token-számláló (`🪙2`)** helye a név mellett fenntartva — F1-ben rejtve. Így F2-ben csak „megjelenik", nem tolja szét a layoutot.

### H5 — Reveal (host)

```
┌───────────────────────────────────────────────────────────────────┐
│                                                                     │
│                    ┌───────────────────────┐                        │
│                    │                       │                        │
│                    │   [ ALBUMBORÍTÓ ]     │   « flip » (F1: egyszerű 3D flip)
│                    │                       │                        │
│                    └───────────────────────┘                        │
│                                                                     │
│                       QUEEN                                         │  ← előadó, nagy
│                       Bohemian Rhapsody                             │  ← cím
│                       ┌─────────┐                                   │
│                       │  1975   │                                   │  ← ÉV, kiemelt, hatalmas
│                       └─────────┘                                   │
│                                                                     │
│           ╔═══════════════════════════════════════╗                 │
│           ║  ✅  ANNA jól rakta le!                ║                 │  ← helyes/hibás, szín + IKON + szöveg
│           ╚═══════════════════════════════════════╝                 │
│              (hibásnál:  ❌  „Nem talált — a kártya elszáll")         │
│                                                                     │
│           ⟨F2⟩ « steal-eredmények ide kerülnek »                    │  ← F2 hely fenntartva
│                                                                     │
│                    «következő kör 5 mp múlva…»                       │  ← auto-tovább visszaszámláló
└───────────────────────────────────────────────────────────────────┘
```
**Annotációk:**
- **Helyes/hibás**: soha ne csak szín döntse el — `✅ / ❌` ikon + szöveg + szín együtt (accessibility, PRD).
- **Év kiemelése**: ez a „megfejtés" magja, legyen a legnagyobb adat.
- **F1 flip**: egyszerű CSS/Framer 3D flip (kártya-hátoldalról az albumborítóra). Az F2 hozza a látványos reveal-show-t; a hely és a komponens (`RevealCard`) most is elkészül, csak a variánsa egyszerű.
- Az **auto-tovább** 5 mp (PLAN Realtime folyam), közben visszaszámláló — senki ne érezze, hogy elakadt.

### H6 — Győzelem (host)

```
┌───────────────────────────────────────────────────────────────────┐
│                        🎉  GYŐZELEM!  🎉                             │
│                                                                     │
│                     🟢  ANNA  nyert!                                 │  ← győztes: szín + monogram + név
│                                                                     │
│  ── Anna nyertes idővonala ─────────────────────────────────────   │
│   [1969][1972][1985][1991][1995][2001][2004][2010][2015][2019]     │  ← végigpörgethető/kiemelt idővonal
│    ✓    ✓    ✓    ✓    ✓    ✓    ✓    ✓    ✓    ✓                    │
│                                                                     │
│  ── Végeredmény ────────────────────────────────────────────────   │
│   🟢 Anna    10 kártya   🥇                                          │
│   🔵 Bence    7 kártya                                              │
│   🟣 Csilla   6 kártya                                              │
│   🟠 Dani     5 kártya                                              │
│                                                                     │
│   (megosztott győzelemnél — D3 — több 🥇 és „Holtverseny!" felirat)  │
│                                                                     │
│              [  ÚJRA  ↻ ]        [  Új pakli  ]                     │  ← Újra = ugyanaz a társaság+pakli
└───────────────────────────────────────────────────────────────────┘
```
**Annotációk:**
- **Megosztott győzelem (D3):** ha pakli kifogyott és holtverseny → több győztes, „Holtverseny!" felirat, mindenkinél 🥇.
- **„Újra"**: ugyanaz a pakli és társaság, új parti (PRD AC14.2). „Új pakli" → vissza H1-re.
- F1-ben az „idővonal végigpörgetése" lehet egyszerű highlight-sorozat; a látványos animáció F2.

### P1 — Csatlakozás (player, mobil)

```
┌───────────────────────┐
│  🎵 HITSTER            │
│                       │
│  Csatlakozz a         │
│  játékhoz             │
│                       │
│  Szobakód             │
│  ┌───┬───┬───┬───┐    │  ← 4 külön karakter-mező, nagy, auto-uppercase
│  │ R │ G │ B │ Z │    │     (QR-ból már kitöltve érkezik)
│  └───┴───┴───┴───┘    │
│                       │
│  Neved                │
│  ┌─────────────────┐  │
│  │ (Anna         ) │  │  ← egy soros, max ~12 karakter
│  └─────────────────┘  │
│                       │
│  Színed               │
│  🟢 🔵 🟣 🟠          │  ← 8 szín rácsban; foglalt = áthúzva/halvány
│  🔴 🟡 ⚪ 🟤          │     kiválasztott = keret + pipa
│  ↳ 🔵 foglalt (Bence)  │
│                       │
│  ┌─────────────────┐  │
│  │   BELÉPEK  ▶     │  │  ← alsó harmadban (thumb zone), teljes szélű
│  └─────────────────┘  │
└───────────────────────┘
```
**Annotációk:**
- **QR-ból érkezve** a szobakód-mezők **előre kitöltve** (PRD AC4.2) — a játékos csak nevet+színt ad meg.
- **Foglalt szín** (AC5.3): halvány + áthúzva + nem koppintható; a kiválasztott szín keretet + `✓`-t kap (szín ≠ egyetlen jel).
- **Belépek gomb**: alsó harmad, teljes szélesség, min. 56px magas (thumb zone). Csak kitöltött név + választott szín esetén aktív.
- Ha a szoba tele (8 fő, AC5.5) vagy nem létezik: érthető magyar hibaüzenet a mezők alatt.

### P2 / P2' — Várakozás és Megfigyelő nézet (player, mobil)

```
   P2 (lobby várakozás)              P2' (más játékos köre — megfigyelő)
┌───────────────────────┐        ┌───────────────────────┐
│ 🟢 Anna  (te)         │        │ 🔵 Bence köre         │  ← ki van soron (szín+név)
│                       │        │ «húzza a kártyát…»     │
│ Várj a hostra…        │        │                       │
│ «a host mindjárt      │        │ ── Bence idővonala ──  │
│  elindítja»           │        │ [72][88]«[?]»[01][15] │  ← élőben látod, hova húz (opcionális)
│                       │        │                       │
│ ── A te idővonalad ── │        │ ── A te idővonalad ── │
│  ┌─────────────────┐  │        │  [69][85][04][19]     │  ← a sajátod böngészhető
│  │  1994            │  │        │                       │
│  │  Kezdőkártya  ✓  │  │        │ Zene szól a közös      │
│  └─────────────────┘  │        │ képernyőn 🔊           │  ← a telefon nem játssza a zenét!
│                       │        │                       │
│ ── Többiek ──         │        │ Várd ki a köröd 🙂     │
│ 🔵 Bence  🟣 Csilla   │        │                       │
│ 🟠 Dani               │        │                       │
└───────────────────────┘        └───────────────────────┘
```
**Annotációk:**
- **A telefon NEM játssza a zenét** — a hangot a közös host képernyő adja (PLAN). A player nézet ezt jelzi is („Zene szól a közös képernyőn 🔊”), hogy senki ne keresse a telefonján a hangot.
- **P2 kezdőkártya** (PRD S7): felfedve, évvel — ez a viszonyítási pont.
- **P2' megfigyelő**: opcionálisan látszik, ahogy a soron lévő húz (a saját telefonján tükrözve). Fő cél, hogy a várakozó ne unatkozzon és értse, mi történik.
- P2 és P2' **ugyanaz a képernyő-váz**, más móddal (thumb-friendly, alul a saját idővonal).

### P3 — Tippelés (player, mobil) — LEGRÉSZLETESEBB (a játék szíve)

Ez a legfontosabb képernyő: **egy kézzel, hüvelykujjal, drag&droppal** kell a „?" kártyát a saját idővonal két meglévő kártyája **közé** húzni és lerakni, időlimiten belül.

```
┌───────────────────────────────────┐
│ 🟢 A TE KÖRÖD          ⏱ «0:47»    │  ← fejléc: „te jössz" + visszaszámláló (nagy, jobbra)
│                                   │     az utolsó 10 mp-ben piros + pulzál
├───────────────────────────────────┤
│                                   │
│   Húzd a helyére! 👇              │  ← egyszeri instrukció (első körben)
│                                   │
│        ╔═══════════════╗          │
│        ║               ║          │
│        ║       ?       ║  «húzható»│  ← a „?" kártya (drag-forrás), nagy, középen fent
│        ║               ║          │     megfogható bárhol a felületén
│        ╚═══════════════╝          │
│                                   │
│  ⟨F2⟩ ( ◻ Bemondom! ) — előadó/cím│  ← F2 bemondás-kapcsoló HELYE (F1: rejtve)
│                                   │
│ ── A te idővonalad ──────────────  │
│ ◄ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ►  │  ← vízszintesen görgethető sáv (nyilak jelzik: van még)
│                                   │
│   ┌────┐ ⇕ ┌────┐ ⇕ ┌────┐ ⇕ ┌───┐│  ← kártyák + KÖZTÜK rések (⇕ = drop-slot)
│   │1985│▒▒│1991│▒▒│2004│▒▒│2010││  ← a rések (▒▒) kiszélesednek, ha fölé húzol
│   └────┘   └────┘   └────┘   └───┘│
│    régebbi ◄─────────────► újabb  │  ← irány-címke (segít a mentális modellben)
│                                   │
│                                   │
├───────────────────────────────────┤
│   ┌─────────────────────────────┐ │
│   │        LERAKOM  ✓           │ │  ← nagy CTA, thumb zone, csak ha van kijelölt rés
│   └─────────────────────────────┘ │     rés nélkül: letiltva, „Húzd egy résbe"
└───────────────────────────────────┘
```

**P3 — részletes interakció-leírás (lásd még 4.1):**

1. **Elrendezés a thumb zone szerint.** A „?" kártya fent-középen (jól látható, nem takarja a hüvelykujj). Az idővonal a képernyő közepén. A **LERAKOM** gomb legalul, teljes szélességben — hüvelykujjal kényelmesen elérhető. A visszaszámláló jobbra fent (látótér, de nem az akció útjában).

2. **Vízszintesen görgethető idővonal.** A kártyák egy vízszintes, `overflow-x` sávban. A két szélen halvány gradiens + `◄ ►` nyíl jelzi, ha még van kártya kifelé. Görgetés hüvelykujjal (swipe). **Fontos:** a görgetés (pan) és a kártya-húzás (drag) elkülönítése — lásd 4.1.

3. **A rések (`TimelineSlot`).** Minden két szomszédos kártya **között**, valamint a két szélső **előtt/után** van egy drop-slot. Alapban keskeny (`▒▒`), de amikor a „?" kártya fölé kerül, **kiszélesedik és kivilágosodik** (aktív állapot), így egyértelmű, hova esne. Egyszerre csak egy rés lehet aktív (a legközelebbi a kártya középpontjához).

4. **Snap-viselkedés.** Húzás közben a „?" kártya követi az ujjat, de a **legközelebbi rés kiemelődik**. Elengedéskor a kártya **beugrik (snap)** az aktív résbe — nem marad „félúton". A kártya nem eshet a kártyák tetejére, csak résbe.

5. **Kijelölt rés + LERAKOM.** Miután a játékos elengedte egy résben, a „?" kártya ott „ül", a rés kiemelt marad (kijelölt állapot), és a **LERAKOM** gomb **aktívvá** válik. A játékos még áthúzhatja máshova, mielőtt megnyomja. A LERAKOM végleges (Edge Function `place_card`, PRD AC9.3).

6. **Visszaszámláló (D6).** A `⏱` a beállított időlimitről visszafelé. Utolsó 10 mp: piros + pulzálás + (F2: vibráció). **Lejáratkor (D6):** ha van kijelölt rés → az számít lerakásnak; ha nincs → a kártya elveszik (rossz tipp), a képernyő „Lejárt az idő!" visszajelzést ad, majd P5.

7. **Rés nélküli állapot.** Amíg a játékos nem tett a kártyát résbe, a LERAKOM **letiltva**, felirata segít: „Húzd egy résbe”.

> **Miért ez a legkritikusabb képernyő:** a teljes játékélmény ezen a 3–5 másodperces mozdulaton áll vagy bukik. Ha a drag&drop akadós, a rés bizonytalan, vagy a hüvelykujj takarja a fontos elemet, a party-hangulat megtörik. Ezért: nagy targetek, egyértelmű snap, tiszta thumb zone, és a görgetés/húzás gondos elkülönítése (4.1).

### P5 — Reveal-visszajelzés (player, mobil)

```
   Siker                               Kudarc
┌───────────────────────┐        ┌───────────────────────┐
│                       │        │                       │
│        ✅             │        │        ❌             │  ← nagy ikon (szín ≠ egyetlen jel)
│                       │        │                       │
│    Eltaláltad! 🎉     │        │   Nem talált 😅       │
│                       │        │                       │
│  A kártya beépült     │        │  A kártya elszállt    │  ← mi történt az idővonaladdal
│  az idővonaladba.     │        │  (rossz hely / lejárt)│
│                       │        │                       │
│  QUEEN – 1975         │        │  QUEEN – 1975         │  ← a megfejtés röviden itt is
│                       │        │                       │
│ ── A te idővonalad ── │        │ ── A te idővonalad ── │
│ [75][85][91][04][10]  │        │ [85][91][04][10]      │  ← frissült állapot
│                       │        │                       │
│ «következő kör…»      │        │ «következő kör…»      │
└───────────────────────┘        └───────────────────────┘
```
**Annotációk:**
- **F1: statikus visszajelzés** (ikon + szöveg + frissült idővonal). **F2:** haptikus (vibráció) — siker: rövid dupla; kudarc: egy hosszú (PRD S23). A design már most jelöli a vibráció-pontokat.
- A **megfejtés** (előadó + év) a player képernyőn is megjelenik röviden, hogy aki nem nézi épp a TV-t, az is lássa.
- **Reveal-visszajelzés = passzív:** a részletes reveal-show a host képernyőn (H5) zajlik; a telefon csak a személyes eredményt adja.
- Az anti-leak miatt (D7) a kártya adata csak **most** (reveal után) érkezik a player-klienshez.

---

## 4. Interakció-részletek

### 4.1 Drag & drop mobilon (P3) — a legfontosabb interakció

**Technológia:** dnd-kit (PLAN stack), touch szenzorral. Az alábbi viselkedést kell a Frontend Engineernek megvalósítania.

**a) Húzás indítása (touch).**
- A „?" kártya bárhol a felületén megfogható.
- **Aktivációs késleltetés / távolság:** a drag csak akkor induljon, ha az ujj kis távolságot (pl. ~8px) elmozdul VAGY rövid nyomva tartás (pl. ~150ms) után — hogy a véletlen koppintás ne indítson húzást, és hogy a **vízszintes görgetés (pan) ne keveredjen** a húzással. dnd-kit `TouchSensor` `activationConstraint`-tal.
- Húzás közben a kártya kissé **megnő + árnyékot kap** (kiemelkedik), és követi az ujjat (a `translate` az ujj pozíciójához igazítva, de az ujj alól kissé feljebb tolva, hogy a hüvelykujj ne takarja — „lift" offset).

**b) Görgetés vs. húzás elkülönítése (kritikus).**
- Az idővonal-sáv **vízszintesen görgethető**; a „?" kártya **húzható**. Ez a kettő ütközhet.
- Megoldás: a **görgetés a sávon** történik (a kártyák területén, ha épp nem a „?" kártyát fogja), a **húzás a „?" kártyán** indul, az aktivációs constrainttel megkülönböztetve. Amíg a „?" kártyát húzza, a sáv nem görög (a drag „elnyeli" a mozgást); húzás közben a sáv széléhez érve **auto-scroll** (dnd-kit auto-scroll) viszi tovább a nézetet, hogy távoli résekhez is elérjen.

**c) Rések és snap.**
- Minden rés egy `TimelineSlot` drop-target. Húzás közben a **kártya középpontjához legközelebbi** rés lesz aktív (kiemelt), a többi visszaáll.
- **Aktív rés** vizuálisan: kiszélesedik (a szomszédos kártyák kissé szétnyílnak, „hely nyílik"), színes keret (a játékos színe), halvány kitöltés — egyértelmű „ide fog kerülni".
- **Elengedéskor:** a kártya **beugrik (snap, rövid spring-animáció)** az aktív résbe. Nem marad félúton, nem lóg ki.

**d) Félbehagyott / érvénytelen húzás.**
- Ha a játékos elengedi a kártyát **résen kívül** (pl. üres helyen, a kártyák tetején, vagy visszahúzza a kiindulóhelyre): a kártya **visszaáll (spring-back)** a kiinduló pozíciójába (fent-középen), semmi nem történik, LERAKOM marad letiltva.
- Ha **egy már kijelölt résből** húzza el és résen kívül engedi: visszaáll a kiinduló „?" pozícióba, a korábbi kijelölés törlődik (nincs „ottfelejtett" kártya).
- **Nincs véletlen lerakás:** a résbe helyezés még NEM végleges — csak a **LERAKOM** gomb az (két lépés: helyezés + megerősítés). Ez véd a hüvelykujj-elcsúszástól.

**e) Időlimit-lejárat húzás közben (D6).**
- Ha a visszaszámláló lejár, miközben a kártya **résben ül** (kijelölt) → az a lerakás rögzül (`place_card`).
- Ha lejár, és a kártya **nincs résben** (még a kiinduló helyén / félúton) → **a kártya elveszik** (D6, rossz tipp), a húzás megszakad, „Lejárt az idő!" overlay, majd P5 (kudarc).

**f) Akadálymentesített alternatíva (fallback).**
- Aki nem tud/akar húzni (motoros nehézség, vagy a drag akad): **koppintásos mód** — koppints a „?" kártyára → koppints a célrésre → a kártya odaugrik. Ugyanúgy a LERAKOM erősíti meg. (dnd-kit `KeyboardSensor`/pointer alternatíva; F1-ben legalább a tap-to-place legyen meg.)

### 4.2 Host képernyő — élő tükrözés (S10)

- Amíg a soron lévő játékos a telefonján húz, a **host H4 idővonal-sorában** a `«[ ? ]»` kártya **valós időben** ugyanazok a rések között mozog (Realtime broadcast, `player: drag-pozíció`, PLAN).
- **Csak vizuális, nem játékállapot** (PRD AC10.1): jitter/késés esetén sem okoz hibás állapotot. Cél p95 < 500 ms (AC10.2).
- A tükrözés **throttle-ölt** (pl. ~10–15 update/s), hogy ne terhelje a Realtime-ot; a mozgás közti interpoláció simítja.
- A host oldalon a tükrözött kártya kissé **áttetsző/„szellem"** stílusú, hogy elváljon a már beépült kártyáktól (ez még nem végleges lerakás).

### 4.3 Hibaállapotok

**a) Lecsatlakozott játékos (presence).**
- **Host H3/H4:** a lecsatlakozott játékos neve **elhalványul** + `⚠ offline` jelölés (nem tűnik el, hogy a társaság tudja, ki esett ki). Visszatéréskor (reconnect, PRD S15) visszaszíneződik, rövid „vissza" jelzéssel.
- **Player:** ha a saját kliens veszti a kapcsolatot → **„Újracsatlakozás…" overlay** pörgővel, nem üres képernyő. Sikeres reconnect után folytatja ott, ahol volt (localStorage identitás).
- **F1 megjegyzés:** az auto-skip (lecsatlakozott soron lévő) F2 (PRD S25). F1-ben a reconnect a fő védelem; a design a „⚠ offline” jelzést már most tartalmazza.

**b) Audio nem indul el (autoplay-policy) — KRITIKUS.**
- A böngészők (főleg iOS Safari) blokkolják a felhasználói interakció nélküli `<audio>` autoplayt. A host képernyőn a kör elején elinduló preview **nem indulhat el magától**.
- **Megoldás:** a host lobbyból az első Start gomb egyben az audio „feloldása" (user gesture) — de biztonsági hálóként **minden körben**, ha az audio nem indul el, a host H4 képernyőn egy **nagy, központi PLAY gomb** jelenik meg overlay-ként:

```
        ┌───────────────────────────────┐
        │   ▶  Koppints a lejátszáshoz  │   ← nagy, elkerülhetetlen, host képernyőn
        │   (a böngésző kérte)          │
        └───────────────────────────────┘
```
  - Egy koppintás elindítja az audiót és a kör folytatódik. A visszaszámláló (a soron lévő játékosnál) **csak az audio tényleges indulása után** induljon, hogy senki ne veszítsen időt a fallback miatt.
  - A design ezt a `AudioUnlockOverlay` komponensként kezeli — mindig kéznél, csak akkor jelenik meg, ha kell.

**c) Egyéb hibák.**
- **Pakli-generálás hiba (H2):** érthető magyar üzenet (AC1.6), retry gomb.
- **Szoba nem létezik / tele (P1):** magyar hibaüzenet a mezők alatt, nem néma hiba.
- **Host lecsatlakozik:** a player nézeteken „Szünet — a host újracsatlakozik…” overlay (PLAN: 2 perc türelmi idő). Nem „vége a játéknak" — csak szünet.

### 4.4 Audio és a host mint hang-forrás

- **Csak a host eszköz szól** (PLAN). A player nézeteken vizuálisan jelezzük („Zene szól a közös képernyőn 🔊”), hogy senki ne keresse a hangot a telefonján, és ne is próbálja lejátszani (anti-leak, D7: a player nem is kapja meg a preview URL-t).
- A host audio-progress (H4) a `<audio>` `timeupdate`-jéből él; ha az elem `stalled`/`error` → a 4.3/b PLAY-fallback lép be.

---

## 5. Komponenslista (újrafelhasználható komponensek)

> Props-vázlat (nem végleges API — a Frontend Engineer finomítja). A cél: konzisztens építőelemek host és player nézeten át. A ⟨F2⟩ jelölt propok/komponensek helye fenntartva, F1-ben nem aktívak.

### 5.1 Játék-domain komponensek

| Komponens | Felelősség | Props (vázlat) |
|---|---|---|
| **`TimelineCard`** | Egy idővonal-kártya (év + állapot). Használ: player idővonal, host mini-idővonal, reveal, győzelem. | `year: number`, `title?`, `artist?` (csak felfedettnél), `state: 'revealed' \| 'placed' \| 'ghost' \| 'unknown'`, `size: 'sm' \| 'md' \| 'lg'`, `color?` (tulajdonos színe) |
| **`MysteryCard`** | A „?" kártya (drag-forrás P3-on, pörgő a H4-en). | `spinning?: boolean`, `draggable?: boolean`, `size` |
| **`Timeline`** | Vízszintes, görgethető idővonal-konténer, rések kezelése. | `cards: TimelineCard[]`, `slots: boolean` (rések aktívak-e), `activeSlotIndex?`, `scrollable`, `owner` |
| **`TimelineSlot`** | Egy drop-slot két kártya között (P3). | `index`, `active: boolean`, `color`, `onDrop` |
| **`CountdownTimer`** | Vizuális visszaszámláló (P3 + F2 steal). | `seconds`, `warningAt?` (mp, alap 10), `urgent: boolean` (szín/pulzálás), `paused?` |
| **`RevealCard`** | Az albumborító + adatok flip-kártyája (H5, P5). | `artworkUrl`, `title`, `artist`, `year`, `flipped: boolean`, `variant: 'simple' \| 'show'` (F1: simple) |
| **`OutcomeBanner`** | Helyes/hibás visszajelzés (ikon+szín+szöveg). | `outcome: 'correct' \| 'wrong' \| 'timeout'`, `playerName?`, `color?` |
| **`PlayerTimelineRow`** | Host H4 egy játékos-sora (név + token-hely + mini-idővonal). | `player`, `cards`, `isActive`, `ghostSlotIndex?` (élő tükrözés), ⟨F2⟩`tokens?` |

### 5.2 Lobby / identitás komponensek

| Komponens | Felelősség | Props (vázlat) |
|---|---|---|
| **`RoomCodeBadge`** | A 4 betűs szobakód nagy megjelenítése (host lobby). | `code: string`, `size: 'lg' \| 'xl'` |
| **`QRCodePanel`** | QR-kód a `/play/[room]` URL-re + rövid URL. | `joinUrl`, `size` |
| **`RoomCodeInput`** | 4 karakteres kód-bevitel (player P1). | `value`, `onChange`, `autoUppercase`, `prefilled?` |
| **`PlayerBadge`** | Játékos-jelvény: szín + monogram/ikon + név (mindenhol). | `name`, `color`, `state: 'online' \| 'offline' \| 'active'`, `size`, ⟨F2⟩`tokens?` |
| **`ColorPicker`** | 8 szín rácsos választó, a már használt színek darabszámmal és nevekkel jelölve, de újra választhatók. | `colors`, `taken: string[]`, `selected`, `onSelect` |
| **`PlayerList`** | Csatlakozott játékosok listája (host lobby, player várakozó). | `players[]`, `layout: 'grid' \| 'row'` |

### 5.3 Host / rendszer komponensek

| Komponens | Felelősség | Props (vázlat) |
|---|---|---|
| **`AudioProgressBar`** | Host lejátszás-progress (H4). | `current`, `duration`, `playing` |
| **`AudioUnlockOverlay`** | Nagy PLAY fallback autoplay-blokknál (4.3/b). | `visible`, `onUnlock` |
| **`CoverageReport`** | Lefedettségi riport (H2): fő szám + kimaradt lista. | `usable`, `total`, `pct`, `excluded[]`, `meetsMinimum: boolean` (D4) |
| **`GenerationProgress`** | Pakli-generálás progress + aktuális lépés (H2). | `processed`, `total`, `currentStep` |
| **`SegmentedControl`** | Szegmentált választó (H1: limit, időlimit). | `options[]`, `value`, `onChange` |
| **`ConnectionOverlay`** | „Újracsatlakozás…" / „Szünet — host offline" overlay. | `mode: 'reconnecting' \| 'host-paused'` |
| **`AppButton`** | Egységes gomb (elsődleges/másodlagos/letiltott). | `variant: 'primary' \| 'secondary' \| 'ghost'`, `size`, `disabled`, `fullWidth` |

### 5.4 ⟨F2⟩ előre tervezett (F1-ben nem épül meg, de a hely megvan)

| Komponens | Felelősség |
|---|---|
| **`TokenCounter`** | Token-számláló (`🪙 × n`) a `PlayerBadge`/`PlayerTimelineRow` mellett. |
| **`StealButton`** | Steal-gomb + pozíciójelölő a P4 steal-képernyőn. |
| **`GuessInput`** | „Bemondom!" előadó/cím beviteli mezők (P3-on a kapcsoló alatt). |

---

## 6. Style guide

### 6.1 Hangulat és alapok

- **Party / klub, sötét téma.** Este, nappaliban, közös nagy képernyőn is jól nézzen ki. Sötét alap, élénk akcentszínek (a játékos-színek adják a színt), visszafogott „chrome" (a UI ne vonja el a figyelmet a zenéről és a kártyáktól).
- **Két méret-világ:** host = *nagy* (3 m-ről olvasható), player = *thumb-friendly* (nagy targetek, alsó akciók).

### 6.2 Színpaletta

**Alap / felület (sötét):**

| Token | Érték (javaslat) | Használat |
|---|---|---|
| `--bg` | `#0B0B14` (majdnem fekete, kékes) | app háttér |
| `--surface` | `#16161F` | kártyák, panelek |
| `--surface-2` | `#22222E` | kiemelt panel, input |
| `--border` | `#33333F` | elválasztók, keretek |
| `--text` | `#F2F2F7` | elsődleges szöveg |
| `--text-muted` | `#A0A0B0` | másodlagos szöveg |

**Szemantikus:**

| Token | Érték | Használat |
|---|---|---|
| `--accent` | `#7C5CFF` (lila) | elsődleges CTA, márka-akcent |
| `--success` | `#2ECC71` | helyes tipp, „használható" |
| `--danger` | `#FF4D5E` | hibás tipp, hiba, sürgős timer |
| `--warning` | `#FFB020` | figyelmeztetés (< 60 kártya, offline) |

**8 játékos-szín (accessibility-vizsgált, egymástól jól elváló):**

| # | Név | Érték (javaslat) | Ikon/monogram-kontraszt |
|---|---|---|---|
| 1 | Zöld | `#2ECC71` | sötét szöveg a chipen |
| 2 | Kék | `#3B9DFF` | világos |
| 3 | Lila | `#B15CFF` | világos |
| 4 | Narancs | `#FF8A3D` | sötét |
| 5 | Piros | `#FF4D5E` | világos |
| 6 | Sárga | `#FFD23F` | sötét |
| 7 | Türkiz | `#1ED9C9` | sötét |
| 8 | Rózsaszín | `#FF6FB5` | sötét |

> **Szabály:** a szín **soha** nem az egyetlen megkülönböztető jel. Minden játékos-színhez tartozik a **név** és egy **monogram/ikon** (pl. a név első betűje a `PlayerBadge`-en). Ez kezeli a színvakságot és a 8 hasonló szín (pl. zöld-türkiz, lila-rózsaszín) elkülönítését. Ahol lehet, az azonos árnyalatú párok (zöld/türkiz, piros/rózsaszín) **ne kerüljenek egymás mellé** a lobby-listában.

### 6.3 Tipográfia

- **Rendszerfontok** (nincs webfont-betöltés → gyorsabb, offline-barát, telepítés-mentes szellemhez illik):
  `font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;`
- **Számokhoz** (évszámok, szobakód, timer): tabular / monospace jelleg a stabil szélességért — `font-variant-numeric: tabular-nums;`, a szobakódnál `ui-monospace, "SF Mono", monospace`.

**Méret-skála — HOST (3 m-ről olvasható, nagy):**

| Szerep | Méret (javaslat) |
|---|---|
| Szobakód (H3) | 96–128px, bold, monospace |
| Reveal év (H5) | 72–96px |
| Reveal előadó/cím | 40–56px |
| „Anna következik" (H4) | 32–40px |
| Idővonal évszámok (H4 mini) | 24–28px |
| Fejléc/kontextus | 20–24px |

**Méret-skála — PLAYER (mobil, közeli):**

| Szerep | Méret (javaslat) |
|---|---|
| Képernyő-cím („A TE KÖRÖD") | 24–28px, bold |
| Timer (P3) | 28–32px |
| Idővonal évszámok | 18–20px |
| Gomb-felirat (LERAKOM) | 20–22px, bold |
| Törzsszöveg | 16px (min. — sose kisebb) |
| Segéd-szöveg | 14px |

### 6.4 Spacing és forma

- **Spacing skála (4px alap):** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. A player képernyőkön a fő szekciók közt min. 16px, a thumb-zone gomb körül min. 24px.
- **Radius:** kártyák `16px`, gombok `12px`, kis chipek/badge `999px` (pill).
- **Elevation:** sötét témában árnyék helyett/mellett **világosodó felület** (`--surface` → `--surface-2`) jelzi a kiemelést; a húzott „?" kártya kap valódi árnyékot (drop-shadow) a „kiemelkedés" érzethez.

### 6.5 Animáció-elvek

- **F1: visszafogott, gyors, funkcionális.** Minden átmenet ~150–250ms, `ease-out`. Cél: az UI érezhető, de nem lassítja a játékot.
  - **Reveal-flip (H5):** egyszerű 3D flip (~400ms), a „?" hátoldalról az albumborítóra. Nem show, csak flip.
  - **Snap (P3):** rövid spring, hogy a kártya „beugorjon" a résbe (~200ms).
  - **Rés-kiemelés (P3):** a szomszéd kártyák szétnyílása ~120ms.
  - **Lobby csatlakozás:** rövid „pop" scale-in (~200ms).
- **F2: látványos** (reveal-show, konfetti, hangeffekt-szinkron, haptika). A layout és a komponens (`RevealCard variant='show'`) helye kész; F2-ben csak a variánst kell aktiválni.
- **Elérhetőség:** `prefers-reduced-motion` esetén a pörgés/flip/konfetti kikapcsol, cross-fade marad. A visszaszámláló-pulzálás halványabb.

### 6.6 Ikonográfia

- Egyszerű, vonalas ikonok (pl. Lucide-jellegű). Kulcs-ikonok: `▶` play, `✓` helyes, `✕` hibás, `⏱` timer, `🔊` hang, `⚠` offline/figyelem, `↻` újra, `🪙` (F2) token.
- Az emoji-k (🎉, 🔊 stb.) F1-ben megengedettek a party-hangulathoz, de a **funkcionális** jelzés (helyes/hibás, offline) mindig vonalas ikon + szöveg, ne csak emoji.

---

## 7. Accessibility minimum (amire a Frontend Engineernek figyelnie kell)

- **Kontraszt (WCAG AA):**
  - Szöveg a sötét felületeken min. **4.5:1** (törzs), nagy szövegnél (host!) min. **3:1**.
  - A `--text` a `--bg`/`--surface` felett bőven AA felett; a `--text-muted`-ot ne használjuk kritikus infóra kis méretben.
  - A játékos-színek chipjein a monogram kontrasztja a 6.2 táblázat szerint (sötét vagy világos szöveg a színtől függően).
- **Szín ≠ egyetlen jel (kritikus):**
  - Játékos-azonosítás: szín **+ név + monogram/ikon** mindig együtt.
  - Helyes/hibás: `✅/❌` ikon **+ szöveg** + szín (nem csak zöld/piros).
  - Aktív rés / soron lévő: kiemelés **+ keret/vastagítás**, nem csak színváltás.
- **Touch-target méret:** minden interaktív elem **min. 44×44px** (a LERAKOM, Belépek, színválasztó chipek, kód-mezők, Start ennél nagyobb). A színválasztó chipek min. 44px, köztük ≥ 8px rés (ne lehessen mellényúlni).
- **Fókusz-állapotok:** minden interaktív elemnek látható fókusz-gyűrűje (billentyűzet/tap), `--accent` színnel; a drag alternatívája (tap-to-place, 4.1/f) fókuszálható.
- **Szemantika:** gombok `<button>`, űrlapmezők `<label>`-lel; a host képernyő élő állapotai `aria-live` régióban (pl. „Anna következik", „Lejárt az idő").
- **Reduced motion:** `prefers-reduced-motion` — pörgés/flip/pulzálás visszafogva (6.5).
- **Szövegméret:** player törzsszöveg soha < 16px; host adatok nagyok. A UI bírja a 200%-os böngésző-zoomot törés nélkül a player nézeten.
- **Nyelv:** az UI magyar (`lang="hu"`); a hibaüzenetek is magyarul, érthetően.

---

## 8. Reszponzivitás

- **Player nézetek (P1–P5): mobil-first, egy oszlop.** ~360px-től felfelé tervezve. A fő akció mindig az alsó képernyőharmadban (thumb zone). Landscape mobilon a P3 idővonal marad vízszintes, a LERAKOM jobbra/alulra kerül (a magasság szűkös).
- **Host nézetek (H1–H6): nagy képernyőre (TV/laptop) optimalizálva**, de tableten/nagy telefonon is működjön (a host lehet telefon is, PLAN). Landscape az alapértelmezett elrendezés. Kis host-eszközön (telefon) a H4 mini-idővonalak függőlegesen listázódnak, a „?" kártya + audio-progress marad felül.
- **Breakpoint-ok (javaslat):** `sm` 360, `md` 768 (tablet host), `lg` 1024, `xl` 1280+ (TV/laptop host). A player ritkán lép `md` fölé; a host `lg`+-on „színpad" elrendezésű.

---

## 9. Nyitott design-kérdések (KÉRDÉS A TULAJHOZ)

Ezek nem blokkolják az F1 implementáció-indulást (mindegyikre van észszerű alapértelmezés a fenti tervben), de a tulaj döntése finomíthatja:

- **KÉRDÉS A TULAJHOZ (D-Q1):** A player P2' megfigyelő nézeten **mutassuk-e** a soron lévő játékos élő húzását (a saját telefonján is), vagy elég, ha ez csak a közös host képernyőn látszik? (Több Realtime-forgalom vs. gazdagabb telefonos élmény; alapértelmezésként a tervben opcionálisan mutatjuk.)
- **KÉRDÉS A TULAJHOZ (D-Q2):** A **márka-akcentszín** legyen-e a javasolt lila (`#7C5CFF`), vagy van kedvenc party-szín? (Ez befolyásolja a CTA-kat és a hangulatot; a 8 játékos-szín ettől független.)
- **KÉRDÉS A TULAJHOZ (D-Q3):** Az 5 = gyors mód esetén a **győzelmi képernyő** ugyanolyan „végigpörgetős" legyen-e, vagy rövidebb? (Rövid partinál a hosszú győzelmi show fárasztó lehet.)
- **KÉRDÉS A TULAJHOZ (D-Q4):** A P3 **koppintásos fallback** (tap-to-place) bekerüljön-e már F1-be az akadálymentesítéshez, vagy elég a drag&drop, és a tap-mód F2? (A tervben F1-ajánlott, mert olcsó és sokat véd a „nem megy a húzás" frusztráció ellen.)

---

*Következő lépés a csapat-munkamódszer szerint: a Frontend Engineer ebből a DESIGN.md-ből és az ARCHITECTURE.md-ből implementál. Eltérés esetén ezt a doksit is frissíteni kell (CLAUDE.md szabály).*
