import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // manifest.webmanifest bleibt bewusst frei: Browser holen es teils ohne
  // Cookies, die Anmelde-Weiterleitung würde die PWA-Installation stören.
  //
  // sw.js muss aus demselben Grund frei bleiben, nur strenger: der Browser
  // lädt den Service Worker ohne Session-Cookie. Landet er auf /login,
  // bekommt er HTML statt JavaScript, die Registrierung scheitert - und
  // ohne Service Worker gibt es überhaupt keine Push-Benachrichtigungen.
  //
  // api/garmin-sync und api/gva-alarm sind ausgenommen, weil beide von
  // Vercel-Cron ohne Cookies aufgerufen werden. Ohne Ausnahme landet der
  // Aufruf auf /login, bekommt HTML statt JSON und der Alarm feuert nie.
  // Beide schützen sich selbst über CRON_SECRET.
  //
  // Muss ein einziges Zeichenketten-Literal sein - Next.js liest den Wert
  // statisch aus, zusammengesetzte Ausdrücke lassen den Build scheitern.
  matcher: ["/((?!api/garmin-sync|api/gva-alarm|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
