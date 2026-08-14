"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { Logo } from "./logo";

// Gym fehlt hier bewusst: dieser Bereich bringt seine eigene Tab-Leiste mit
// (siehe app/gym/layout.tsx), wie der Essen-Bereich auch. Zwei Navigationen
// übereinander verwirren mehr, als sie helfen.
type Section = "geld" | "zeit" | "trading" | null;

const GELD = {
  home: { href: "/geld", label: "Übersicht" },
  primary: [
    { href: "/analyse", label: "Analyse" },
    { href: "/runway", label: "Runway" },
    { href: "/transaktionen", label: "Transaktionen" },
    { href: "/konten", label: "Konten" },
  ],
  secondary: [
    { href: "/fixkosten", label: "Fixkosten" },
    { href: "/kategorien", label: "Kategorien" },
    { href: "/import", label: "Import" },
    { href: "/ziele", label: "Ziele" },
    { href: "/zuruecksetzen", label: "Zurücksetzen" },
  ],
};

const ZEIT = {
  home: { href: "/kalender", label: "Kalender" },
  primary: [
    { href: "/woche", label: "Woche" },
    { href: "/termine", label: "Termine" },
    { href: "/aufgaben", label: "Aufgaben" },
    { href: "/rueckblick", label: "Rückblick" },
  ],
  secondary: [
    { href: "/schichten", label: "Schichten" },
    { href: "/aktivitaeten", label: "Aktivitäten" },
    { href: "/fokus", label: "Fokus" },
    { href: "/zuruecksetzen", label: "Zurücksetzen" },
  ],
};

/**
 * Trading laeuft in vier Schritten, und die obere Reihe bildet genau sie ab:
 * Cockpit (was ist da?), Ranking (spricht die Fundamentallage dafuer?),
 * Journal (was habe ich gemacht?), Backtest (traegt die Methode ueberhaupt?).
 *
 * Alles andere - Radar, Heatmap, Auswertung, Kategorien, Alarme - sind
 * Detailansichten und stehen deshalb in der zweiten Reihe.
 *
 * Cockpit, Ranking, Radar, Heatmap und das ganze Journal sind aus dem
 * GVA-Screener umgezogen; der ist nur noch Labor (ML, Quant, Fundamentaldaten).
 * Siehe ../../TRADING-UMBAU.md.
 */
const TRADING = {
  home: { href: "/trading", label: "Übersicht" },
  primary: [
    { href: "/trading/cockpit", label: "Cockpit" },
    { href: "/trading/ranking", label: "Ranking" },
    { href: "/trading/journal", label: "Journal" },
    { href: "/trading/backtest", label: "Backtest" },
  ],
  secondary: [
    { href: "/trading/radar", label: "Radar" },
    { href: "/trading/heatmap", label: "Heatmap" },
    { href: "/trading/backtest/auswertung", label: "Auswertung" },
    { href: "/trading/backtest/kategorien", label: "Kategorien" },
    { href: "/trading/alarme", label: "Alarme" },
    { href: "https://gva-screener-kerim-alurs-projects.vercel.app", label: "Labor \u2197" },
  ],
};

const GELD_PATHS = ["/geld", "/analyse", "/runway", "/transaktionen", "/konten",
  "/fixkosten", "/kategorien", "/import"];
const ZEIT_PATHS = ["/zeit", "/kalender", "/woche", "/aktivitaeten", "/ziele",
  "/rueckblick", "/schichten", "/termine", "/aufgaben"];
const TRADING_PATHS = ["/trading"];
// "/", "/links", "/gym" und "/m/…" gehören zu keinem Bereich - dort zeigt
// die Navigation nichts bzw. der Bereich bringt seine eigene Leiste mit.

const SECTION_LABEL: Record<Exclude<Section, null>, string> = {
  geld: "Geld",
  zeit: "Zeit",
  trading: "Trading",
};

function sectionOf(path: string): Section {
  if (GELD_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return "geld";
  if (ZEIT_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return "zeit";
  if (TRADING_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return "trading";
  return null;
}

export function Nav({ email }: { email?: string }) {
  const path = usePathname();
  // Der Zen-Modus zeigt bewusst nichts ausser dem Zähler
  if (path === "/fokus") return null;
  const section = sectionOf(path);
  const config = section === "geld" ? GELD : section === "zeit" ? ZEIT : TRADING;

  /**
   * Aktiv ist der längste passende Eintrag, nicht jeder passende.
   * Sonst leuchten auf /trading/backtest/auswertung gleich drei Punkte
   * ("Übersicht", "Backtest", "Auswertung"), weil alle Präfixe passen.
   */
  const treffer = [config.home, ...config.primary, ...config.secondary]
    .map((l) => l.href)
    .filter((h) => !h.startsWith("http"))
    .filter((h) => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === treffer;

  if (!section) {
    return (
      <header className="border-b border-line/70">
        <div className="mx-auto flex max-w-6xl items-center justify-end px-5 py-3">
          {email && <span className="mr-4 text-xs text-ink-faint">{email}</span>}
          <form action="/auth/signout" method="post">
            <button className="text-xs text-ink-muted transition hover:text-ink-soft">
              Abmelden
            </button>
          </form>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-card/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 pt-4">
          <Link href="/" className="mr-5 flex items-center gap-2.5 transition duration-150 ease-tactile active:scale-95"
            title="Zurück zur Auswahl">
            <Logo inverted className="h-7 w-7 rounded-lg" />
            <span className="font-display text-sm font-bold text-ink">
              {SECTION_LABEL[section]}
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1">
            {[config.home, ...config.primary].map((l) => (
              <Link key={l.href} href={l.href}
                className={cx(
                  "rounded-xl px-3 py-1.5 text-sm transition duration-150 ease-tactile active:scale-95",
                  isActive(l.href)
                    ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                    : "text-ink-muted hover:bg-sand hover:text-ink-soft")}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <Link href="/"
              className="text-xs text-accent-soft transition hover:underline">
              Zurück zum Dashboard
            </Link>
            <form action="/auth/signout" method="post">
              <button className="text-xs text-ink-muted transition hover:text-ink-soft">
                Abmelden
              </button>
            </form>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-3 pt-2.5">
          {config.secondary.map((l) =>
            l.href.startsWith("http") ? (
              // Externe Ziele in neuem Tab, sonst verlässt man KerimOS unbemerkt
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                className="text-xs text-ink-faint transition hover:text-ink-muted">
                {l.label}
              </a>
            ) : (
              <Link key={l.href} href={l.href}
                className={cx("text-xs transition",
                  isActive(l.href) ? "font-medium text-accent" : "text-ink-faint hover:text-ink-muted")}>
                {l.label}
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
