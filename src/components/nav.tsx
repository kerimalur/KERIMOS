"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { Logo } from "./logo";

// Essen fehlt hier bewusst: der Bereich bringt seine eigene Tab-Leiste mit
// (siehe components/essen-tabs.tsx). Zwei Navigationen übereinander
// verwirren mehr, als sie helfen.
//
// Seit dem Radikalschnitt vom 09.09.2026 besteht KerimOS aus Trading und
// Essen. Die Struktur bleibt trotzdem als Tabelle stehen und wird nicht auf
// einen festen Trading-Kopf eingedampft — sie kostet nichts, und der nächste
// Bereich mit Unterseiten hängt sich hier ohne Umbau ein.
type Section = "trading" | null;

/**
 * Ein Eintrag der Hauptnavigation.
 *
 * `auch` gibt es, seit ein Bereich aus zwei getrennten Adressen besteht:
 * Confluence führt auf /trading/ranking (die Übersicht), enthält aber auch
 * /trading/confluence (Monty). Ohne die Liste leuchtet auf Monty gar kein
 * Punkt, und man weiss beim Blick nach oben nicht mehr, wo man ist.
 */
interface NavLink {
  href: string;
  label: string;
  /** Weitere Pfade, die zu diesem Eintrag gehören. */
  auch?: string[];
}

interface NavConfig {
  home: NavLink;
  primary: NavLink[];
  secondary: NavLink[];
}

/**
 * Trading: sechs Bereiche in EINER Zeile, keine zweite Reihe mehr.
 *
 * Die alte Trennung in Haupt- und Nebenabschnitte war die Schwachstelle: bei
 * jeder neuen Seite musste man entscheiden, in welche Reihe sie gehoert, und
 * die Antwort war nie offensichtlich. Jetzt gilt eine Regel — oben der
 * Bereich, innerhalb des Bereichs die Ansicht (siehe components/trading/
 * bereich-tabs.tsx).
 *
 * Die Reihenfolge bildet den Arbeitsweg ab:
 *   Uebersicht     was habe ich mir selbst vorgenommen (nur die Watchlist)
 *   Cockpit        was ist gerade los am Chart (ein Raster, 28 Kacheln)
 *   Confluence     spricht die Fundamentallage dafuer (Ranking, Monty)
 *   Journal        was habe ich gemacht
 *   Backtest       traegt die Methode ueberhaupt (Auswertung, Kategorien,
 *                  Rueckblick auf die Lage eines vergangenen Handelstages)
 *   Einstellungen  Alarme und der Weg ins Labor
 *
 * Siehe ../../TRADING-UMBAU.md.
 */
const TRADING: NavConfig = {
  home: { href: "/trading", label: "Übersicht" },
  primary: [
    { href: "/trading/cockpit", label: "Cockpit" },
    { href: "/trading/ranking", label: "Confluence", auch: ["/trading/confluence"] },
    { href: "/trading/journal", label: "Journal" },
    { href: "/trading/backtest", label: "Backtest" },
    { href: "/trading/einstellungen", label: "Einstellungen" },
  ],
  secondary: [],
};

const TRADING_PATHS = ["/trading"];
// "/" und "/m/Essen" gehören zu keinem Bereich - dort zeigt die Navigation
// nur die Abmelden-Zeile bzw. der Bereich bringt seine eigene Leiste mit.

const SECTION_LABEL: Record<Exclude<Section, null>, string> = {
  trading: "Trading",
};

function sectionOf(path: string): Section {
  if (TRADING_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return "trading";
  return null;
}

export function Nav({ email }: { email?: string }) {
  const path = usePathname();
  const section = sectionOf(path);
  const config = TRADING;

  /**
   * Aktiv ist der längste passende Eintrag, nicht jeder passende.
   * Sonst leuchten auf /trading/backtest/auswertung gleich drei Punkte
   * ("Übersicht", "Backtest", "Auswertung"), weil alle Präfixe passen.
   */
  const passt = (h: string) => path === h || path.startsWith(h + "/");

  const treffer = [config.home, ...config.primary, ...config.secondary]
    .flatMap((l) => [l.href, ...(l.auch ?? [])])
    .filter((h) => !h.startsWith("http"))
    .filter(passt)
    .sort((a, b) => b.length - a.length)[0];

  const isActive = (href: string) => {
    const l = [config.home, ...config.primary, ...config.secondary]
      .find((x) => x.href === href);
    return href === treffer || (l?.auch ?? []).includes(treffer);
  };

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

        {/* Zweite Zeile nur, wenn der Bereich sie ueberhaupt hat. Trading hat
            seit dem Umbau keine mehr - dann darf hier auch kein leerer
            Streifen Platz wegnehmen. */}
        {config.secondary.length > 0 && (
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
        )}
        {config.secondary.length === 0 && <div className="pb-3" />}
      </div>
    </header>
  );
}
