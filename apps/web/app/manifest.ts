import type { MetadataRoute } from "next";

/**
 * S43 (PWA telepíthetőség, F4) — Next.js App Router natívan kiszolgálja ezt
 * a /manifest.webmanifest útvonalon, és automatikusan beilleszti a
 * <link rel="manifest"> taget minden oldalra (nincs szükség kézi <head>
 * módosításra). AC43.1: name/short_name/ikonok/start_url/display/theme_color.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hitster Online",
    short_name: "Hitster",
    description: "Böngészős party-játék baráti társaságoknak — zenei idővonal-építő.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0B14",
    theme_color: "#7C5CFF",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
