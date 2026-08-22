"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { Logo } from "./logo";

// Gym fehlt hier bewusst: dieser Bereich bringt seine eigene Tab-Leiste mit
// (siehe app/gym/layout.tsx), wie der Essen-Bereich auch. Zwei Navigationen
// übereinander verwirren mehr, als sie helfen.
type Section = "zeit" | "trading" | null;

/**
 * Zeit: erfasst wird nichts mehr.
 *
 * Die minutengenaue Erfassung hat zwei Fragen beantworten sollen - "was mache
 * ich eigentlich?" und "wo habe ich neben der Arbeit Platz?". Die erste
 * beantwortet der Tagesrueckblick besser und in einer Minute statt in vielen,
 * die zweite die Wochenansicht. Erfassen kostete taeglich Zeit und wurde
 * deshalb nicht gemacht; drei Saetze am Abend kosten eine Minute.
 *
 * Raus sind: /zeit, /quick, /aktivitaeten, /achse, /heute, /fokus, /ziele.
 * Siehe ../../TRADING-UMBAU.md.
 */
/**
 * Zeit ist auf das Nötige zusammengestrichen (21.08.2026).
 *
 * Raus sind Kalender und Aufgaben. Beides doppelte Buchführung: was ansteht,
 * ist entweder ein Termin oder eine Zeile im Heute-Tab. Eine dritte Liste
 * daneben wird nicht gepflegt und ist dann schlimmer als keine.
 */
const ZEIT = {
  home: { href: "/termine", label: "Termine" },
  primary: [
    { href: "/rueckblick/heute", label: "Heute" },
    { href: "/rueckblick", label: "Rückblick" },
    { href: "/woche", label: "Woche" },
  ],
  secondary: [
    { href: "/schichten", label: "Schichten" },
  ],
};

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
 *   Cockpit        was ist gerade los am Chart (Radar, Heatmap, Board, News)
 *   Confluence     spricht die Fundamentallage dafuer (inkl. Ranking)
 *   Journal        was habe ich gemacht
 *   Backtest       traegt die Methode ueberhaupt (Auswertung, Kategorien)
 *   Einstellungen  Alarme und der Weg ins Labor
 *
 * Siehe ../../TRADING-UMBAU.md.
 */
const TRADING = {
  home: { href: "/trading", label: "Übersicht" },
  primary: [
    { href: "/trading/cockpit", label: "Cockpit" },
    { href: "/trading/confluence", label: "Confluence" },
    { href: "/trading/journal", label: "Journal" },
    { href: "/trading/backtest", label: "Backtest" },
    { href: "/trading/einstellungen", label: "Einstellungen" },
  ],
  secondary: [] as { href: string; label: string }[],
};

const ZEIT_PATHS = ["/termine", "/rueckblick", "/woche", "/schichten"];
const TRADING_PATHS = ["/trading"];
// "/", "/links", "/gym" und "/m/…" gehören zu keinem Bereich - dort zeigt
// die Navigation nichts bzw. der Bereich bringt seine eigene Leiste mit.

const SECTION_LABEL: Record<Exclude<Section, null>, string> = {
  zeit: "Zeit",
  trading: "Trading",
};

function sectionOf(path: string): Section {
  if (ZEIT_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return "zeit";
  if (TRADING_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return "trading";
  return null;
}

export function Nav({ email }: { email?: string }) {
  const path = usePathname();
  const section = sectionOf(path);
  const config = section === "zeit" ? ZEIT : TRADING;

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
