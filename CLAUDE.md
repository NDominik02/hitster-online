# Hitster Online

Böngészős, telepítés nélküli online Hitster-klón: közös host képernyő adja a zenét, a játékosok a saját telefonjukon raknak zeneszám-kártyákat időrendi sorrendbe a saját idővonalukon. Paklik Spotify playlistekből generálódnak.

**A teljes terv: [docs/PLAN.md](docs/PLAN.md) — minden munka ebből indul ki.**

## Stack

- Frontend: Next.js (App Router) + TailwindCSS + dnd-kit + Framer Motion, mobil-first
- Backend: Supabase (Postgres + Realtime + Edge Functions + Anonymous Auth)
- Hosting: Vercel + Supabase free tier
- Nyelv: az UI magyar, a kód/kommentek/commit-üzenetek angolul

## Csapat-munkamódszer (agent team)

A `.claude/agents/` alatt 8 szerep él. Sorrend: PM → UX/UI + Architect → Frontend + Backend → QA → DevOps → Security.

- A PM a `docs/PRD.md`-t, a designer a `docs/DESIGN.md`-t, az architect a `docs/ARCHITECTURE.md`-t gondozza — implementáció ezekből dolgozik, eltérésnél a doksit is frissíteni kell.
- Minden agent: ha elakadsz vagy döntési pont van, amit nem tudsz magad eldönteni, NE találgass — írd bele a zárójelentésedbe "KÉRDÉS A TULAJHOZ:" prefixszel, és a koordinátor továbbítja.
- A szerver az igazság forrása: játéklogika-mutáció csak Edge Function-ben, kliens sosem írja közvetlenül a játéktáblákat. A még fel nem fedett kártya adata nem kerülhet a kliens felé menő forgalomba.

## Git workflow

- Mindig feature branch (`feature/...`, `fix/...`), sosem közvetlenül a main-re.
- Main-be merge csak a tulaj explicit jóváhagyásával.

## Környezet

- A tulajnak van Spotify Premium fiókja; Chrome MCP-n keresztül be van jelentkezve a Spotify webre.
- Supabase MCP elérhető (projekt-létrehozáshoz a costot a tulajjal kell megerősíttetni — free tier).
- Teszt-playlistek a PLAN.md 8. szakaszában.
