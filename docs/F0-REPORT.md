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

### Playlist 3 — `5ID9QTUkVIztPYqRuoP7Vw` — **NEM FELDOLGOZHATÓ**

- Anonim embed fetch: 404 ("Page not found" a `__NEXT_DATA__`-ban).
- Sima `open.spotify.com/playlist/{id}` anonim: HTTP 404.
- Chrome MCP fallback: a session során végig **nem volt csatlakoztatott böngésző** (`list_connected_browsers` → üres lista, többszöri próbálkozásra is).

Következtetés: a playlist **privát/nem nyilvános**, anonim kliens nem látja.

**KÉRDÉS A TULAJHOZ:** az 5ID9QTUkVIztPYqRuoP7Vw playlist privátnak tűnik. Két opció: (a) tedd nyilvánossá a Spotify appban (Profilhoz adás nem kell, elég a "privát" kapcsoló kikapcsolása), és szólj — a pipeline cache-ből 2 percen belül lefuttatja; VAGY (b) csatlakoztasd a Claude-in-Chrome extensiont, és bejelentkezett sessionből szedjük ki. **Ez a v1 termékre is kihat:** ha a felhasználók privát playlistet akarnak használni, az anonim embed-út nekik sem fog működni — ezt a H1 képernyőn jelezni kell ("csak nyilvános playlist").

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
| 3 — privát | n/a | — | — | Nem mérhető (lásd KÉRDÉS A TULAJHOZ) |

*\*Ajánlott pipeline = Spotify embed preview (Storage-ba mentve) + MB-év iTunes-keresztellenőrzéssel, bizonytalan-év flaggel.*

- **Deezer-fallback: NEM szükséges.** Magyar iTunes preview 86,7% (>70%), Spotify embed previewval 100%. Deezer maradhat backlog-tétel arra az esetre, ha a Spotify lezárja az embed preview-t ÉS az iTunes-lefedettség kevésnek bizonyul.
- A szigorú, terv szerinti lánc (MB-év + iTunes-preview) önmagában **megbukna** (20,8% / 64%) — a fallback-lánc (iTunes-év + Spotify-preview) emeli játszhatóra. Ez architekturális következménnyel jár: **az évszám-feloldást többforrásúra kell tervezni már F1-ben.**

## 7. Nyitott kérdések a tulajhoz

1. **KÉRDÉS A TULAJHOZ:** a 3. teszt-playlist (`5ID9QTUkVIztPYqRuoP7Vw`) privát — tedd nyilvánossá és szólj, vagy csatlakoztasd a Chrome extensiont (a session alatt végig offline volt), és lefuttatom rá is a pipeline-t.
2. **KÉRDÉS A TULAJHOZ:** a 2. playlist pontosan 100 tracket adott az embed-en — ennyi a valós hossza, vagy hosszabb? Ha hosszabb, a 100-as embed-limit igazolt, és F1-ben lapozó megoldás kell (pl. bejelentkezett fetch vagy Spotify API kulcs igénylése).
3. Elfogadod-e az 5. szakasz szerinti irányt (Spotify embed preview → Supabase Storage áttöltés mint elsődleges audio-út)? Ez a PLAN 4. szakaszának módosítását jelenti (iTunes fő-forrásból fallback-forrássá fokozódik le).
