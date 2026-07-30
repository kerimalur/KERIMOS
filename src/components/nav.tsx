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

const TRADING = {
  home: { href: "/trading", label: "Übersicht" },
  primary: [],
  secondary: [
    { href: "https://gva-screener-kerim-alurs-projects.vercel.app", label: "Zum Screener ↗" },
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
  const isActive = (href: string) => path === href || path.startsWith(href + "/");

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

  const config = section === "geld" ? GELD : section === "zeit" ? ZEIT : TRADING;

  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 pt-4">
          <Link href="/" className="mr-5 flex items-center gap-2.5"
            title="Zurück zur Auswahl">
            <Logo inverted className="h-7 w-7 rounded-lg" />
            <span className="text-sm font-medium text-ink">
              {SECTION_LABEL[section]}
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1">
            {[config.home, ...config.primary].map((l) => (
              <Link key={l.href} href={l.href}
                className={cx("rounded-lg px-3 py-1.5 text-sm transition",
                  isActive(l.href) ? "bg-sand text-ink"
                    : "text-ink-muted hover:bg-sand/60 hover:text-ink-soft")}>
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
                  isActive(l.href) ? "text-accent-soft" : "text-ink-faint hover:text-ink-muted")}>
                {l.label}
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
