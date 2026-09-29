import Link from "next/link";
import { G8, tradingConfigured } from "@/lib/supabase/trading";
import { ladeKalender } from "@/lib/makro/releases-laden";
import { KATEGORIEN, KATEGORIE_LABEL, type Kategorie, type Release } from "@/lib/makro/releases";
import { ReleaseTabelle } from "@/components/makro/ueberraschung-teile";
import { Card, CardTitle, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Kalender mit Erwartung und Ist (29.09.2026).
 *
 * Der Wirtschaftskalender, wie ihn Forex Factory zeigt — aber mit der
 * Abweichung und ihrer Wirkung auf die Währung. Oben was kommt, darunter was
 * war. Gefiltert wird über die Adresse (?ccy=USD&kat=inflation&impact=high),
 * damit sich jede Ansicht verlinken lässt.
 */

type Impact = "alle" | "high" | "medium";

const IMPACT_LABEL: Record<Impact, string> = { alle: "Alle", high: "Nur High", medium: "High + Medium" };

function passt(r: Release, ccy: string | null, kat: Kategorie | null, impact: Impact): boolean {
  if (ccy && r.ccy !== ccy) return false;
  if (kat && r.kategorie !== kat) return false;
  if (impact === "high" && r.impact !== "High") return false;
  if (impact === "medium" && r.impact !== "High" && r.impact !== "Medium") return false;
  return true;
}

export default async function Kalender({ searchParams }: {
  searchParams: Promise<{ ccy?: string; kat?: string; impact?: string }>;
}) {
  if (!tradingConfigured()) {
    return <Card><Empty>Trading-Datenbank nicht verbunden.</Empty></Card>;
  }
  const sp = await searchParams;
  const ccy = (G8 as readonly string[]).includes((sp.ccy ?? "").toUpperCase()) ? sp.ccy!.toUpperCase() : null;
  const kat = (KATEGORIEN as readonly string[]).includes(sp.kat ?? "") ? (sp.kat as Kategorie) : null;
  const impact: Impact = sp.impact === "high" || sp.impact === "alle" ? sp.impact : "medium";

  const alle = await ladeKalender(30, 14);
  const gefiltert = alle.filter((r) => passt(r, ccy, kat, impact));
  const jetzt = Date.now();
  const kommend = gefiltert.filter((r) => Date.parse(r.event_time) > jetzt);
  const vergangen = gefiltert.filter((r) => Date.parse(r.event_time) <= jetzt).reverse();
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date());
  const istHeute = (r: Release) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date(r.event_time)) === heute;
  const heuteListe = gefiltert.filter(istHeute);

  const url = (neu: Partial<{ ccy: string | null; kat: string | null; impact: Impact }>) => {
    const p = new URLSearchParams();
    const c = neu.ccy !== undefined ? neu.ccy : ccy;
    const k = neu.kat !== undefined ? neu.kat : kat;
    const i = neu.impact ?? impact;
    if (c) p.set("ccy", c);
    if (k) p.set("kat", k);
    if (i !== "medium") p.set("impact", i);
    const q = p.toString();
    return `/trading/fundamentals/kalender${q ? `?${q}` : ""}`;
  };

  const chip = (aktiv: boolean) => cx("rounded-lg px-2.5 py-1 text-xs transition",
    aktiv ? "bg-accent font-medium text-ink-on" : "bg-sand text-ink-muted hover:text-ink");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Kalender · Erwartung gegen Ist</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Letzte 30 und nächste 14 Tage. Die Wirkung zeigt, ob eine Zahl die Währung
            gestützt (grün) oder belastet (rot) hat — gemessen an der Erwartung.
          </p>
        </div>
        <Link href="/trading/fundamentals" className="text-xs text-accent-soft hover:underline">← Terminal</Link>
      </div>

      <Card>
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-[11px] uppercase tracking-[0.1em] text-ink-muted">Währung</span>
            <Link href={url({ ccy: null })} className={chip(ccy === null)}>Alle</Link>
            {G8.map((c) => <Link key={c} href={url({ ccy: c })} className={chip(ccy === c)}>{c}</Link>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-[11px] uppercase tracking-[0.1em] text-ink-muted">Bereich</span>
            <Link href={url({ kat: null })} className={chip(kat === null)}>Alle</Link>
            {KATEGORIEN.map((k) => <Link key={k} href={url({ kat: k })} className={chip(kat === k)}>{KATEGORIE_LABEL[k]}</Link>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-[11px] uppercase tracking-[0.1em] text-ink-muted">Impact</span>
            {(["medium", "high", "alle"] as Impact[]).map((i) => (
              <Link key={i} href={url({ impact: i })} className={chip(impact === i)}>{IMPACT_LABEL[i]}</Link>
            ))}
          </div>
        </div>
      </Card>

      {heuteListe.length > 0 && (
        <Card area="trading">
          <CardTitle>Heute</CardTitle>
          <ReleaseTabelle releases={heuteListe} mitWaehrung leer="" />
        </Card>
      )}

      <Card>
        <CardTitle>Kommt ({kommend.length})</CardTitle>
        <ReleaseTabelle releases={kommend} mitWaehrung leer="Nichts im Kalenderfenster für diese Auswahl." />
      </Card>

      <Card>
        <CardTitle>War ({vergangen.length})</CardTitle>
        <ReleaseTabelle releases={vergangen} mitWaehrung leer="Nichts in den letzten 30 Tagen für diese Auswahl." />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          „rekonstruiert" heisst: das Ist stammt aus dem Vorwert des Folgetermins. Termine ohne Ist
          warten, bis der nächste Termin derselben Reihe im Kalender steht — oder bis JBlanked es liefert.
        </p>
      </Card>
    </div>
  );
}
