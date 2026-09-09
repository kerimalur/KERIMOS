import type { Metadata, Viewport } from "next";
import { Sora, Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { AmbientBg } from "@/components/ambient-bg";
import { createClient } from "@/lib/supabase/server";
import { ladeOberflaeche, akzentVariablen, STANDARD_OBERFLAECHE } from "@/lib/oberflaeche";

// Sora für Überschriften und grosse Zahlen, Manrope für Fliesstext,
// Plex Mono überall dort, wo Ziffern untereinander stehen sollen.
const sora = Sora({
  subsets: ["latin"], weight: ["600", "700"], variable: "--font-sora", display: "swap",
});
const manrope = Manrope({
  subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-manrope", display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap",
});

export const metadata: Metadata = {
  title: "KerimOS",
  description: "Zeit, Geld und Ziele an einem Ort.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "KerimOS" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#17130F",
  // Ohne das sitzt die installierte App unter der Android-Statusleiste.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Die Hausfarbe wird als CSS-Variable am <html> gesetzt; Tailwind zeigt
  // fuer `accent` darauf (siehe tailwind.config.ts). Ohne Anmeldung gilt
  // der Standard — die Anmeldeseite soll keine Abfrage ausloesen.
  const oberflaeche = user ? await ladeOberflaeche() : STANDARD_OBERFLAECHE;

  return (
    <html lang="de-CH"
      style={akzentVariablen(oberflaeche.akzent) as React.CSSProperties}
      className={`${sora.variable} ${manrope.variable} ${plexMono.variable}`}>
      <body className="min-h-screen font-sans">
        {oberflaeche.ambient && <AmbientBg />}
        <div className="kt-content">
          {user && <Nav email={user.email ?? undefined} />}
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
