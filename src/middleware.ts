import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // manifest.webmanifest bleibt bewusst frei: Browser holen es teils ohne
  // Cookies, die Anmelde-Weiterleitung würde die PWA-Installation stören.
  // Muss ein einziges Zeichenketten-Literal sein - Next.js liest den Wert
  // statisch aus, zusammengesetzte Ausdrücke lassen den Build scheitern.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
