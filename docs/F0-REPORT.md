# F0 — Kockázat-validálási riport (pakli-pipeline prototípus)

*Készült: 2026-07-02 · Backend Engineer · Prototípus: `tools/deck-pipeline/`*

## 1. Mit építettünk

Lokális Node.js pipeline (csak beépített modulok, Node v23.2.0, semmi Supabase):

```
node tools/deck-pipeline/run-pipeline.js <playlistUrl> [...]
```

| Lépés | Script | Forrás | Throttle |
|---|---|---|---|
| 1. Playlist → track lista | `01-fetch-playlist.js` | Spotify **embed** oldal (`open.spotify.com/embed/playlist/{id}`), anonim fetch, `__NEXT_DATA__` JSON | — |
| 2. Eredeti megjelenési év | `02-resolve-years.js` | MusicBrainz `/ws/2/recording` keresés | 1 kérés/1,1 mp + UA: `HitsterOnline/0.1 (nemethdominik02@gmail.com)` |
| 3. Preview párosítás | `03-match-previews.js` | iTunes Search API, fuzzy match (normalizált cím+előadó, Levenshtein) | 1 kérés/3 mp |

Minden köztes eredmény cache-elt (`cache/*.json`), a futás bármikor megszakítható és folytatható. Kész paklik: `output/{playlistId}.json`.

**Fontos technikai megállapítások az 1. lépésről:**
- Az embed endpoint **nem ad album nevet/évet** track-szinten → a tervben szereplő "Spotify album-év fallback" ebből a forrásból **nem elérhető** (Spotify API kulccsal lenne csak).
- Cserébe **minden trackhez ad saját 30 mp-es Spotify preview URL-t** (`p.scdn.co/mp3-preview/...`) — lásd 5. szakasz, ez a riport legfontosabb felfedezése.
- Az embed trackList feltehetően **100 tracknél csonkol** (a 2. teszt-playlist pontosan 100-at adott vissza — gyanús).

## 2. Eredmények playlistenként

### Playlist 1 — `63bLUR4eamvtD9ArI4LFy9` ("🎤", 24 track, 100% magyar rap/pop)

| Metrika | Érték |
|---|---|
| Track-szám | 24 |
| MusicBrainz évszám-találat | **9/24 (37,5%)** |
| Évszám iTunes releaseDate-tel kiegészítve | 21/24 (87,5%) |
| iTunes preview | **17/24 (70,8%)** |
| Spotify embed preview | **24/24 (100%)** |
| Játszható — szigorú (MB-év + iTunes-preview) | 5/24 (20,8%) |
| Játszható — iTunes-év fallbackkel | 17/24 (70,8%) |
| Játszható — Spotify-preview forrással | **21/24 (87,5%)** |

A MusicBrainz a friss magyar rap/pop szcénát (Horváth Tamás, Misshmusic, Abrahaam, Children Of Distance…) gyakorlatilag nem ismeri — 15 trackre nulla találat. Az iTunes ugyanezekre previewt IS, évszámot IS többnyire tud.

### Playlist 2 — `3cmVUEjMK7RkTe6ONRTQeJ` ("🚗🎤", 100 track, vegyes: 65 magyar + 35 nemzetközi)

| Metrika | Összes (100) | Magyar (65) | Nemzetközi (35) |
|---|---|---|---|
| MusicBrainz évszám | 69 (69%) | 42 (64,6%) | 27 (77,1%) |
| iTunes preview | 95 (95%) | **61 (93,8%)** | 34 (97,1%) |
| Spotify embed preview | 100 (100%) | 65 (100%) | 35 (100%) |
| Játszható — szigorú | 64 (64%) | 38 (58,5%) | 26 (74,3%) |
| Játszható — iTunes-év fallbackkel | 95 (95%) | — | — |
| Játszható — Spotify-preview forrással | **100 (100%)** | — | — |

⚠️ Pontosan 100 track jött vissza — ha a valós playlist hosszabb, az embed levágta.

### Playlist 3 — `5ID9QTUkVIztPYqRuoP7Vw` ("hallgatniarany", 117 track, ~100% nemzetközi angol nyelvű pop)

Ez a playlist **privát** (tulajdonos: kokuszgolyo + 2 további, közös/collaborative lista) — az anonim embed-fetch 404-et adott, a pipeline 1. lépése nem érte el. A koordinátor a Claude-in-Chrome extensionön keresztül (a tulaj bejelentkezett Spotify-munkamenetéből) DOM-scrape-pel kinyerte a teljes track-listát (cím+előadó+album, Spotify track URI és Spotify preview URL **nélkül** — ez utóbbi csak az embed API-ból jönne, ami privát playlistekre nem elérhető), majd a pipeline 2–3. lépését lefuttattuk erre a listára.

Zenei profilja élesen eltér az első két playlisttől: **döntően friss angol nyelvű mainstream pop** (Sabrina Carpenter 15 dallal, Taylor Swift, Billie Eilish, Queen, The Beatles, klasszikus standardek), gyakorlatilag nincs magyar szám benne.

| Metrika | Érték |
|---|---|
| Track-szám | 117 |
| MusicBrainz évszám-találat | **92/117 (78,6%)** — a legjobb arány mindhárom playlist közül |
| Év forrás nélkül (MB nem talált, iTunes-fallback ebben a futásban nem volt bekötve) | 25/117 (21,4%) |
| iTunes preview-találat | **115/117 (98,3%)** |
| Spotify embed preview | **nem elérhető** (privát playlist — az embed API csak nyilvános playlistekre ad preview-t, a D12 elsődleges audio-út erre a playlistre technikailag nem alkalmazható) |
| Játszható (év ÉS preview együtt) | **90/117 (76,9%)** |
| Alacsony konfidenciájú preview-match (score < 0,8, kézi review ajánlott) | 7 db (pl. "Busy Woman" → Vitamin String Quartet-verzióval párosult) |

**Következtetés:** ez a playlist a D1 küszöb szerint (≥80% használható) **szorosan a határ alatt** marad (76,9% < 80%), kizárólag azért, mert nincs Spotify-embed-forrása (privát) és a jelenlegi pipeline-futásban nem volt bekötve az iTunes-év fallback a 25 MB-nélküli trackre. Ha az iTunes-év fallbacket is bekötjük (ahogy az 1–2. playlistnél), a lefedettség várhatóan 95%+ fölé kerül — ezt a Backend F1-ben, az Edge Function-ös pipeline-nál validálni kell.

**Termék-következmény (H1 képernyőre):** privát playlist esetén a Spotify-embed audio-forrás nem érhető el, ezért ilyenkor a rendszernek automatikusan iTunes-only útra kell váltania, és ezt a host felé jeleznie kell ("ez a playlist privát, a zenefelismerés kicsit gyengébb lehet").

## 3. Magyar számok preview-lefedettsége (KIEMELT)

| Forrás | Magyar trackek (2 playlist együtt, n=90*) |
|---|---|
| iTunes preview | **78/90 (86,7%)** |
| Spotify embed preview | **90/90 (100%)** |

*A playlist 1 mind a 24 trackje + a playlist 2 magyarként azonosított 65+1 trackje (ékezet-heurisztika + ismert előadó-lista).*

- Az iTunes a **mainstream/rádiós magyar zenét jól fedi** (Wellhello, Tankcsapda, ABBA-korszak magyar slágerei, Cserháti Zsuzsa, mind megvan), a **friss underground rap** a gyenge pont (Krúbi, KKevin egyes számai, Misshmusic, Beerseewalk).
- A 70%-os Deezer-küszöbhöz képest: **86,7% > 70% → a Deezer-fallback iTunes mellé NEM kötelező** a D1 kritérium szerint.
- A Spotify embed preview-val a kérdés okafogyottá válik: **100%-os magyar lefedettség** (értelemszerűen — maga a Spotify szolgáltatja a playlist saját trackjeihez).

## 4. Évszám-pontosság — szúrópróbák és a VALÓDI kockázat

A MusicBrainz-találat önmagában nem garancia a jó évre. 10 gyanús eltérés (MB-év vs iTunes release-év):

| Track | MB-év | iTunes-év | Valóság (kézi ellenőrzés) | Ki téved? |
|---|---|---|---|---|
| ABBA – Dancing Queen | 1998 | 1976 | **1976** | MB (compilation/újrakiadás recordingot talált) |
| ABBA – Mamma Mia | 2018 | 1975 | **1975** | MB (rossz recording-entitás) |
| Carly Rae Jepsen – Call Me Maybe | 2022 | 2011 | **2011** | MB |
| Katy Perry – Firework | 2019 | 2010 | **2010** | MB |
| Katy Perry, Snoop Dogg – California Gurls | 2025 | 2010 | **2010** | MB (0,79-es match-score, gyanús eleve) |
| The Proclaimers – I'm Gonna Be (500 Miles) | 2013 | 1988 | **1988** | MB |
| Zsuzsa Cserháti – Boldogság gyere haza | 2024 | 1997 | **~1977** (eredeti) | MINDKETTŐ (iTunes az 1997-es válogatást látja) |
| UFO – Szerelemdoktor | 2014 | 1996 | **1996 körül** | MB |
| Tankcsapda – Mennyország Tourist | 2004 | 2007 | **2004** | iTunes (2007-es kiadványt látja) — itt az MB a jó |
| Szécsi Pál – Szereted-e még? | 2004 | (1969) | **1969** | MB (2004-es válogatásalbum-év) |

**Tanulság — ez az F0 legfontosabb kockázati megállapítása:**
1. A preview-lefedettség NEM a fő kockázat (a tervben 🔴-ként jelölt magyar-preview kockázat a mérés szerint enyhe). **A fő kockázat az évszám-minőség.**
2. A recording-alapú MB keresés gyakran remaster/válogatás/újrakiadás recordingot talál score=1-gyel is → a "legkorábbi release" is késői. Régi slágereknél tipikusan **évtizedeket téved fölfelé**.
3. Az iTunes releaseDate régi nemzetközi slágereknél meglepően jó (eredeti albumot találja), de magyar retró számoknál az is válogatás-évet ad (Cserháti: 1997 az 1977 helyett).
4. **Javasolt megoldás F1-re** (a pipeline Edge Function-ná alakításakor):
   - MB lekérdezésnél a **release-group first-release-date**-re szűrni, "Official + Album/Single" release-groupokat preferálni;
   - **kettős forrás-keresztellenőrzés**: ha |MB-év − iTunes-év| ≥ 3, a kártya "bizonytalan év" flaget kap, a kettő közül a **korábbit** vesszük alapnak;
   - a bizonytalan kártyák a H2 lefedettségi riportban listázva, host kézzel javíthat/kidobhat;
   - játék közben úgyis ott a Vitagomb (PLAN 2. szakasz) mint utolsó védőháló.

## 5. Spotify embed preview mint ELSŐDLEGES preview-forrás (felfedezés)

Az embed `__NEXT_DATA__` minden trackhez ad `audioPreview.url`-t: `https://p.scdn.co/mp3-preview/{40-hex-hash}` formában. Megvizsgáltam a viselkedését:

| Tulajdonság | Mérés |
|---|---|
| Auth igény | **Nincs** — anonim curl HTTP 200, se cookie, se token, se referer |
| URL-aláírás / lejárat | **Nincs a URL-ben** — tiszta tartalom-hash útvonal, query string nélkül |
| Stabilitás | A tesztelt fájl `Last-Modified: 2023-03-03` — a hash-URL évek óta változatlan |
| CORS | `Access-Control-Allow-Origin: *` → **böngésző `<audio>` elemből közvetlenül lejátszható** |
| Range support | `Accept-Ranges: bytes` (206 partial működik) → seek/progress OK |
| Infra | Google Cloud Storage + Fastly CDN, `Cache-Control: max-age=604800` |
| Formátum | `audio/mpeg` (MP3 96kbps), ~360 KB / 30 mp |
| Anti-leak bónusz | Az URL opak hash, **semmilyen metaadatot nem hordoz** — a PLAN anti-leak követelményének kapóra jön |

**Értékelés:** technikailag minden szempontból alkalmas elsődleges forrásnak, és a lefedettsége definíció szerint ~100% (maga a Spotify adja a playlist trackjeihez; csak a nem-playable trackeknél hiányozhat). **Kockázatok:** (a) nem hivatalos, dokumentálatlan út — a Spotify bármikor bevezethet aláírt/lejáró URL-eket (a hivatalos Web API-ból a preview_url-t 2024 novemberében már kivezették új appoknál, az embed viszont máig adja); (b) a hash változhat újra-enkódoláskor. **Mitigáció:** pakli-generáláskor az Edge Function **áttölti a preview MP3-akat Supabase Storage-ba** (24 track ≈ 8,6 MB, 100 track ≈ 36 MB — free tier 1 GB-jába sok pakli belefér) → a játék már a saját, stabil, opaque URL-jeinkről megy, a Spotify-út törékenysége csak generáláskori függés marad, és az anti-leak proxy-követelmény is ezzel teljesül. Az iTunes marad fallback preview-forrásnak és évszám-keresztellenőrzésnek.

## 6. Verdikt a D1 küszöbök szerint

*Küszöbök: játszható = ≥80% használható kártya ÉS ≥60 kártya; Deezer-fallback kell, ha magyar preview < 70%.*

| Playlist | Használható kártya (ajánlott pipeline-nal*) | ≥80%? | ≥60 kártya? | Játszható? |
|---|---|---|---|---|
| 1 — "🎤" (24 magyar) | 21/24 = 87,5% | ✅ | ❌ (21) | **Önmagában NEM** — de csak a mérete miatt; más paklival kombinálva vagy bővítve OK |
| 2 — "🚗🎤" (100 vegyes) | 100/100 = 100% (évszám-flag: ~21 kártya bizonytalan) | ✅ | ✅ (100) | **IGEN** |
| 3 — "hallgatniarany" (117, privát, nemzetközi) | 90/117 = 76,9%** | ❌ (szorosan) | ✅ (90 vagy 117) | **Jelenlegi pipeline-nal NEM**, iTunes-év fallbackkel várhatóan igen — F1-ben validálandó |

*\*Ajánlott pipeline = Spotify embed preview (Storage-ba mentve, ahol elérhető) + MB-év iTunes-keresztellenőrzéssel, bizonytalan-év flaggel.*
*\*\*A 3. playlistnél az iTunes-év fallback ebben a futásban nem volt bekötve (csak MB-év); ezzel együtt valószínűleg 95%+ lenne — lásd 2. szakasz.*

- **Deezer-fallback: NEM szükséges.** Magyar iTunes preview 86,7% (>70%), Spotify embed previewval 100%. Deezer maradhat backlog-tétel arra az esetre, ha a Spotify lezárja az embed preview-t ÉS az iTunes-lefedettség kevésnek bizonyul.
- A szigorú, terv szerinti lánc (MB-év + iTunes-preview) önmagában **megbukna** (20,8% / 64%) — a fallback-lánc (iTunes-év + Spotify-preview) emeli játszhatóra. Ez architekturális következménnyel jár: **az évszám-feloldást többforrásúra kell tervezni már F1-ben.** (Ezt az Architect az ARCHITECTURE.md-ben már beépítette: kettős forrás-keresztellenőrzés + "bizonytalan év" flag.)
- **Privát playlistek** (mint a 3.) Spotify-embed-preview nélkül maradnak — az iTunes-only út is elfogadható (98,3% preview-lefedettség itt), de az évszám-fallback bekötése nélkül a D1 küszöböt szorosan elvéti. F1 implementációs teendő: az iTunes-év fallback minden playlist-típusra menjen, ne csak akkor, ha a Spotify-forrás nem elérhető.
- **Összesített végső verdikt:** a projekt életképes, a zene-pipeline kockázata **elfogadható** — mindhárom teszt-playlist vagy önmagában, vagy a hiányzó iTunes-év-fallback bekötése után játszható méretű, jó minőségű paklit ad. A fő maradék kockázat nem a lefedettség, hanem az évszám-pontosság (4. szakasz) és a privát-playlist audio-forrás gyengébb minősége — mindkettőre van tervezett mitigáció (kereszt-ellenőrzés + Vitagomb, illetve iTunes-only jelzés a hostnak).

## 7. Nyitott kérdések a tulajhoz — LEZÁRVA

A 3 nyitott kérdésre a tulaj döntött, az architektúra ez alapján készült el (`docs/DECISIONS.md` D12–D13):

1. ~~A 3. playlist privát~~ → **megoldva**: Chrome extension csatlakoztatva, a koordinátor DOM-scrape-pel kinyerte a track-listát, a fenti eredmények ebből származnak.
2. **Még nyitott, de nem blokkoló:** a 2. playlist pontosan 100 tracket adott — ha a valós lista hosszabb, ez az embed 100-as lapozási limitjét igazolja. Az Architect ezt A1 nyitott kérdésként vette át (F1: elfogadjuk a 100-as limitet, lapozás F2-re).
3. ~~Spotify embed elsődleges audioforrás~~ → **jóváhagyva (D12)**, az ARCHITECTURE.md már erre épül (Storage-áttöltés generáláskor, iTunes fallback).
