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

## 5b. F2 — A teljes játék (Acceptance Criteria)

> Ez a szakasz az F2 story-kat (S20–S25) bontja mérhető követelménnyé, ugyanolyan mélységben, mint az 5. szakasz az F1-et. **Az F1 tartalmat nem módosítja.** Forrás: PLAN.md 2. szakasz (végleges játékszabályok), DESIGN.md (fenntartott F2 UI-elemek), DECISIONS.md (D1–D13, A1–A4). Ahol a források nem döntenek egyértelműen, a kritériumban *jelölve* van, és a 7. szakasz Nyitott kérdései közt (F2-Q…) szerepel — nem találgatok.
>
> **Változatlan alapelvek F2-ben is:** a szerver az igazság forrása; minden token-/steal-/guess-mutáció kizárólag Edge Function-ben történik, a kliens sosem írja közvetlenül a játéktáblákat (CLAUDE.md, PLAN.md 5. szakasz). A fel nem fedett kártya adata (cím/előadó/év/URI) a reveal pillanatáig **nem kerülhet** a kliens felé menő forgalomba (anti-leak, D7) — ez a bemondás-ellenőrzésre és a steal-kiértékelésre is vonatkozik: mindkettő szerveroldalon dől el.

### 5b.0 Fázisbontási javaslat: F2.1 + F2.2 (PM-ajánlás)

**Javaslat:** az F2-t bontsuk **két, egymás után szállítható alfázisra**, ugyanazzal a logikával, amiért az F1-et leválasztottuk az F2-ről (a kockázat és a scope kézben tartása):

| Alfázis | Tartalom | Story-k | Prio | Miért itt |
|---|---|---|---|---|
| **F2.1 — Játékmenet-kritikus** | Tokenek (gazdálkodás), bemondás (fuzzy matching), steal (15 mp-es ablak) | S20, S21, S22 | **P1** | Ez a hármas adja a „teljes Hitster" taktikai magját. Együtt működnek (a token a steal/guess valutája), külön értelmetlenek — egy koherens, szerver-nehéz csomag: token-könyvelés, steal-ablak timer, optimista zár, szerveroldali fuzzy matching. Ez az F2 **kockázatos** része, ezt kell először stabilizálni. |
| **F2.2 — Polish** | Reveal-show (animáció/hang/haptika), vitagomb (kör-érvénytelenítés), auto-skip (lecsatlakozott soron lévő) | S23, S24, S25 | **P1 (S25), P2 (S23, S24)** | Ezek **nem blokkolják** a taktikai játékmenetet: az F2.1 után a játék token/steal/bemondással teljes és játszható. A reveal-show és a vitagomb élmény-/adathiba-kezelés; az auto-skip robusztusság. Külön szállítva kevesebb a regressziós kockázat a frissen bevezetett token-logikán. |

**Indoklás (miért így):**
1. **Kockázat-izoláció.** Az F2.1 mélyen belenyúl a kör-életciklusba (új `stealing` fázis-viselkedés, token-tranzakciók, `resolve_round` átírás). Ha ezt előbb élesítjük és playtesteljük, a hibák nem keverednek a polish-változtatásokkal.
2. **Korai érték.** A tulaj + barátok az F2.1 után már a „valódi" Hitstert játsszák (bemondás +1 tokenért, lopás) — a reveal-show csillogása nélkül is. Gyors visszajelzési ciklus a legfontosabb részre.
3. **Az F1-mintát követi.** Az F1-nél is a token-mentes core loopot választottuk le, hogy előbb legyen valami játszható. Ugyanez az elv: előbb a mechanika, aztán a máz.
4. **S25 kivétel a prioritásban.** Az auto-skip (S25) bár az F2.2-ben van, **P1**, mert egy lecsatlakozott soron lévő játékos az F2 token-körben is meg tudja akasztani a partit; a többi F2.2 elem (S23, S24) P2.

> **Scope-figyelmeztetés (PM):** az F2.1 három story-ja együtt kb. akkora szerver-oldali munka, mint a teljes F1 core loop volt. Ne csússzon bele „menet közben" F3-elem (pl. Premium-mód a reveal-show-hoz, vagy pakli-könyvtár a token-statisztikákhoz). Az F2 kizárólag a PLAN.md 2. szakaszában rögzített szabályokat implementálja — új szabály nem születik.

**F2 story-k prioritása és alfázisa (összefoglaló):**

| ID | Story | Prio | Alfázis |
|----|-------|------|---------|
| S20 | Tokenek (szerzés/költés) | P1 | **F2.1** |
| S21 | Bemondás (fuzzy matching) | P1 | **F2.1** |
| S22 | Steal (15 mp-es ablak) | P1 | **F2.1** |
| S23 | Reveal-show (animáció/hang/haptika) | P2 | F2.2 |
| S24 | Vitagomb (kör-érvénytelenítés) | P2 | F2.2 |
| S25 | Auto-skip (lecsatlakozott soron lévő) | P1 | F2.2 |

---

### S20 — Tokenek (szerzés és költés) · P1 · F2.1

> Alap (PLAN.md 2. szakasz): induláskor **2 token/fő**; szerzés bemondással (+1); költés: 1 token = steal, 1 token = szám átugrása, 3 token = azonnali +1 kártya. A token a `players.tokens INT` mezőben él (PLAN.md adatmodell); minden token-mozgás Edge Function-ben, szerveroldali tranzakcióban.

- **AC20.1 (kezdő készlet)** Játékkezdéskor minden játékos egyenlege **pontosan 2 token** (`players.tokens = 2` a Start pillanatában). A host-eszköz (nem játékos, D5) nem kap tokent.
- **AC20.2 (megjelenítés)** A token-egyenleg valós időben látszik: a host H4 nézetén minden játékos sorában (`PlayerTimelineRow` fenntartott `tokens` propja, DESIGN 5.1) és a `PlayerBadge`-en; a saját telefonon a játékos a saját egyenlegét mindig látja. Változáskor **1 s-on belül** frissül minden kliensen.
- **AC20.3 (szerzés — bemondás)** Sikeres előadó+cím bemondásért (S21) a soron lévő játékos egyenlege **+1 token**. Ez az **egyetlen** token-szerzési forrás F2-ben (PLAN.md); más módon token nem keletkezik.
- **AC20.4 (költés — steal)** Egy steal-fogadás (S22) leadása **1 tokent** von le a fogadó játékostól a fogadás pillanatában. Akinek **0 tokenje** van, a steal-gombja letiltott, nem indíthat steal-t.
- **AC20.5 (költés — szám átugrása)** A soron lévő játékos a saját körében, **még a lerakás előtt**, elkölthet **1 tokent** a szám átugrására: a jelenlegi kártya kikerül (nem kerül senki idővonalára), a rendszer **új kártyát húz** a pakli tetejéről, és ugyanez a játékos folytatja vele a kört (új preview indul a hoston). Az átugrás **nem** ad és nem von tokent a +1 esetén túl (nettó −1). *(Nyitott: átugrás közben megmarad-e a steal-ablak a következő kártyára, és korlátozott-e az átugrások száma egy körön belül — lásd F2-Q3.)*
- **AC20.6 (költés — azonnali +1 kártya)** A játékos **bármely** játékfázisban, amikor ő van soron a döntéssel, elkölthet **3 tokent** egy azonnali extra kártyáért: a pakli tetejéről **felfedve** kap egy kártyát, amit be kell illesztenie az idővonalába. Ha a behelyezés **helyes**, a kártya beépül (idővonal +1); ha **helytelen**, a kártya **elveszik** és a 3 token **nem jár vissza**. *(Nyitott: pontosan mikor hívható — csak a saját kör elején, vagy más köre alatt is; és számít-e külön körnek — lásd F2-Q4.)*
- **AC20.7 (fedezet-ellenőrzés szerveroldalon)** Minden költést az Edge Function ellenőriz: ha a játékos egyenlege a művelet költsége alá esne, a művelet **elutasításra kerül** (a kliens nem tudja megkerülni). Nincs negatív egyenleg.
- **AC20.8 (atomicitás / verseny-helyzet)** Egyidejű token-műveletek (pl. két gyors steal ugyanattól a játékostól, vagy steal + azonnali-kártya) **atomikusan**, `round_id + phase` optimista zárral dőlnek el (PLAN.md 5. szakasz, A2); a token-egyenleg sosem kerül inkonzisztens állapotba (nincs dupla-levonás, nincs „elveszett" token).
- **AC20.9 (győzelem tie-break aktiválás)** F2-től a kifogyó-pakli döntetlennél (azonos idővonal-hossz) a **több token** dönt (PLAN.md 2. szakasz; ez felváltja az F1 D3 megosztott-győzelmét). Ha token-egyenleg is egyenlő, **megosztott győzelem** marad. *(Ez az F1 D3 explicit F2-felülírása — lásd F2-Q6, hogy a tulaj megerősítse a token-tie-break bevezetését.)*

### S21 — Bemondás (fuzzy matching) · P1 · F2.1

> Alap (PLAN.md 2. szakasz): a lerakás **előtt** a soron lévő játékos megjelölheti, hogy tudja az előadót ÉS a címet → begépeli; fuzzy matching, ékezet/kisbetű-toleráns; találat esetén +1 token. UI: `GuessInput` a „Bemondom!" kapcsoló alatt (DESIGN 5.4, P3 wireframe).

- **AC21.1 (mikor ajánlható fel)** A „Bemondom!" kapcsoló és a beviteli mezők **csak a soron lévő játékosnak**, **csak a saját körében**, **kizárólag a lerakás (LERAKOM) előtt** érhetők el. A LERAKOM megnyomása vagy az időlimit lejárta után bemondás nem adható le.
- **AC21.2 (opcionális, nem blokkoló)** A bemondás **opcionális**: a játékos bemondás nélkül is lerakhat. A bemondás nem hosszabbítja meg az időlimitet (a `CountdownTimer` ugyanúgy fut, D6 érvényes).
- **AC21.3 (mindkét mező kell a jutalomhoz)** A jutalomhoz **az előadó ÉS a cím is** helyes kell legyen. Ha csak az egyik helyes → **nincs token** (nincs részleges jutalom). *(A „csak az egyik helyes" eset következménye: F2-ben nincs részjutalom; ha a tulaj félsikert akar jutalmazni, az F2-Q1.)*
- **AC21.4 (fuzzy küszöb — konkrét)** Az egyezést a rendszer **normalizálás után** értékeli: kisbetűsítés, ékezet-eltávolítás (Unicode NFD + diakritika-törlés), a felesleges whitespace összevonása, és a zárójeles/„feat.” utótagok levágása (pl. „(Remastered 2011)”, „- Live”, „feat. X”). A normalizált sztringek közt **Levenshtein-alapú hasonlóság** dönt: az egyezés akkor **elfogadott**, ha a normalized-similarity `1 − levenshtein(a,b)/max(len)` **≥ 0.85** mind az előadóra, mind a címre külön. *(A 0.85-ös küszöb PM-javaslat, F0-mintán hangolandó — lásd F2-Q2.)*
- **AC21.5 (több előadó / és-jelek)** Ha az eredeti előadó több névből áll (pl. „Tom Jones & The Cardigans”), elfogadott, ha a játékos **a fő előadót** eltalálja a 0.85 küszöb felett; a rendszer a több-előadós mezőt tokenizálja és a legjobb rész-egyezést veszi. *(A „fő előadó” pontos definíciója — első listázott vs. bármelyik — F2-Q2 alá tartozik.)*
- **AC21.6 (szerveroldali kiértékelés, anti-leak)** A bemondás egyezését **kizárólag az Edge Function** dönti el; a helyes cím/előadó a reveal előtt **nem kerül ki** a kliensre (a kliens a beírt sztringet küldi, a szerver hasonlítja a rejtett kártyához). A találat/nem-találat ténye csak a reveal fázisban jelenik meg.
- **AC21.7 (token jóváírás időzítése)** Sikeres bemondás **+1 tokenje** a **reveal fázisban** íródik jóvá és jelenik meg (nem a bemondás pillanatában, mert az elárulná a helyességet a reveal előtt — anti-leak).
- **AC21.8 (visszajelzés)** A reveal képernyőn (host H5 + player P5) egyértelműen látszik, hogy volt-e sikeres bemondás és ki kapott érte tokent (ikon + szöveg, nem csak szín — DESIGN accessibility).

### S22 — Steal (15 mp-es ablak) · P1 · F2.1

> Alap (PLAN.md 2. szakasz): a lerakás után, még a reveal előtt, **bármelyik másik játékos** költhet 1 tokent, hogy fogadjon: a lerakás rossz, és megjelöli a saját idővonalán a szerinte helyes pozíciót. Rossz lerakásnál a sikeres stealer kapja a kártyát; több sikeres stealernél a **körsorrendben következő**; sikertelen steal = a token elveszett. Új fázis: `rounds.phase = stealing` (PLAN.md adatmodell). UI: `StealButton` a P4 steal-képernyőn (DESIGN 5.4).

- **AC22.1 (ablak megnyílása és hossza)** A LERAKOM (`place_card`) után a kör `phase = stealing`-re vált, és **pontosan 15 mp-es** steal-ablak indul (`CountdownTimer`, DESIGN). Az ablak lejártakor vagy amikor minden jogosult játékos döntött (leadott vagy kihagyott), a szerver `resolve_round`-ra lép — amelyik előbb.
- **AC22.2 (ki fogadhat)** Steal-t **csak a nem soron lévő** játékosok adhatnak le (a soron lévő nem lophatja meg magát). A host-eszköz (nem játékos, D5) nem fogadhat.
- **AC22.3 (token-feltétel)** Steal leadásához a fogadónak **≥ 1 token** kell; a leadás pillanatában levonódik 1 token (AC20.4). 0 tokennél a `StealButton` letiltott.
- **AC22.4 (pozíció-jelölés kötelező)** A steal-fogadás **csak akkor érvényes**, ha a fogadó a **saját idővonalán** megjelöl egy konkrét rést („szerintem ide való”). Pozíció-jelölés nélküli steal nem adható le (a gomb a jelölésig letiltott).
- **AC22.5 (egy steal / játékos / kör)** Egy játékos körönként **legfeljebb egy** steal-t adhat le (nem halmozható több tokennel egy körben). *(Megerősítendő: engedjünk-e több párhuzamos steal-t egy játékostól — a PLAN.md „1 token”-t ír fogadásonként, ezért az alap egy/kör; lásd F2-Q5.)*
- **AC22.6 (kiértékelés — a lerakás helyes volt)** Ha a soron lévő játékos lerakása **helyes** volt, **minden** steal sikertelen: a fogadók elvesztik a levont 1-1 tokenjüket (AC20.4 véglegesül), a kártya a soron lévő idővonalába épül.
- **AC22.7 (kiértékelés — a lerakás rossz volt)** Ha a lerakás **rossz** volt, a kártya **elszáll a soron lévőtől**, és a **sikeres stealer** kapja meg (a saját jelölt résébe épül, ha az helyes). Sikeres stealer az, akinek a jelölt pozíciója a kártyára nézve helyes (ugyanaz a helyesség-szabály, mint a lerakásnál, S12–S13 azonos-évszám élsimítással).
- **AC22.8 (több sikeres stealer — körsorrend)** Ha **több** stealer is helyesen jelölt, a kártyát a **körsorrendben (`players.seat_order`) a soron lévő után következő** sikeres stealer kapja (PLAN.md: „a körsorrendben következő”). A többi sikeres stealer **nem** kapja meg a kártyát, de **visszakapja** a tokenjét? → **Nem:** a token elköltése a fogadás ténye, csak a *sikertelen* (rosszul jelölt) steal veszít explicit módon; a helyesen jelölt, de kártyát nem nyerő stealerek token-sorsa a PLAN.md-ből nem egyértelmű — **lásd F2-Q5** (alapértelmezett PM-javaslat: a helyesen jelölő, de nem nyerő stealer visszakapja a tokenjét, mert „igaza volt”).
- **AC22.9 (token-visszavonás sikertelen steal esetén)** A **rosszul jelölt** (sikertelen) steal esetén a levont token **véglegesen elveszik** (PLAN.md: „sikertelen steal = a token elveszett”) — nincs visszatérítés.
- **AC22.10 (szerveroldali, atomikus, anti-leak)** A steal-kiértékelés **kizárólag** `resolve_round` Edge Function-ben, atomikusan (AC20.8 optimista zár). A steal-ablak alatt a kártya kiléte **nem** kerül ki a kliensekre (a fogadó csak pozíciót jelöl a rejtett kártyához, nem látja, mi az) — anti-leak (D7).
- **AC22.11 (megjelenítés)** A host H5 reveal panelján megjelennek a **steal-eredmények** (DESIGN H5 fenntartott „steal-eredmények ide” hely): ki stealt, sikeres volt-e, ki kapta a kártyát. Player oldalon a stealer P5-ön látja a saját eredményét.

### S23 — Reveal-show (animáció / hangeffekt / haptika) · P2 · F2.2

> Alap (PLAN.md 2. szakasz + DESIGN 6.5): F1 reveal = egyszerű flip; F2 hozza a látványos reveal-show-t. Komponens: `RevealCard variant='show'` már tervezve (DESIGN 5.1), F1-ben csak a `simple` variáns aktív.

- **AC23.1 (host — animáció + hang)** A **host képernyőn** (H5) a reveal `variant='show'`: az albumborító látványos animációval (pl. flip + skálázás/„pop”), **és hangeffekt** kíséri a helyes/hibás kimenetet (külön hang sikerre és kudarcra). A hang a host eszközön szól (a host a közös hang-forrás, DESIGN 4.4).
- **AC23.2 (player — csak haptika)** A **player telefonon** (P5) a visszajelzés **haptikus** (vibráció), a DESIGN 4.3 szerint: **siker = rövid dupla** rezgés, **kudarc = egy hosszú** rezgés. A telefon **nem** játszik le hangeffektet (a hang a hoston szól — DESIGN 4.4), és nem futtat host-szintű animációt.
- **AC23.3 (Vibration API feltételes)** A vibráció a `navigator.vibrate` API-n keresztül, **feature-detection-nel**: ahol nem támogatott (pl. iOS Safari) vagy a felhasználó letiltotta, a hiánya **nem** okoz hibát; a vizuális P5 visszajelzés (ikon + szöveg) mindig megjelenik fallbackként.
- **AC23.4 (`prefers-reduced-motion`)** Ha a felhasználó `prefers-reduced-motion`-t jelez, a host reveal-show **visszafogott**: pörgés/flip/„pop”/konfetti kikapcsol, marad egy egyszerű **cross-fade** (DESIGN 6.5). A hangeffekt megmaradhat (a reduced-motion a mozgásra vonatkozik), de a vibráció a reduced-motion beállítást is tiszteletben tartja. *(Megerősítendő: reduced-motion mellett a hang is halkuljon/maradjon-e el — lásd F2-Q7.)*
- **AC23.5 (időzítés nem lassít)** A reveal-show **nem** nyújtja meg a kör-ciklust az F1-hez képest érzékelhetően: a `next_turn` továbbra is a reveal után ~5 mp-cel indul (PLAN.md Realtime folyam); a show ezen belül fér el.
- **AC23.6 (nincs anti-leak sérülés)** A reveal-show a kártya adatait csak a reveal fázisban jeleníti meg; a hang/animáció előtöltése sem szivárogtathatja ki a kártya kilétét a reveal előtt (pl. a hangeffekt generikus, nem a számhoz kötött).

### S24 — Vitagomb (kör-érvénytelenítés) · P2 · F2.2

> Alap (PLAN.md 2. szakasz): a reveal képernyőn „Rossz az évszám!” gomb → a host érvénytelenítheti a kört; a kártya **kikerül a pakliból**, **senki nem veszít semmit**.

- **AC24.1 (ki nyomhatja)** A vitagombot **kizárólag a host** nyomhatja meg, a **host reveal képernyőjén** (H5). A player klienseken nincs vitagomb.
- **AC24.2 (időablak)** A vitagomb **csak a `reveal` fázisban** aktív, a `next_turn` **előtt** (azaz a reveal utáni ~5 mp-es auto-tovább ablakban, PLAN.md Realtime folyam). A `next_turn` megtörténte után a kör már nem érvényteleníthető. *(Megerősítendő: az érvénytelenítés meghosszabbítsa-e / megállítsa-e az 5 mp-es auto-tovább visszaszámlálót, hogy a hostnak legyen ideje dönteni — lásd F2-Q8.)*
- **AC24.3 (hatás — kártya kikerül)** Érvénytelenítéskor a kör kártyája **kikerül a pakliból** (nem húzható újra ebben a partiban), és **semmilyen állapotváltozás nem marad**: a soron lévő idővonala **nem** kap kártyát, a stealek **nem** dőlnek el, a bemondás-token **nem** kerül jóváírásra — mintha a kör meg sem történt volna.
- **AC24.4 (token-semlegesség)** Érvénytelenítéskor **minden elköltött token visszajár**: a steal-fogadásokra levont tokenek visszaíródnak, a szám-átugrásra/azonnali-kártyára költött tokenek is (ha a körben volt ilyen). Nettó token-változás a körből: **0** minden játékosnál (PLAN.md: „senki nem veszít semmit”).
- **AC24.5 (a kör után)** Érvénytelenítés után a **következő** kör indul: a rendszer **új kártyát** húz, és **ugyanaz a játékos** jön újra (mivel az ő köre érvénytelenült, nem kapott kártyát). *(Megerősítendő: ugyanaz a játékos ismételjen-e, vagy lépjünk a következőre — a „senki nem veszít semmit” a PM-értelmezés szerint az ismétlést támogatja, de tisztázandó — lásd F2-Q8.)*
- **AC24.6 (szerveroldali, atomikus)** Az érvénytelenítést Edge Function hajtja végre, atomikusan (token-visszaírás + kártya-kivétel + fázisléptetés egy tranzakcióban). A host kliens csak jelzést küld, nem ír közvetlenül.
- **AC24.7 (visszajelzés)** Érvénytelenítéskor minden kliensen egyértelmű jelzés jelenik meg (pl. „A hostt érvénytelenítette a kört — rossz évszám”), hogy a társaság értse, miért nem épült be a kártya.

### S25 — Auto-skip (lecsatlakozott soron lévő) · P1 · F2.2

> Alap (PLAN.md 5. szakasz, Hibatűrés): „Játékos lecsatlakozik: presence jelzi; köre **max 1× kihagyható**, utána auto-skip; visszatérve folytatja.” Az F1 D6 (időlimit-lejárat = kártya elveszik) ehhez kapcsolódik, de nem ugyanaz — lásd AC25.5 az F2-új-elemről.

- **AC25.1 (lecsatlakozás definíciója)** Egy játékos **„lecsatlakozott”**, ha a Supabase Realtime **presence** timeoutja lejár rá: a `players.connected = false`-ra vált, miután a presence heartbeat **N mp-ig** kimarad. *(Az N pontos értéke — pl. 10–15 mp — a Realtime presence timeout-hangolásától függ, Architect-döntés; a PM-javaslat 15 mp, hogy egy rövid alagút/képernyőzár ne triggereljen skip-et — lásd F2-Q9.)*
- **AC25.2 (a köre lejár, nem ő maga esik ki)** Ha a lecsatlakozott játékosra **rákerül a sor**, és a `placing_deadline`-ig (időlimit, alap 90 mp, D6/A2) **nem reagál** (nem rak le), a köre a D6 szerint lezárul: **a kártya elveszik** (rossz tipp), és a rendszer a **következő** játékosra lép. A lecsatlakozott játékos **bent marad** a játékban (nem törlődik), az idővonala megmarad.
- **AC25.3 („max 1× kihagyható” — pontos jelentés)** Egy lecsatlakozott játékos köre így **legfeljebb egyszer** hagyható ki a **teljes körfordulóban** *timeout-tal*: ha a **következő** ráeső körre is offline és megint nem reagál, a rendszer **rövidített auto-skippel** (nem várja ki a teljes 90 mp-et) lépteti tovább, hogy a parti ne akadjon 90 mp-ekre offline játékosnál. *(A „max 1×” pontos szemantikája — körfordulónként 1 teljes-timeout, utána rövidített skip; vagy összesen 1 kihagyás, utána a játékos „passzívvá” válik — a PLAN.md nem részletezi, ezért F2-Q10.)*
- **AC25.4 (visszatérés)** Ha a lecsatlakozott játékos **visszatér** (reconnect, S15/D-alap: localStorage identitás), a `connected = true` visszaáll, és a **következő** ráeső körben normál módon (teljes időlimittel) játszik tovább. A visszatérés a „max 1×” számlálót **nullázza**.
- **AC25.5 (mi az ÚJ F2-elem az F1-hez képest)** **F1-ben már megvan** (D6): ha a soron lévő nem rak le a deadline-ig, a kártya elveszik és a kör tovább lép — ez **időlimit-alapú**, nem presence-alapú, és nem „preventív”. **Az F2 új eleme (S25):** a rendszer **presence-alapon proaktívan** felismeri, hogy a soron lévő **offline**, és (a) a host/player UI **jelzi** („⚠ offline — várunk rá / kihagyjuk”), (b) a **második** egymást követő offline-körnél **rövidített** auto-skippel gyorsít (nem kell kivárni a teljes 90 mp-et), (c) a „max 1×” számlálót vezeti. Vagyis F1 = passzív időlimit-lejárat; **F2 = aktív, presence-vezérelt, gyorsított kihagyás offline soron lévőre.**
- **AC25.6 (host-lecsatlakozás külön eset)** Az S25 a **játékos** auto-skipjéről szól. A **host** lecsatlakozása változatlanul a PLAN.md/DESIGN 4.3 szerinti **PAUSE + 2 perc türelmi idő** (nem auto-skip) — ez nem része az S25-nek, itt csak a határ tisztázása kedvéért említve.
- **AC25.7 (szerveroldali léptetés)** Az auto-skip fázisléptetést Edge Function hajtja (a `placing_deadline` szerver-validált, A2); a kliens presence-jelzése inputot ad, de a skip-döntést a szerver hozza (nem bízik egyetlen kliens jelzésében sem).

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

### F2-specifikus nyitott kérdések (a 5b. szakasz AC-jeihez)

> Ezek az F2 tervezését finomítják; egyik sem blokkolja az F2.1 indulását, de a jelölt AC-k véglegesítéséhez kellenek. A PLAN.md 2. szakasza a szabályok alapját megadja, de az alábbi részleteket nem dönti el egyértelműen.

- **KÉRDÉS A TULAJHOZ (F2-Q1):** Bemondásnál, ha **csak az egyik** (cím VAGY előadó) helyes — legyen-e **részjutalom** (pl. +0 token, de „félsiker" jelzés, vagy akár +1 csak az egyik helyeséért), vagy marad a jelenlegi „mindkettő kell, különben 0 token" (AC21.3)? A PLAN.md a „tudja az előadót ÉS a címet" megfogalmazást használja → alapból mindkettő kell.
- **KÉRDÉS A TULAJHOZ (F2-Q2):** A fuzzy matching **0.85-ös hasonlósági küszöbe** (AC21.4) jó kiindulás-e, vagy szigorúbb/lazább legyen? És a több-előadós számoknál (AC21.5) a **„fő előadó"** az első listázott legyen, vagy bármelyik közreműködő elfogadható? (Ezt érdemes az F0-mintán / valós teszt-playlisteken hangolni.)
- **KÉRDÉS A TULAJHOZ (F2-Q3):** A **szám átugrása** (1 token, AC20.5) után a **steal-ablak** vonatkozik-e az új, húzott kártyára is, és **korlátozzuk-e**, hányszor lehet egy körön belül átugrani (pl. max 1×), hogy egy sok tokenes játékos ne „ugráljon" a jó kártyáig?
- **KÉRDÉS A TULAJHOZ (F2-Q4):** Az **azonnali +1 kártya** (3 token, AC20.6) pontosan **mikor** hívható — csak a saját kör elején, vagy más köre alatt / bármikor? És **külön körnek** számít-e (megszakítja-e a normál körsorrendet), vagy csak a saját idővonalat bővíti a soron kívül?
- **KÉRDÉS A TULAJHOZ (F2-Q5):** Steal-nél (a) engedjünk-e **több párhuzamos steal-t egy játékostól** egy körben (több token = több fogadás), vagy marad az **egy/kör** (AC22.5)? (b) Több sikeres stealernél (AC22.8) a **kártyát nem nyerő, de helyesen jelölő** stealer **visszakapja-e a tokenjét** (PM-javaslat: igen, „igaza volt"), vagy elveszik?
- **KÉRDÉS A TULAJHOZ (F2-Q6):** Megerősíted-e, hogy F2-től a kifogyó-pakli döntetlen tie-breakje **több token** legyen (AC20.9), felülírva az F1 D3 megosztott-győzelmét (token-egyenlőségnél marad a megosztott győzelem)?
- **KÉRDÉS A TULAJHOZ (F2-Q7):** A reveal-show `prefers-reduced-motion` esetén (AC23.4): a **hangeffekt** is halkuljon/maradjon el, vagy a reduced-motion csak a **mozgásra** vonatkozzon (a hang megmaradjon)?
- **KÉRDÉS A TULAJHOZ (F2-Q8):** A **vitagomb** (S24): (a) az érvénytelenítés **megállítsa/hosszabbítsa-e** az 5 mp-es auto-tovább visszaszámlálót, hogy a hostnak legyen ideje dönteni (AC24.2)? (b) Érvénytelenítés után **ugyanaz a játékos ismételjen** új kártyával, vagy lépjünk a következőre (AC24.5 — PM-javaslat: ugyanaz ismételjen, mert „senki nem veszít semmit")?
- **KÉRDÉS A TULAJHOZ (F2-Q9):** A **presence timeout** (AC25.1), ami után egy játékos „lecsatlakozottnak" számít — **hány mp** legyen? (PM-javaslat: ~15 mp, hogy egy rövid alagút/képernyőzár ne triggereljen skip-et; ez részben Architect-hangolás.)
- **KÉRDÉS A TULAJHOZ (F2-Q10):** A **„max 1× kihagyható"** (AC25.3) pontos szemantikája: **körfordulónként** 1 teljes-timeout, utána rövidített auto-skip; **vagy** összesen 1 kihagyás, utána a játékos „passzívvá" válik a visszatéréséig? A PLAN.md csak annyit ír, „max 1× kihagyható, utána auto-skip".

---

*Következő lépés a csapat-munkamódszer szerint: a UX/UI Designer (`docs/DESIGN.md`) és a System Architect (`docs/ARCHITECTURE.md`) ebből a PRD-ből dolgozik tovább. A nyitott kérdésekre adott tulaj-válaszok után a jelölt AC-ket véglegesíteni kell.*
