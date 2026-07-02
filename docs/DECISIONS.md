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
