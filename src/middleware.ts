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
  // Der api/-Endpunkt unten ist ausgenommen, weil er von aussen ohne Cookies
  // aufgerufen wird (GitHub Actions). Ohne Ausnahme
  // landet der Aufruf auf /login, bekommt HTML statt JSON und der Alarm feuert
  // nie. Jeder von ihnen schützt sich selbst über CRON_SECRET.
  //
  // REGEL: Ein neuer Endpunkt, der von aussen angestossen wird, muss HIER
  // eingetragen werden — sonst scheitert er lautlos mit einer Weiterleitung,
  // und im Workflow sieht man nur "HTTP 307". Genau das ist den drei
  // Zeit-Erinnerungen passiert, die es seit dem 09.09.2026 nicht mehr gibt.
  //
  // Muss ein einziges Zeichenketten-Literal sein - Next.js liest den Wert
  // statisch aus, zusammengesetzte Ausdrücke lassen den Build scheitern.
  matcher: ["/((?!api/gva-alarm|api/makro-sync|api/routinen-erinnerung|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
