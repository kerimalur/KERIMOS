import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { THEMA_SKRIPT } from "@/components/thema-schalter";
import { createClient } from "@/lib/supabase/server";

// Design D (07.10.2026): Bricolage Grotesque für Überschriften und grosse
// Zahlen, Hanken Grotesk für Fliesstext, Plex Mono wo Ziffern untereinander
// stehen sollen.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-bricolage", display: "swap",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-hanken", display: "swap",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3F3F0" },
    { media: "(prefers-color-scheme: dark)", color: "#101114" },
  ],
  // Ohne das sitzt die installierte App unter der Android-Statusleiste.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    // suppressHydrationWarning: die Klasse `dark` setzt das Skript im Kopf
    // vor React — sonst meldet React einen Unterschied, den es selbst nicht hat.
    <html lang="de-CH" suppressHydrationWarning
      className={`${bricolage.variable} ${hanken.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEMA_SKRIPT }} />
      </head>
      <body className="min-h-screen font-sans">
        {user && <Nav email={user.email ?? undefined} />}
        {/* Unten Platz für die schwebende Leiste. */}
        <main className="mx-auto max-w-6xl px-4 pb-32 pt-6">{children}</main>
      </body>
    </html>
  );
}
