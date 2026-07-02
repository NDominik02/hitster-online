import { NextResponse } from "next/server";

/**
 * Szerveroldali "mi a valódi elérési origin" endpoint.
 *
 * Miért kell: a host oldal (app/host/[roomCode]/page.tsx) a QR-kódhoz a
 * `window.location.origin`-t használná, de ez helyi hálózaton félrevezető —
 * ha a tulaj a hostot `localhost:3000`-en nyitja meg a laptopján, a QR-kód
 * `localhost`-ot kódol, ami a SCANNELŐ telefonján a telefon saját
 * localhost-jára mutat, nem a laptopéra ("can't connect" Safarin).
 *
 * A request `Host` fejléce (amit a böngésző ténylegesen küldött, pl.
 * `192.168.0.123:3000`) mindig azt a címet adja vissza, amin a kliens a
 * szervert ÉPP eléri — ez helyi hálózaton a géptulaj tényleges LAN IP-je,
 * production mögött (Vercel/proxy) pedig a valódi domain (a proxy az
 * `x-forwarded-host`/`x-forwarded-proto`-t állítja be helyesen). Ez
 * megbízhatóbb, mint egy env-változóra (NEXT_PUBLIC_APP_ORIGIN) hagyatkozni,
 * mert nem igényel manuális beállítást a "baráti társaság egy szobában"
 * forgatókönyvben.
 */
export async function GET(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? "localhost:3000";

  const forwardedProto = request.headers.get("x-forwarded-proto");
  // Helyi hálózaton (LAN IP vagy localhost) nincs TLS, tehát http; egyébként
  // a proxy jelzi a valós sémát, ha pedig az sincs, a request URL sémájára esünk vissza.
  const proto = forwardedProto ?? new URL(request.url).protocol.replace(":", "");

  const origin = `${proto}://${host}`;

  return NextResponse.json({ origin });
}
