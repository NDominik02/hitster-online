# Termék-döntések naplója

A PM nyitott kérdéseire adott válaszok (koordinátor-döntés, a tulaj felülbírálhatja). Minden későbbi munka ezekre épít.

## D1 — F0 elfogadhatósági küszöb (PRD Q1)
Egy playlist **játszható**, ha a használható kártyák (év + preview megvan) aránya **≥ 80%** ÉS legalább 60 kártya marad. Ha a magyar számok preview-lefedettsége < 70% az F0 riportban, a Deezer-fallback bekerül az F1-be. Évszám-validálás: playlistenként 10 véletlen szúrópróba.

## D2 — F0 blokkoló jellege (Q2)
F0 a PRD-vel párhuzamosan fut, de **blokkolja az architektúra véglegesítését** (a preview-forrás döntés séma-szintű). Így is ütemeztük.

## D3 — Tie-break F1-ben (Q3)
Pakli kifogyásakor azonos idővonal-hossznál F1-ben **megosztott győzelem** (party-játék, nem e-sport). F2-ben a tokenek lesznek a tie-break.

## D4 — Minimum pakliméret (Q4)
**Fix 60 használható kártya** a szoba-létrehozás feltétele (a generálási riport mutatja). A 8 fős maximum mellett is elég az MVP-ben; a játékosszám-függő formula F2.

## D5 — Host szerepe (Q5)
A **host képernyő nem játékos** — külön nézet. Ha a host játszani is akar, a saját telefonjával ő is belép játékosként (ugyanúgy QR-ral). Start-feltétel: **min. 2 csatlakozott játékos** (a host eszköz nem számít bele).

## D6 — Időlimit lejárta (Q6)
Ha lejár a 90 mp és nincs véglegesített lerakás: **a kártya elveszik** (rossz tippnek számít), a kör megy tovább. Ha van épp kijelölt rés, az számít lerakásnak a lejárat pillanatában.

## D7 — Anti-leak szint F1-ben (Q7)
F1: a preview URL-t **csak a host kliens kapja meg** (Edge Function válaszban, RLS-sel védve); az iTunes preview URL önmagában nem tartalmaz cím/előadó metaadatot, így ez elegendő. A teljes opaque streaming-proxy **F2**-re csúszik (0 Ft költségcél).

## D8 — Élő tükrözés a player nézeten (DESIGN D-Q1)
F1-ben a soron lévő játékos húzása **csak a host képernyőn** tükröződik élőben, a többi player telefonon nem (kevesebb realtime-forgalom, egyszerűbb state). Gazdagabb player-oldali tükrözés F2.

## D9 — Márka-akcentszín (DESIGN D-Q2)
Marad a Designer javaslata: **lila `#7C5CFF`**.

## D10 — Gyors mód győzelmi képernyő (DESIGN D-Q3)
Ugyanaz a végigpörgetős H6, csak rövidebb idővonalon — nincs külön variáns, kevesebb karbantartandó felület.

## D11 — Tap-to-place fallback (DESIGN D-Q4)
Bekerül **F1-be** — accessibility-minimum és sok androidos böngészőben a drag&drop touch-eseményei megbízhatatlanok, ez nem halasztható F2-re.

## D12 — Elsődleges audio-forrás (F0-REPORT kérdés)
A **Spotify embed preview** (`p.scdn.co` linkek) lesz az elsődleges audioforrás az iTunes helyett — 100%-os lefedettséget adott mindkét tesztelt playlisten, nincs fuzzy-matching bizonytalanság. Az Architect tervezze be: a linkeket a pakli-generáláskor **Supabase Storage-ba töltjük** (stabilitás — nem tudni, meddig élnek az eredeti linkek — és anti-leak, mert a Storage URL-ből nem derül ki cím/előadó). Az iTunes marad **tartalék forrás**, ha egy adott számhoz nincs Spotify embed-találat. Ez módosítja a PLAN.md 4. szakaszát (zene-pipeline) — az Architect az ARCHITECTURE.md-ben rögzítse a véglegeset, a PLAN.md-t nem kell utólag átírni, a DECISIONS.md az irányadó.

## D13 — 3. playlist pótlása
A tulaj a Chrome extension csatlakoztatását választotta a 3. (privát) playlisthez; a kapcsolat létrejött, a koordinátor DOM-scrape-pel kinyerte mind a 117 tracket, a pipeline lefutott rá. Eredmény: 76,9% használható (a D1 küszöb alatt, szorosan) — az iTunes-év fallback hiánya miatt; F1-ben ezt be kell kötni minden playlistre, nem csak Spotify-forrás hiányában. Lásd F0-REPORT.md 2. és 6. szakasz. Lezárva, nem blokkol.

## A1 — 100-track embed-limit (Architect)
F1-ben elfogadjuk a Spotify embed ~100 tracks/playlist limitjét (ha van); lapozásos megoldás F2. A pakli-generálási riportban (H2) jelezni kell, ha egy playlist gyanúsan pontosan 100 track hosszú (a valós lista hosszabb lehet).

## A2 — Kör-timer megvalósítása (Architect)
F1: host-kliens vezérelt, de szerver-ellenőrzött timer (`placing_deadline` mezőn a szerver validál, nem bízik a kliens jelzésében). pg_cron-alapú szerver-oldali timer F2, ha a host-vezérelt megoldás megbízhatatlannak bizonyul.

## A3 — Host-reconnect eszközváltás (Architect)
F1: a host csak ugyanarról az eszközről csatlakozhat vissza (localStorage-alapú azonosítás). Más eszközről történő host-átvétel (pl. lemerült telefon helyett laptop) F2.

## A4 — Nézet vs. RPC a timeline_public-hoz (Architect)
A Backend F1 implementáció közben döntheti el (definer-nézet vagy definer-RPC), a koordinátor nem köti meg előre — ez implementációs részlet, nem termékdöntés.

---

# F2 döntések (PRD 5b szakasz nyitott kérdései, PM felvetette)

## F2-D1 — Részleges bemondás-jutalom (F2-Q1)
Marad a **"mindkettő kell"** szabály — ha csak a cím VAGY csak az előadó helyes, nincs token. Indok: ez volt az eredeti PLAN.md szándéka, és a részjutalom bonyolítaná a UI-t (két külön visszajelzés) kevés játékértékért cserébe.

## F2-D2 — Fuzzy küszöb + több-előadós szám (F2-Q2)
A 0,85-ös normalizált Levenshtein-hasonlósági küszöb marad. Több-előadős számnál a **fő előadó** az első listázott (`primaryArtist()` — ugyanaz a segédfüggvény, amit a deck-pipeline már használ MusicBrainz/iTunes egyeztetéshez, konzisztencia miatt).

## F2-D3 — Szám-átugrás utáni steal + korlát (F2-Q3)
A tokennel átugrott kártya utáni új húzás **ugyanúgy viselkedik**, mint bármely más kör (a steal-ablak is érvényes rá) — nincs speciális eset. Nincs külön limit az átugrások számára körönként; a 2 induló token természetes szűkösséget ad, extra korlát felesleges bonyolítás lenne.

## F2-D4 — Azonnali +1 kártya (3 token) időzítése (F2-Q4)
Csak a soron lévő játékos saját körének ELEJÉN hívható, a rejtélyes kártya-húzás HELYETT (nem mellette) — a felfedett kártyát azonnal be kell illesztenie zene/időlimit nélkül. Ez a saját körét helyettesíti (nem külön, extra kör), így a körszámlálás egyszerű marad.

## F2-D5 — Steal-verseny és token-visszatérítés (F2-Q5)
(a) Több játékos is megpróbálhat egyszerre lopni ugyanabban az ablakban. (b) **Nincs token-visszatérítés** a helyesen jelölő, de nem nyertes stealereknek — a token egy tét, nem biztosítás. Csak az elsőként helyesnek bizonyuló (körsorrend szerinti) stealer kapja meg a kártyát; minden más steal-kísérlet (helyes vagy helytelen) elveszíti a tokent. Egyszerű, egyértelmű szabály.

## F2-D6 — Token-alapú tie-break megerősítve (F2-Q6)
Igen — F2-től a győzelmi döntetlent (azonos leghosszabb idővonal) a **több token** dönti el; ha a tokenek is egyenlők, marad a D3 szerinti megosztott győzelem.

## F2-D7 — Hangeffekt reduced-motion mellett (F2-Q7)
A `prefers-reduced-motion` **csak a mozgást/animációt** tiltja le, a hangeffektet NEM — ez külön accessibility-szempont (mozgásérzékenység ≠ hangpreferencia), a WCAG megfogalmazás is erre vonatkozik szűken.

## F2-D8 — Vitagomb viselkedése (F2-Q8)
(a) A vitagomb megnyomása **azonnal megállítja** az 5 mp-es auto-tovább visszaszámlálót. (b) Érvénytelenítés után **nem ismétel** ugyanaz a játékos — a kör egyszerűen érvénytelenné válik (mintha meg sem történt volna, senki nem veszít semmit), és a menet a KÖVETKEZŐ játékoshoz lép tovább, ahogy egy normál kör után történne.

## F2-D9 — Presence timeout (F2-Q9)
15 másodperc — elfogadva a PM javaslata.

## F2-D10 — "Max 1× kihagyható" pontos szemantikája (F2-Q10)
Újraértelmezve, egyértelműbben: a presence-alapú gyorsított kihagyás **egymást követő, jelenleg lecsatlakozott játékosokra korlátlanul** alkalmazható — a rendszer sorban továbblép, amíg egy online játékost nem talál (nem áll meg mesterségesen az első lecsatlakozottnál). Ha mindenki lecsatlakozott, a parti szünetel. Ez robusztusabb, mint egy kemény "csak 1" korlát, ami feleslegesen végigváratná a partit egy második, egymást követő offline játékoson.

## F2-D11 — Steal-mechanika újratervezése: a SORON LÉVŐ idővonalán, élőben látható jelöléssel (2026-07-03, tulaj kérésére)
A tulaj jelezte, hogy az eredeti F2 steal-implementáció eltért a fizikai Hitster szabályaitól: minden stealer a **saját** idővonalán jelölt egy pozíciót, vakon, anélkül hogy látta volna, hova tette a soron lévő játékos a kártyát. Ez azt eredményezte, hogy egy stealer elméletileg ugyanoda "tippelhetett", ahova a soron lévő már helyesen letette, és emiatt feleslegesen bukott token.

Új szabály: `round.placement` (a soron lévő játékos választott rése) **élőben látszik** minden kliensen (a `round_public` view már eleve feltétel nélkül exponálta ezt a mezőt, migráció nem kellett hozzá). Minden stealer a **SORON LÉVŐ idővonalán** jelöl egy MÁSIK rést, mint amit ő már választott — a `register_steal` explicit elutasítja (`same_position` hiba), ha valaki ugyanoda próbál lopni. Ha egy stealer nyer, a kártya a SAJÁT idővonalára kerül, a helyes pozícióba beszámolva (nem a megjelölt index kerül át, azt újraszámoljuk a stealer saját idővonalán — lásd `findInsertionIndex` a `_shared/round.ts`-ben).

Indok: ez pontosan a fizikai játék "kihívás" mechanikáját tükrözi — a stealerek a soron lévő KONKRÉT állítását vitatják, nem egy saját, független elméletet építenek. Élőben látni a jelölt rést izgalmasabb és értelmesebb döntéseket tesz lehetővé (látod, hol "hibázott" állítólag a soron lévő, és eldöntheted, hiszel-e neki).

Érintett fájlok: `_shared/steal.ts` (`StealEntry.position` szemantikaváltás + `evaluateSteals` egyszerűsítés egy közös idővonal-tömbre), `_shared/round.ts` (`findInsertionIndex` új helper a nyertes saját idővonalára való beillesztéshez), `register_steal/index.ts` (`same_position` guard), valamint a frontend `TimelineSlot`/`Timeline`/`StealButton` komponensek és a `play/[roomCode]` oldal (a soron lévő idővonalát mutatják lopáskor, a választott rés élő jelölésével).

Élesben tesztelve curl-lel: (1) lopás ugyanoda mint a soron lévő choice → `same_position` 400; (2) lopás más, helyes résre, amikor a soron lévő is helyesen tett → a lopás automatikusan veszít (nincs "dupla nyertes"); (3) lopás más, helyes résre, amikor a soron lévő HIBÁSAN tett → a stealer nyer, és a kártya a SAJÁT idővonalán, a helyes évszám szerinti pozícióba kerül (nem a megjelölt index szerint).

## Bugfix (2026-07-04) — Presence-tracking sosem indult el a player oldalon
Élesben a tulaj mindkét eszközön (telón és gépen) nyitva tartotta a játékot, a host mégis MINDIG "offline"-nak jelezte a neveket — a játékmenetet ez (a jelenlegi kód szerint) nem akasztotta meg, de a jelzés folyamatosan hamis volt.

Gyökérok: `useRoomChannel.ts` a `presenceKey`-t (a player oldalon `me?.id`) csak a csatorna-feliratkozó effektus (`[roomId]`-only) belsejében, a `subscribe()` callback-ben olvasta ki egyszer, closure-ként. A player (és host) oldalon a join/reconnect flow-ban a `setRoomId(...)` és a `setMe(...)`/`me` beállítás közé egy `await` (pl. `refreshPlayers`) ékelődik — ez azt jelenti, hogy a két state-frissítés NEM egy React-batchben történik: `roomId` előbb frissül (a `[roomId]`-only effekt lefut, feliratkozik, `subscribe()` a MÉG undefined `presenceKey`-t látja), és csak EGY KÉSŐBBI render-ciklusban áll be `me` — mire ez megtörténik, az effekt már nem fut újra (nem függ `presenceKey`-től), tehát a Realtime Presence `track()` hívás SOHA nem történt meg a valódi player-azonosítóval. A host emiatt sosem látta a játékost jelenlévőnek, és a 15 mp-es küszöb (F2-D9) után mindig lecsatlakozottnak jelentette — függetlenül attól, hogy ténylegesen nyitva volt-e az eszköz.

Javítás: `presenceKeyRef`/`presenceMetaRef` hozzáadva (a meglévő `onEvent`/`onPresenceChange`-stílusú ref-mintát követve), a `subscribe()` callback ezekből olvas (nem a closure-ből), ÉS egy külön effektus figyeli a `presenceKey` VÁLTOZÁSÁT — ha a csatorna eközben már SUBSCRIBED, azonnal `track()`-el a friss kulccsal. A két mechanizmus együtt lefedi mindkét lehetséges sorrendet (presenceKey a SUBSCRIBED előtt vagy után érkezik).

Élesben tesztelve: típusellenőrzés + lint tiszta; a valódi join-flow (async gap-es útvonal) böngészőben hibamentesen lefut. A teljes két-eszközös élő propagáció (host lát-e online-t) böngészőben egy tabbal nem reprodukálható közvetlenül — ezt érdemes a következő élő parti alatt megerősíteni.

## F2-D12 — Vitatás (dispute) újratervezése: évszám-korrekció, NEM teljes érvénytelenítés (2026-07-04, tulaj visszajelzése alapján)
A tulaj jelezte, hogy a vitagomb (F2-D8) rosszul volt kitalálva a gyakorlatban: egy konkrét esetben a lerakás VALÓJÁBAN helyes volt (2024 elé tette, és a szám tényleg 1967-es), de a Spotify-adatban 1992 szerepelt évként — a régi "teljes érvénytelenítés" mechanika ilyenkor eldobta a kártyát és senkinek nem adta oda, holott a HELYES döntés meg lett hozva, csak a rendszer rossz évvel értékelt. Emellett a régi mechanika egy súlyos, észrevétlen hibát is okozott: a backend a vita után CSENDBEN, saját belső `drawCard()`-hívással azonnal a következő játékosra lépett, de ezt SOHA nem juttatta vissza a host kliens állapotába (nincs `turn_advanced`/`round_started` broadcast, nincs `beginRound()`/`audioUrl` hívás), és a player kliensek `onEvent`-je meg sem ismerte a `round_disputed` eseményt — élesben ez okozta, hogy "a host tovább ugrott a kövi körre, de a 2 játékos ott maradt" ÉS hogy a rákövetkező kör zenéje sosem szólalt meg.

Új mechanika: a host a vitagomb megnyomásakor beírja a szám TÉNYLEGES évét (`dispute_round({roundId, correctedYear})`). A szerver ez ellen az év ellen ÚJRAÉRTÉKELI a kört — ugyanazzal a logikával, mint a normál `resolveRound` (a soron lévő lerakása / a lopás-győztes a SORON LÉVŐ idővonalán, F2-D11 szerint) —, a kártya a ténylegesen helyesen döntő félhez kerül (vagy senkihez, ha a korrigált év szerint sem a lerakás, sem egyik lopás nem talált), a `revealed_card.year` frissül, de a kör MARAD `reveal` fázisban — nincs automatikus tovább lépés. A host ezután a MEGSZOKOTT "Következő kör" gombbal halad tovább, ami a már jól működő broadcast/audio útvonalat használja. A bemondás (name-guess) helyessége érintetlen marad (cím/előadó-egyezés, évtől független). Ismételten hívható ugyanarra a körre (elgépelés javítása) — mindig visszabontja a jelenlegi elhelyezést `card_id` alapján, mielőtt újraalkalmazná, így idempotens a hívások sorrendjétől függetlenül.

Élesben tesztelve curl-lel: (1) rossz lerakás + korrekció, ami a lerakást helyessé teszi → kártya bekerül a soron lévő idővonalára a helyes pozícióba, kör marad reveal, `outcome: correct`; (2) ugyanazon kör ÚJRA-vitatása egy másik évvel, ami megint helytelenné teszi → az előző beszúrás helyesen visszavonva, `outcome: wrong`; (3) nem-host hívás → 403; (4) `next_turn` a vita után zökkenőmentesen folytatódik, ugyanúgy, mint egy normál reveal után.
