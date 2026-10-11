"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { ThemaSchalter } from "./thema-schalter";

/**
 * Navigation nach Design D „Fokus mit Brett“ (07.10.2026).
 *
 * Fünf feste Ziele, immer am gleichen Ort — unten in einer schwebenden
 * Leiste, wo der Daumen liegt, auch am Computer:
 *
 *   Heute    die Startseite mit Empfang und Brett
 *   Markt    Watchlist (eigene Linien, Entscheidungen) und Kalender
 *   Journal  Journal, Backtest
 *   Leben    Wochenziele, Routinen, Essen
 *
 * 11.10.2026: Makro ist aus der Navigation genommen, Cockpit, Screener und
 * Radar ebenso. Die Makro-Seiten und der Beobachter laufen im Hintergrund
 * weiter und sind über die kleinen Links unten auf /trading erreichbar.
 *
 * Oben steht je Bereich ein Titelbild — ein Ausschnitt aus der Collage — mit
 * den Seiten des Bereichs als Pillen darauf. Die Adressen unter /trading sind
 * dieselben wie vorher; nur die Navigation ist neu geordnet.
 *
 * Ersetzt die drei Trading-Köpfe (GVA / Fundamentals / Journal) vom
 * 26.09.2026 und die Rücklinks „← Startseite“.
 */

type Bereich = "heute" | "markt" | "journal" | "leben";

interface Seite { href: string; label: string; auch?: string[] }

interface BereichDef {
  key: Bereich;
  label: string;
  href: string;
  pfade: string[];
  kicker: string;
  seiten: Seite[];
  /** Ausschnitt der Collage: Brennpunkt in Prozent und Zoom. */
  bild: { x: number; y: number; zoom: number };
  icon: string;
}

const BEREICHE: BereichDef[] = [
  {
    key: "heute", label: "Heute", href: "/", pfade: [], kicker: "", seiten: [],
    bild: { x: 50, y: 40, zoom: 1 },
    icon: "M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z",
  },
  {
    key: "markt", label: "Markt", href: "/trading", pfade: ["/trading"],
    kicker: "Deine Linien und Entscheidungen",
    seiten: [
      { href: "/trading", label: "Watchlist" },
      { href: "/trading/fundamentals/kalender", label: "Kalender" },
    ],
    bild: { x: 46.5, y: 35, zoom: 1.7 },
    icon: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 1v4M12 19v4M1 12h4M19 12h4",
  },
  {
    key: "journal", label: "Journal", href: "/trading/journal",
    pfade: ["/trading/journal", "/trading/backtest", "/trading/labor"],
    kicker: "Trades, Backtest und Strategie-Labor",
    seiten: [
      { href: "/trading/journal", label: "Journal" },
      { href: "/trading/backtest", label: "Backtest" },
      { href: "/trading/labor", label: "Strategie-Labor" },
    ],
    bild: { x: 46.5, y: 82, zoom: 1.05 },
    icon: "M4 19V5M4 19h16M7 15l4-4 3 3 5-6",
  },
  {
    key: "leben", label: "Leben", href: "/wochenziele",
    pfade: ["/wochenziele", "/routinen", "/m"],
    kicker: "Ziele, Routinen, Essen",
    seiten: [
      { href: "/wochenziele", label: "Wochenziele" },
      { href: "/routinen", label: "Routinen" },
      { href: "/m/Essen", label: "Essen" },
    ],
    bild: { x: 92, y: 20, zoom: 1.25 },
    icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  },
];

const passt = (path: string, p: string) => path === p || path.startsWith(p + "/");

/** Spezifische Bereiche zuerst — alles Trading liegt unter /trading. */
function bereichVon(path: string): BereichDef | null {
  if (path === "/") return BEREICHE[0];
  for (const key of ["journal", "leben", "markt"] as const) {
    const b = BEREICHE.find((x) => x.key === key)!;
    if (b.pfade.some((p) => passt(path, p))) return b;
  }
  return null;
}

/**
 * Aktiv ist der längste passende Eintrag, nicht jeder passende — sonst
 * leuchten auf /trading/fundamentals/kalender zwei Pillen.
 */
function aktiveSeite(path: string, seiten: Seite[]): string | null {
  const treffer = seiten
    .flatMap((s) => [s.href, ...(s.auch ?? [])].map((h) => ({ s: s.href, h })))
    .filter((x) => passt(path, x.h))
    .sort((a, b) => b.h.length - a.h.length)[0];
  return treffer?.s ?? null;
}

export function Nav({ email }: { email?: string }) {
  const path = usePathname();
  const bereich = bereichVon(path);
  const start = bereich?.key === "heute";
  const index = bereich ? BEREICHE.indexOf(bereich) : -1;

  return (
    <>
      <header className={cx(
        "z-30 mx-auto flex max-w-6xl items-center gap-3 px-4 pt-4",
        start ? "absolute inset-x-0 top-0 text-photo" : "relative text-ink")}>
        <Link href="/" className="font-display text-[19px] font-bold tracking-tight"
          title="Zur Startseite">
          Kerim<span className={start ? "text-[#AFC0FF]" : "text-accent"}>OS</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {email && <span className={cx("hidden text-xs md:inline", start ? "text-photo/60" : "text-ink-faint")}>{email}</span>}
          <ThemaSchalter aufFoto={start} />
          <form action="/auth/signout" method="post">
            <button className={cx("min-h-[44px] px-2 text-xs transition",
              start ? "text-photo/70 hover:text-photo" : "text-ink-muted hover:text-ink-soft")}>
              Abmelden
            </button>
          </form>
        </div>
      </header>

      {bereich && !start && <Titelbild bereich={bereich} aktiv={aktiveSeite(path, bereich.seiten)} />}

      {/* Die schwebende Leiste. Breite je Knopf als Variable, damit die
          Markierung auf Handy (64 px) und Computer (76 px) gleich gleitet. */}
      <nav aria-label="Bereiche"
        className="fixed left-1/2 z-40 flex -translate-x-1/2 rounded-full border border-line bg-card/95 p-1.5
                   shadow-float backdrop-blur [--tab:64px] sm:[--tab:76px] print:hidden"
        style={{ bottom: "calc(14px + env(safe-area-inset-bottom))" }}>
        {index >= 0 && (
          <span aria-hidden
            className="absolute left-1.5 top-1.5 h-14 w-[var(--tab)] rounded-full bg-ink
                       transition-transform duration-[420ms] [transition-timing-function:cubic-bezier(.32,.72,0,1)]"
            style={{ transform: `translateX(calc(${index} * var(--tab)))` }} />
        )}
        {BEREICHE.map((b) => {
          const an = bereich?.key === b.key;
          return (
            <Link key={b.key} href={b.href} aria-current={an ? "page" : undefined}
              className={cx(
                "relative z-[1] flex h-14 w-[var(--tab)] flex-col items-center justify-center gap-0.5 rounded-full",
                "text-xs font-semibold transition-colors duration-300",
                an ? "text-paper" : "text-ink-muted hover:text-ink")}>
              <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor"
                strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={b.icon} />
              </svg>
              {b.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/**
 * Titelbild eines Bereichs: ein Ausschnitt der Collage, darauf der Name
 * und die Seiten als Pillen. Gezoomt wird um den Brennpunkt, damit derselbe
 * Ausschnitt auf Handy und Computer im Bild bleibt.
 */
function Titelbild({ bereich, aktiv }: { bereich: BereichDef; aktiv: string | null }) {
  const { x, y, zoom } = bereich.bild;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 print:hidden">
      <div className="relative isolate h-[170px] overflow-hidden rounded-[22px] bg-[#0B0C0F] text-photo sm:h-[210px]">
        <div aria-hidden key={bereich.key} className="absolute inset-0 -z-20 animate-bannerIn">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kompass-board.jpg" alt="" className="h-full w-full object-cover"
            style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` }} />
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#090A0C]/90 via-[#090A0C]/50 to-[#090A0C]/15" />
        <div className="absolute inset-x-5 bottom-4 flex flex-wrap items-end justify-between gap-3 sm:inset-x-7 sm:bottom-6">
          <div>
            <div className="text-sm text-photo/75">{bereich.kicker}</div>
            <h2 className="mt-0.5 font-display text-[40px] font-bold leading-none tracking-tight sm:text-[52px]">
              {bereich.label}
            </h2>
          </div>
          {bereich.seiten.length > 1 && (
            <nav aria-label={`Seiten in ${bereich.label}`}
              className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5">
              {bereich.seiten.map((s) => (
                <Link key={s.href} href={s.href} aria-current={aktiv === s.href ? "page" : undefined}
                  className={cx(
                    "shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition duration-200 active:scale-[0.97]",
                    aktiv === s.href ? "bg-photo text-[#111214]" : "kt-glas text-photo hover:bg-white/20")}>
                  {s.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
