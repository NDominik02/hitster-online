# Hitster Online — PRD (Product Requirements Document)

*Munkacím: „Idővonal" · Verzió: 1.0 · Készítette: Product Manager agent · Forrás: [docs/PLAN.md](PLAN.md)*

> Ez a dokumentum a PLAN.md termék-tulajdonos által jóváhagyott döntéseit strukturálja mérhető követelménnyé. A PLAN.md-ben rögzített játékszabályok és fázis-döntések **véglegesek**; ez a PRD nem módosítja, csak követelménnyé bontja őket. Eltérés esetén a PLAN.md az irányadó, és a PM-et frissíteni kell.

---

## 1. Összefoglaló

A Hitster Online egy böngészőből játszható, telepítés nélküli party-játék baráti társaságoknak, akik személyesen összeülnek. Egy közös **host képernyő** (laptop/TV/tablet/telefon hangszóróval) szolgáltatja a zenét és a közös látványt, a játékosok pedig a **saját telefonjukon** húzzák a felismert zeneszámokat időrendi helyükre a saját idővonalukon. A paklik bármilyen Spotify playlistből generálhatók.

A termék hobbi- / baráti projekt: **nincs kereskedelmi cél**. A siker mércéje, hogy egy 2–8 fős társaság gond nélkül végig tud játszani egy jó hangulatú partit. Elsődleges nyelv a magyar, üzemeltetési költség-cél **0 Ft** (Vercel + Supabase free tier).

Ez a PRD az MVP-t a PLAN.md **F1 fázisával** azonosítja (játszható core loop token/steal/bemondás/Premium nélkül), ezt bontja le részletesen mérhető acceptance criteria-val. Az F2–F4 fázisokat user story szinten „későbbre" sorolja.

---

## 2. User Personák

### Persona 1 — „A Host" (Máté, a házigazda)
- **Kontextus:** ő hívta össze a társaságot, van egy laptopja vagy okostévéje jó hangszóróval, és Spotify Premium fiókja. Ő nyitja meg a játékot, ő állítja be a paklit.
- **Cél:** minél kevesebb súrlódással elindítani egy partit — beilleszt egy playlistet, kirakja a QR-kódot, és megy a móka.
- **Fájdalompontok:** ne kelljen appot telepíteni senkinek; ne akadjon el a pakli-generálás; ha valaki lecsatlakozik, ne dőljön össze a játék.
- **Technikai jártasság:** közepes; Spotify linket be tud másolni, QR-t ki tud rakni.

### Persona 2 — „A Játékos" (Anna, a vendég)
- **Kontextus:** beesett a buliba, csak a telefonja van nála, nem akar semmit telepíteni vagy regisztrálni.
- **Cél:** gyorsan becsatlakozni (QR beolvasás), nevet+színt választani, és játszani; a telefonján drag&droppal a jó helyre rakni a számot.
- **Fájdalompontok:** bonyolult belépés; kicsi/nehezen húzható UI a telefonon; ha frissíti a böngészőt, ne essen ki a játékból.
- **Technikai jártasság:** vegyes; a UI legyen annyira egyszerű, hogy a legkevésbé tech-affin vendég is boldoguljon.

### Persona 3 — „A Pakli-készítő" (a Host egy alesete)
- **Kontextus:** ugyanaz a személy, mint a Host, de a pakli-előkészítés fázisában más az igénye: tudni akarja, hogy a kedvenc playlistje **valóban játszható-e** (van-e elég év-adat és preview).
- **Cél:** átlátható lefedettségi riportot kapni, hogy eldönthesse, indul-e ezzel a paklival, vagy másikat választ.

---

## 3. User Story-k (prioritással és fázis-címkével)

**Jelölés:** Prioritás `P0` = MVP-kritikus (F1) · `P1` = fontos, de későbbi fázis · `P2` = nice-to-have. Fázis-címke a PLAN.md ütemtervéből.

### F1 — Játszható MVP (mind P0, hacsak nincs jelölve)

| ID | Story | Prio | Fázis |
|----|-------|------|-------|
| S1 | Mint **Host**, szeretnék egy Spotify playlist URL-ből paklit generálni, hogy a saját zenéinkkel játszhassunk. | P0 | F1 |
| S2 | Mint **Pakli-készítő**, szeretnék lefedettségi riportot látni a generálás után, hogy tudjam, játszható-e a pakli. | P0 | F1 |
| S3 | Mint **Host**, szeretnék szobát létrehozni és beállítani a győzelmi limitet és időlimitet, hogy a társasághoz igazítsam a partit. | P0 | F1 |
| S4 | Mint **Host**, szeretnék egy QR-kódot és 4 betűs szobakódot megjeleníteni a lobbyban, hogy a vendégek gyorsan csatlakozhassanak. | P0 | F1 |
| S5 | Mint **Játékos**, szeretnék QR-ból vagy kód beírásával csatlakozni, majd nevet és színt választani, hogy telepítés nélkül beszállhassak. | P0 | F1 |
| S6 | Mint **Host**, szeretném a lobbyban látni a csatlakozott játékosokat, és egy Start gombbal elindítani a játékot, hogy tudjam, mindenki bent van. | P0 | F1 |
| S7 | Mint **Játékos**, induláskor kapjak egy felfedett kezdőkártyát az idővonalamra, hogy legyen mihez viszonyítanom. | P0 | F1 |
| S8 | Mint **Host**, egy kör elején induljon el a soron következő kártya 30 mp-es preview-ja a host eszközön, cím/előadó rejtve, hogy a társaság hallja a zenét. | P0 | F1 |
| S9 | Mint **soron lévő Játékos**, szeretném a „?" kártyát a saját idővonalam rései közé húzni és lerakni időlimiten belül, hogy tippeljek a szám korára. | P0 | F1 |
| S10 | Mint **résztvevő**, szeretném a host képernyőn élőben látni, ahogy a soron lévő játékos tologatja a kártyát, hogy közös élmény legyen. | P1 | F1 |
| S11 | Mint **résztvevő**, szeretnék egy reveal-képernyőt a lerakás után (albumborító, előadó, cím, év, helyes/hibás visszajelzés), hogy kiderüljön a megfejtés. | P0 | F1 |
| S12 | Mint **Játékos**, jó helyre rakott kártya épüljön be az idővonalamba, rossz helyre rakott szálljon el, hogy legyen tétje a tippnek. | P0 | F1 |
| S13 | Mint **résztvevő**, az azonos évszámú szomszéd melletti lerakás mindkét oldalon számítson helyesnek, hogy ne büntessük az egyértelmű helyzeteket. | P0 | F1 |
| S14 | Mint **résztvevő**, az nyerjen, aki elsőként éri el a beállított kártyaszámot (alap: 10), és lássak győzelmi képernyőt, hogy legyen lezárása a partinak. | P0 | F1 |
| S15 | Mint **Játékos**, ha frissítem a böngészőt vagy megszakad a net, ugyanazzal az identitással térjek vissza a játékba, hogy ne essek ki. | P0 | F1 |
| S16 | Mint **résztvevő**, ha kifogy a pakli győzelem előtt, az nyerjen, akinek hosszabb az idővonala (döntetlennél nincs token F1-ben → lásd nyitott kérdés), hogy a játék mindig lezárható legyen. | P0 | F1 |

### F2 — A teljes játék (későbbre)

| ID | Story | Prio | Fázis |
|----|-------|------|-------|
| S20 | Mint **Játékos**, szeretnék tokeneket szerezni és költeni (steal, átugrás, azonnali kártya), hogy taktikázhassak. | P1 | F2 |
| S21 | Mint **soron lévő Játékos**, lerakás előtt bemondhassam az előadót és címet (fuzzy matching), hogy +1 tokent kapjak. | P1 | F2 |
| S22 | Mint **másik Játékos**, a steal-ablakban 1 tokenért fogadhassak, hogy a lerakás rossz, és megjelölhessem a helyes pozíciót, hogy ellophassam a kártyát. | P1 | F2 |
| S23 | Mint **résztvevő**, szeretnék látványos reveal-show animációt, hangeffekteket és haptikus visszajelzést (vibráció), hogy emlékezetes legyen. | P1 | F2 |
| S24 | Mint **Host**, egy vitagombbal érvényteleníthessek egy kört rossz évszám esetén, hogy kezeljük az adathibákat. | P1 | F2 |
| S25 | Mint **résztvevő**, egy lecsatlakozott játékos köre max 1× legyen kihagyható, utána auto-skip, hogy ne akadjon el a játék. | P1 | F2 |

### F3 — Premium és kényelem (későbbre)

| ID | Story | Prio | Fázis |
|----|-------|------|-------|
| S30 | Mint **Host**, bejelentkezhessek Spotify Premiummal, hogy 30 mp preview helyett teljes számok szóljanak (laptopon Web Playback SDK, mobilon Connect API). | P1 | F3 |
| S31 | Mint **Host**, egy pakli-könyvtárból újrahasználhassam a korábban generált vagy megosztott paklikat, hogy ne kelljen újragenerálni. | P2 | F3 |
| S32 | Mint **Host**, részletesebb beállításokat állíthassak (steal be/ki, gyors/maraton mód), hogy a társasághoz szabjam a játékot. | P2 | F3 |

### F4 — Extrák (későbbre)

| ID | Story | Prio | Fázis |
|----|-------|------|-------|
| S40 | Mint **társaság egyetlen eszközzel**, pass-and-play módban játszhassak („Add tovább Bencének" átadó-képernyők, steal kikapcsolva), hogy telefon nélkül is menjen. | P2 | F4 |
| S41 | Mint **résztvevő**, a parti végén statisztikákat lássak, hogy összehasonlíthassuk a teljesítményünket. | P2 | F4 |
| S42 | Mint **társaság**, távoli játék módban is játszhassak (nem egy helyben), hogy online is összejöhessünk. | P2 | F4 |
| S43 | Mint **résztvevő**, PWA-ként a kezdőképernyőre telepíthessem, hogy gyorsabban elérjem. | P2 | F4 |

> **F0 — Kockázat-validálás (előfeltétel, nem user-facing):** csupasz script `playlist URL → pakli`, ami méri a valós lefedettségi %-ot (magyar zenékre külön!) és az évszám-pontosságot. Ez az F1 technikai előfeltétele; a részleteit lásd az Acceptance Criteria „Zene-pipeline" szakaszában és a Nyitott kérdésekben.

---

## 4. MVP scope — mi kerül be és mi marad ki (indoklással)

### Bekerül az MVP-be (F1)

| Terület | Miért kell |
|---------|-----------|
| Pakli-generálás Spotify playlist URL-ből + lefedettségi riport (S1, S2) | A zene a játék lényege; enélkül nincs mit játszani. F0 validálja, hogy ez egyáltalán működik magyar playlisteken. |
| Szoba létrehozás, lobby QR-ral + szobakóddal, csatlakozás (S3–S6) | A „telepítés nélkül, gyorsan beszállni" a termék fő értékajánlata. |
| Anonymous Auth + reconnect (S15) | Party-környezetben a böngésző-frissítés / hálózat-ingadozás garantált; enélkül a parti félbeszakad. Kritikus a „gond nélkül végigjátszani" sikermércéhez. |
| Core loop: húzás → preview → drag&drop → reveal → pontozás (S7–S13) | Ez maga a játék. Token/steal/bemondás nélkül is teljes, játszható élmény. |
| Győzelem + kifogyó pakli kezelése (S14, S16) | A partinak lezárása kell; enélkül nincs sikerélmény. |
| Azonos-évszám élsimítás (S13) | Alap fairness szabály, a PLAN.md véglegesként rögzíti; olcsó, de sokat dob a hangulaton. |

### Kimarad az MVP-ből (későbbi fázis)

| Kimaradó | Miért NEM most |
|----------|----------------|
| **Tokenek, steal, bemondás** (S20–S22, F2) | A core loop token nélkül is teljes, játszható játék. A token-rendszer jelentős szerver-logikát (steal-ablak timer, optimista zár, token-könyvelés) és extra UI-t igényel — az MVP kockázatát feleslegesen növelné. Előbb bizonyítsuk, hogy az alapkör jó. |
| **Spotify Premium mód** (S30, F3) | Az ingyenes iTunes 30 mp preview mindig működik és 0 Ft. A Premium mód (Web Playback SDK / Connect API) platformfüggő és a Spotify dev-kvótába ütközhet — nem szabad tőle függővé tenni az első játszható verziót. |
| **Reveal-show animációk, hangeffekt, vibráció** (S23, F2) | Az MVP-ben elég egy funkcionális reveal (borító+adatok+helyes/hibás). A „csillogás" fontos a hangulathoz, de nem blokkolja a végigjátszhatóságot. |
| **Vitagomb, auto-skip lecsatlakozásnál** (S24, S25, F2) | Az MVP reconnect (S15) lefedi a legfontosabb hibatűrést. A finomabb esetek (rossz évszám vita, auto-skip) F2-re halaszthatók anélkül, hogy a parti ellehetetlenülne. |
| **Pakli-könyvtár, részletes beállítások** (S31, S32, F3) | Egy generálás per parti elég az MVP-hez; a könyvtár kényelmi funkció. |
| **Pass-and-play, statisztikák, távoli mód, PWA** (S40–S43, F4) | Egyértelmű extrák; egyik sem szükséges egy sikeres, jó hangulatú személyes partihoz. |

**Scope creep figyelmeztetés:** a token/steal/bemondás hármas csábító, mert a „teljes Hitster élményt" adja — de együtt kb. akkora munka, mint a teljes F1 core loop. Ha ezek beszivárognak az MVP-be, az veszélyezteti a „gyorsan legyen valami játszható" célt. Javaslat: F1 legyen keményen a token-mentes core loop, és csak működő MVP után nyíljon F2.

---

## 5. Acceptance Criteria (minden F1 story-hoz, mérhető)

> Konvenció: minden kritérium ellenőrizhető/megfigyelhető. Ahol számot adunk meg, az a PLAN.md-ből ered, vagy alapértelmezésként javasolt (a javasoltak a Nyitott kérdésekben jelölve).

### S1 — Pakli-generálás playlist URL-ből
- **AC1.1** Érvényes, publikus Spotify playlist URL beillesztésekor a rendszer elindítja a generálást és a H2 képernyőn progress bar jelenik meg.
- **AC1.2** A generálás minden track-hez megkísérli előállítani: cím, előadó, album, **eredeti megjelenési év** (MusicBrainz first release date, fallback album-év), 30 mp-es preview URL (iTunes, fuzzy match cím+előadó).
- **AC1.3** A rendszer betartja a külső API rate limiteket (MusicBrainz ≤ 1 req/s sorosítva, iTunes throttle); a generálás nem szakad meg 429/timeout miatt, hanem cache-el és folytat.
- **AC1.4** Preview URL vagy évszám nélküli track **kiesik** a pakliból, és megjelenik a problémás számok listájában.
- **AC1.5** A generálás eredménye cache-elt, újrafelhasználható pakli (`decks` + `deck_cards` sorok), amely **link útján megosztható**.
- **AC1.6** Érvénytelen/nem elérhető URL esetén a Host érthető magyar hibaüzenetet kap, nem néma hibát.

### S2 — Lefedettségi riport
- **AC2.1** A generálás végén a Host lát egy riportot: hány szám használható a teljesből (pl. „94/100 szám használható"), és a **lefedettségi százalékot**.
- **AC2.2** A problémás számok listázva vannak, számonként az okkal (nincs preview / nincs évszám).
- **AC2.3** A rendszer figyelmeztet, ha a használható pakliméret a minimum alatt van (**~30 + játékosszám × 15**), és nem engedi elindítani a játékot, amíg nincs elég kártya. *(A pontos minimum-formula és a játékosszámhoz kötöttség megerősítendő — lásd Nyitott kérdés Q4.)*

### S3 — Szoba létrehozás + beállítások
- **AC3.1** A Host a H1 képernyőn megadhatja a pakli forrását (playlist URL) és a beállításokat: **győzelmi limit** (alap 10; 5 = gyors, 15 = maraton) és **időlimit** (alap 90 mp).
- **AC3.2** Szoba létrehozásakor egyedi **4 betűs szobakód** generálódik, és a szoba `rooms` sorként létrejön `status = lobby` állapottal.
- **AC3.3** A beállítások a `rooms.settings` JSONB-ben tárolódnak, és a játék végéig érvényesek maradnak.

### S4 — Lobby QR + szobakód
- **AC4.1** A H3 lobby képernyőn nagy, mobilról jól beolvasható **QR-kód** és a **4 betűs szobakód** egyszerre látszik.
- **AC4.2** A QR-kód a `/play/[room]` csatlakozó URL-re mutat, amely megnyitva egyből a P1 csatlakozás képernyőre visz.

### S5 — Csatlakozás + név/szín
- **AC5.1** A Játékos QR-ból érkezve vagy a 4 betűs kód beírásával eljut a P1 képernyőre; **nem kell appot telepíteni és nem kell regisztrálni** (Anonymous Auth).
- **AC5.2** A Játékos megad egy nevet és választ egy színt; a szín a lobbyban és a host nézetben végig hozzá van rendelve.
- **AC5.3** Két játékos nem választhatja ugyanazt a színt egyszerre (a foglalt színek nem választhatók / feloldódik ütközés esetén).
- **AC5.4** Sikeres csatlakozás után a Játékos a P2 várakozó képernyőre kerül, és megjelenik a Host lobbyjában.
- **AC5.5** A szoba legfeljebb **8 játékost** fogad; a 9. csatlakozási kísérlet érthető üzenettel elutasításra kerül.

### S6 — Lobby lista + Start
- **AC6.1** A Host H3 képernyőjén valós időben frissül a csatlakozott játékosok listája (név + szín), játékos csatlakozásakor/kilépésekor 1 s-on belül.
- **AC6.2** A Start gomb csak akkor aktív, ha legalább **2 játékos** csatlakozott. *(A host mint játékos beleszámít-e a 2-be — lásd Q5.)*
- **AC6.3** Start megnyomásakor a szoba `status = playing`-re vált, és minden kliens (host + játékosok) átvált a játék nézetre.

### S7 — Kezdőkártya
- **AC7.1** Játékkezdéskor minden játékos **1 felfedett kezdőkártyát** kap a saját idővonalára (`timeline_cards` egy sor, `position` beállítva).
- **AC7.2** A kezdőkártya felfedett: a játékos látja a címét, előadóját és évét a saját nézetében.

### S8 — Preview lejátszás (rejtett)
- **AC8.1** Egy kör elején az Edge Function húz egy kártyát (`rounds` INSERT, `phase = playing`), és **kizárólag a host kliens** kap lejátszható preview-t.
- **AC8.2** A host képernyőn (H4) a cím és az előadó **rejtve** van; egy pörgő „?" kártya és a lejátszási progress látszik.
- **AC8.3** A soron következő kártya kiléte (cím/előadó/év/URI) a reveal pillanatáig **nem kerül ki a játékos-kliensek felé menő hálózati forgalomba** (anti-leak; a host opaque proxy/preview-tokent kap).
- **AC8.4** A preview kb. 30 mp-ig szól, vagy amíg a soron lévő játékos le nem rak; a host kliensen a lejátszás megbízhatóan elindul (`<audio>` elem).

### S9 — Drag & drop lerakás időlimittel
- **AC9.1** A soron lévő Játékos P3 képernyőjén vízszintesen görgethető idővonal jelenik meg, a „?" kártya a meglévő kártyák közötti résekbe húzható (dnd-kit).
- **AC9.2** Látható **visszaszámláló** fut az időlimitről (alap 90 mp); lejáratkor a rendszer a legutolsó választott pozícióba rak, vagy ha nincs, egyértelmű default szabály szerint jár el. *(A lejárati default viselkedés megerősítendő — lásd Q6.)*
- **AC9.3** A „LERAKOM" gombra a kliens **nem írja közvetlenül** a játéktáblát; egy Edge Function (`place_card`) rögzíti a `rounds.placement` értéket és lépteti a fázist.
- **AC9.4** Csak a soron lévő játékos tud lerakni; a többiek P2/megfigyelő nézetben vannak.

### S10 — Élő húzás tükrözése (P1)
- **AC10.1** Amíg a soron lévő játékos húzza a kártyát, a host képernyőn (H4) élőben látszik a mozgás (Realtime broadcast, csak vizuális, nem játékállapot).
- **AC10.2** A broadcast késleltetése érzékelhetően alacsony (cél: p95 < 500 ms); jitter esetén sem okoz hibás játékállapotot (mert csak vizuális).

### S11 — Reveal képernyő
- **AC11.1** Lerakás után az Edge Function (`resolve_round`) kiértékeli a kört, majd `phase = reveal`-re vált.
- **AC11.2** A host H5 képernyőjén megjelenik: **albumborító, előadó, cím, év**, és egyértelmű **helyes/hibás** visszajelzés.
- **AC11.3** A reveal pillanatáig a kártya adata nem volt elérhető a játékos-kliensek számára (RLS: `deck_cards`-ból csak a már felfedett kártyák SELECT-elhetők).

### S12 — Pontozás (beépül / elszáll)
- **AC12.1** Ha a lerakás helyes (a kártya éve a szomszédok közé esik), a kártya **beépül** a soron lévő játékos idővonalába (`timeline_cards` új sor).
- **AC12.2** Ha a lerakás helytelen, a kártya **elszáll** (nem épül be); F1-ben (steal nélkül) egyszerűen kikerül a játékból.
- **AC12.3** A helyesség kiértékelése kizárólag szerveroldalon (Edge Function) történik; a kliens csak a `rounds.outcome`-ot jeleníti meg.

### S13 — Azonos-évszám élsimítás
- **AC13.1** Ha a lerakott kártya éve **megegyezik** valamelyik szomszédos kártya évével, a mellette lévő **mindkét rés** helyesnek számít.
- **AC13.2** Ez a szabály a szerveroldali kiértékelésben van implementálva, és a reveal helyes/hibás visszajelzése ezt tükrözi.

### S14 — Győzelem
- **AC14.1** Amint egy játékos idővonala eléri a beállított győzelmi limitet (alap 10 kártya), az Edge Function `status = finished`-re vált, és a host H6 győzelmi képernyője megjelenik.
- **AC14.2** A győzelmi képernyőn látszik a győztes és az ő idővonala; van egy „Újra" lehetőség új parti indítására ugyanazzal a társasággal/paklival.

### S15 — Reconnect
- **AC15.1** A játékos-identitás **Anonymous Auth** + localStorage token révén túléli a böngésző-frissítést; a visszatérő játékos ugyanabba a szobába, ugyanazzal a névvel/idővonallal kerül vissza.
- **AC15.2** Ha egy játékos kliense átmenetileg elveszti a kapcsolatot, a Realtime presence jelzi a `connected` státusz változását; visszatéréskor a `connected = true` visszaáll.
- **AC15.3** A frissítés/reconnect nem hoz létre duplikált játékost és nem veszít idővonal-kártyát.

### S16 — Kifogyó pakli
- **AC16.1** Ha a pakli kifogy, mielőtt bárki elérné a győzelmi limitet, a játék véget ér, és az nyer, akinek **hosszabb az idővonala**.
- **AC16.2** Idővonal-hosszban döntetlen esetén F1-ben (token nélkül) determinisztikus tie-break szabály dönt. *(A konkrét szabály megerősítendő — lásd Q3.)*
- **AC16.3** A minimum paklimérettel (AC2.3) a pakli-kifogyás normál partihossznál ne forduljon elő idő előtt.

### Zene-pipeline / F0 mérhető előfeltételek (S1–S2 mögött)
- **AC-F0.1** A 3 teszt-playlisten (PLAN.md 8. szakasz) mért **lefedettségi %** dokumentálva van, külön kiemelve a magyar zenéket tartalmazó playlistet.
- **AC-F0.2** Szúrópróbás évszám-pontosság ellenőrzés készül (min. N szám kézi validálása); ha a magyar lefedettség egy elfogadhatósági küszöb alatt marad, fallback (Deezer preview / album-év) döntés születik. *(A küszöb és N értéke megerősítendő — lásd Q1.)*

---

## 6. Success metrics

A projekt hobbi/baráti, ezért a metrikák **kvalitatívak és megfigyelés-alapúak**, nem üzleti KPI-k. Fő mérce: *egy társaság gond nélkül végigjátszik egy jó hangulatú partit.*

| Metrika | Cél (MVP/F1) | Mérés módja |
|---------|--------------|-------------|
| **Végigjátszhatóság** | Egy 4–6 fős tesztparti 0 blokkoló hibával végigjátszik egy teljes játékot (indulástól győzelemig). | Playtest megfigyelés (a tulaj + barátok). |
| **Csatlakozási súrlódás** | Egy új vendég QR-tól a lobbyba < 30 mp alatt bekerül, segítség nélkül. | Playtest stopper. |
| **Pakli-lefedettség** | A tulaj tipikus (részben magyar) playlistjein a használható arány ≥ elfogadhatósági küszöb (Q1). | F0 riport. |
| **Reconnect megbízhatóság** | Böngésző-frissítés / rövid hálózat-kimaradás után a játékos 100%-ban visszatér ugyanabba a játékba adatvesztés nélkül (tesztelt eseteken). | Célzott teszt. |
| **Anti-leak** | A reveal előtt a soron lévő kártya kiléte **soha** nem jelenik meg a játékos-kliens hálózati forgalmában. | Hálózati forgalom-ellenőrzés (QA/Security). |
| **Élő húzás latency** | A host képernyőn az élő húzás p95 késleltetése < 500 ms. | Realtime mérés. |
| **Hangulat** | A tesztelő társaság szubjektíven „jó hangulatúnak" ítéli a partit, és akar még egy kört. | Playtest utáni visszajelzés. |

---

## 7. Nyitott kérdések (KÉRDÉS A TULAJHOZ)

Az alábbiakat a PLAN.md nem dönti el egyértelműen; nem találgatok, hanem a tulaj döntését kérem. Egyik sem blokkolja az F1 tervezés-indulást, de a jelölt AC-k véglegesítéséhez kellenek.

- **KÉRDÉS A TULAJHOZ (Q1):** Mi az F0 lefedettségi **elfogadhatósági küszöb** (pl. „≥ 80% használható a magyar playlisten"), és hány számon (N) fusson a szúrópróbás évszám-validálás? Ez határozza meg, mikor váltunk Deezer-fallbackre (AC-F0.1/2).
- **KÉRDÉS A TULAJHOZ (Q2):** Az **F0 kockázat-validálás** (playlist→pakli script + lefedettség/évszám mérés) az F1 UI-fejlesztés **előtt** külön mérföldkőként fusson-e le, vagy párhuzamosan? (A PLAN.md „ELSŐ lépésként" jelöli — megerősítés kell, hogy ez blokkoló előfeltétel-e.)
- **KÉRDÉS A TULAJHOZ (Q3):** Kifogyó paklinál idővonal-hosszban **döntetlen** esetén mi a tie-break F1-ben, ahol még nincs token? (Pl. korábban csatlakozott játékos nyer / megosztott győzelem / az kezdett előbb.)
- **KÉRDÉS A TULAJHOZ (Q4):** A minimum pakliméret **pontos formulája** és hogy játékosszám-függő legyen-e már a generáláskor (a PLAN.md „~30 + játékosszám × 15"-öt ír, de a generálás a lobby előtt történik, amikor a végső játékosszám még nem ismert). Használjunk-e fix minimumot (pl. 60) az MVP-ben?
- **KÉRDÉS A TULAJHOZ (Q5):** A Start gomb aktiválásához szükséges **min. 2 játékos**-ba a host (ha ő is játszik) beleszámít-e? És kötelező-e a hostnak játszania, vagy lehet „csak host" (dedikált képernyő)?
- **KÉRDÉS A TULAJHOZ (Q6):** Az időlimit **lejáratakor** mi a default viselkedés, ha a soron lévő játékos még nem választott rést? (Pl. automatikus „legrosszabb" pozíció / kör kihagyása / a legutóbb hover-elt rés.) Ez befolyásolja az AC9.2-t.
- **KÉRDÉS A TULAJHOZ (Q7):** Az „Anti-leak" ingyenes módban a PLAN.md szerint **opaque proxy-URL**-t igényel (Edge Function streameli a preview-t). Ez az MVP-be tartozzon-e teljes formájában, vagy F1-ben elég egy egyszerűbb megoldás (pl. a preview URL csak a host-kliensnek kerül átadásra, RLS-sel védve), és a teljes proxy F2? (Kihat az S8/AC8.3 komplexitására és a 0 Ft költség-célra, mert a proxy-forgalom sávszélt/Edge-hívást fogyaszt.)

---

*Következő lépés a csapat-munkamódszer szerint: a UX/UI Designer (`docs/DESIGN.md`) és a System Architect (`docs/ARCHITECTURE.md`) ebből a PRD-ből dolgozik tovább. A nyitott kérdésekre adott tulaj-válaszok után a jelölt AC-ket véglegesíteni kell.*
