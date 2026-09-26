"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { Logo } from "./logo";

// Essen fehlt hier bewusst: der Bereich bringt seine eigene Tab-Leiste mit
// (siehe components/essen-tabs.tsx). Zwei Navigationen übereinander
// verwirren mehr, als sie helfen.

/**
 * Zwei Bereiche statt einem (26.09.2026).
 *
 * **Analyse** ist alles VOR dem Trade: Marktlage, Fundamentals, Alarme.
 * **Journal** ist alles DANACH: eigene Trades, Backtest, Konten. Kerims
 * Ansage: das sind zwei verschiedene Arbeiten zu verschiedenen Zeiten, und
 * ein gemeinsamer Kopf mit sechs Einträgen zwingt bei jedem Klick zur
 * Entscheidung, in welchem Modus man gerade ist.
 *
 * Die Adressen bleiben vorerst unter /trading/…: ein Umbenennen bräche
 * Lesezeichen, den PWA-Shortcut und die Links in alten Push-Meldungen, ohne
 * dass sich an der Bedienung etwas ändert.
 */
type Section = "analyse" | "journal" | null;

/**
 * Ein Eintrag der Hauptnavigation.
 *
 * `auch` gibt es, seit ein Bereich aus zwei getrennten Adressen besteht:
 * „Alarme" führt auf /trading/einstellungen, deckt aber auch /trading/alarme
 * ab. Ohne die Liste leuchtet dort gar kein Punkt, und man weiss beim Blick
 * nach oben nicht mehr, wo man ist.
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

const ANALYSE: NavConfig = {
  home: { href: "/trading", label: "Übersicht" },
  primary: [
    { href: "/trading/cockpit", label: "Cockpit" },
    { href: "/trading/fundamentals", label: "Fundamentals" },
    { href: "/trading/waehrungen", label: "Währungen" },
    { href: "/trading/einstellungen", label: "Alarme", auch: ["/trading/alarme"] },
  ],
  secondary: [],
};

const JOURNAL: NavConfig = {
  home: { href: "/trading/journal", label: "Journal" },
  primary: [
    { href: "/trading/backtest", label: "Backtest" },
  ],
  secondary: [],
};

// Journal zuerst prüfen: seine Pfade liegen unter /trading und würden sonst
// von der Analyse eingefangen.
const JOURNAL_PATHS = ["/trading/journal", "/trading/backtest"];
const ANALYSE_PATHS = ["/trading"];

const SECTION_LABEL: Record<Exclude<Section, null>, string> = {
  analyse: "Analyse",
  journal: "Journal",
};

/** Der Einstieg in den jeweils anderen Bereich — ein Klick, kein Umweg. */
const SECTION_HOME: Record<Exclude<Section, null>, string> = {
  analyse: "/trading",
  journal: "/trading/journal",
};

function sectionOf(path: string): Section {
  if (JOURNAL_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return "journal";
  if (ANALYSE_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return "analyse";
  return null;
}

export function Nav({ email }: { email?: string }) {
  const path = usePathname();
  const section = sectionOf(path);
  const config = section === "journal" ? JOURNAL : ANALYSE;

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
          <Link href="/" className="mr-3 flex items-center transition duration-150 ease-tactile active:scale-95"
            title="Zurück zur Startseite">
            <Logo inverted className="h-7 w-7 rounded-lg" />
          </Link>

          {/* Bereichswechsel: Analyse ist vor dem Trade, Journal danach. */}
          <div className="mr-4 flex items-center gap-1 rounded-xl bg-sand p-1">
            {(["analyse", "journal"] as const).map((s) => (
              <Link key={s} href={SECTION_HOME[s]}
                className={cx(
                  "rounded-lg px-3 py-1 font-display text-sm font-bold transition duration-150",
                  section === s ? "bg-card text-ink shadow-card" : "text-ink-muted hover:text-ink-soft")}>
                {SECTION_LABEL[s]}
              </Link>
            ))}
          </div>

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
