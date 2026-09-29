import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// /api/garmin-sync ist zusätzlich schon im Matcher ausgenommen; hier
// nochmal, damit ein späterer Umbau des Matchers den Sync nicht still
// wieder auf die Anmeldeseite schickt.
const PUBLIC_PATHS = ["/login", "/auth", "/api/garmin-sync"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieToSet[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // Nach der Anmeldung dorthin zurück, wo man hinwollte — nötig für die
  // OAuth-Zustimmung (/oauth/consent?authorization_id=…), die sonst ihre
  // Anfrage-ID verliert (29.09.2026).
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    const ziel = path + request.nextUrl.search;
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(ziel)}`;
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    const url = request.nextUrl.clone();
    url.search = "";
    url.pathname = "/";
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      return NextResponse.redirect(new URL(next, request.nextUrl.origin));
    }
    return NextResponse.redirect(url);
  }
  return response;
}
