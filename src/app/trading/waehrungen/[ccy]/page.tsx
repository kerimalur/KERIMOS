import Link from "next/link";
import { notFound } from "next/navigation";
import { G8, tradingConfigured } from "@/lib/supabase/trading";
import { ladeMakro } from "@/lib/makro/laden";
import { ladeVerlauf, type Indikator } from "@/lib/makro/verlauf";
import {
  ROHSTOFF_BEZUG, ZYKLUS_LABEL, zinsSchritteAus, zyklusAus, type Zyklus,
} from "@/lib/makro/bewertung";
import { notenbankSpeichern } from "@/lib/makro-actions";
import { EbenenVerlauf } from "@/components/makro/ebenen-verlauf";
import { PflegeFormular, SyncLeiste } from "@/components/makro/pflege";
import { ScoreBalken, urteilWort } from "@/components/makro/teile";
import { Badge, Card, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

const NAME: Record<string, string> = {
  USD: "US-Dollar", EUR: "Euro", GBP: "Britisches Pfund", JPY: "Japanischer Yen",
  AUD: "Australischer Dollar", NZD: "Neuseeland-Dollar", CAD: "Kanadischer Dollar", CHF: "Schweizer Franken",
};

const ZYKLUS_TON: Record<Zyklus, "gut" | "schlecht" | "neutral"> = {
  straffung: "gut", pause_oben: "gut", lockerung: "schlecht", pause_unten: "schlecht",
};

/**
 * Eine Währung — nach Kerims drei Ebenen (26.09.2026 abends).
 *
 * Die einzige Währungsseite. Die alte Übersicht leitet hierher weiter; das
 * Pflegen der Zahlen und der Datenlauf stehen aufklappbar ganz unten.
 */
export default async function Waehrung({ params }: { params: Promise<{ ccy: string }> }) {
  const ccy = (await params).ccy.toUpperCase();
  if (!(G8 as readonly string[]).includes(ccy)) notFound();
  if (!tradingConfigured()) {
    return <Card><Empty>Trading-Datenbank nicht verbunden.</Empty></Card>;
  }

  const [indikatoren, b] = await Promise.all([ladeVerlauf(ccy), ladeMakro()]);
  const I = Object.fromEntries(indikatoren.map((i) => [i.key, i])) as Record<string, Indikator>;
  const zeile = b.zeilen.find((z) => z.ccy === ccy) ?? null;
  const e1 = zeile?.ebenen.find((e) => e.ebene === 1);
  const e2 = zeile?.ebenen.find((e) => e.ebene === 2);
  const e3 = zeile?.ebenen.find((e) => e.ebene === 3);

  const schritte = zinsSchritteAus(I.leitzins.punkte);
  const manuell = b.zyklen[ccy] ?? null;
  const zyklus = manuell ?? zyklusAus(schritte);
  const erwartung = e2?.teile.find((t) => t.key === "erwartung");
  const regime = e3?.teile.find((t) => t.key === "regime");
  const ereignisse = b.ereignisse
    .filter((e) => e.profitiert.includes(ccy) || e.leidet.includes(ccy))
    .map((e) => ({ titel: e.titel, datum: e.datum, notiz: e.notiz,
      richtung: (e.profitiert.includes(ccy) ? 1 : -1) as 1 | -1 }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {b.zeilen.map((z) => (
          <Link key={z.ccy} href={`/trading/waehrungen/${z.ccy}`}
            className={cx("rounded-xl px-3 py-1.5 text-sm transition duration-150",
              z.ccy === ccy ? "bg-accent font-medium text-ink-on shadow-glow-accent" : "bg-sand text-ink-muted hover:text-ink")}>
            {z.ccy}
            <span className={cx("ml-2 text-[11px]",
              z.ccy === ccy ? "text-ink-on/80"
                : z.gesamt === null ? "text-ink-faint"
                  : z.gesamt > 0.05 ? "text-good-bright" : z.gesamt < -0.05 ? "text-bad-bright" : "text-ink-faint")}>
              {z.gesamt === null ? "—" : `${z.gesamt > 0 ? "+" : ""}${z.gesamt.toFixed(2)}`}
            </span>
          </Link>
        ))}
        <Link href="/trading/fundamentals" className="ml-auto text-xs text-accent-soft hover:underline">
          ← Rangliste
        </Link>
      </div>

      <Card area="trading">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-3xl font-bold text-ink">{ccy}</span>
          <span className="text-sm text-ink-muted">{NAME[ccy]}</span>
          {zeile && (
            <Badge tone={zeile.gesamt === null ? "neutral" : zeile.gesamt > 0.15 ? "good" : zeile.gesamt < -0.15 ? "bad" : "neutral"}>
              {urteilWort(zeile.gesamt)}
            </Badge>
          )}
          <span className="ml-auto"><ScoreBalken score={zeile?.gesamt ?? null} breit={160} /></span>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Urteil = Ebene 1 (Wirtschaft) und Ebene 2 (Zentralbank) je zur Hälfte.
          Ebene 3 wird angezeigt, aber noch nicht gewertet.
        </p>
      </Card>

      <EbenenVerlauf
        ccy={ccy}
        scores={{ e1: e1?.score ?? null, e2: e2?.score ?? null }}
        e1={{ pmiI: I.pmi_industrie, pmiD: I.pmi_dienste, bip: I.bip_yoy,
          kontext: [I.fruehindikator, I.arbeitslos, I.handelsbilanz] }}
        e2={{
          leitzins: I.leitzins, inflation: I.inflation, zweijahr: I.zweijahr,
          kontext: [I.rendite_10j],
          schritte,
          zyklus: zyklus ? { label: ZYKLUS_LABEL[zyklus], auto: !manuell, ton: ZYKLUS_TON[zyklus] } : null,
          erwartung: { wert: erwartung?.wert ?? null, text: erwartung?.text ?? "Keine 2-Jahres-Rendite." },
          notiz: b.notizen[ccy] ?? "",
        }}
        e3={{
          cot: I.cot, cotReal: I.cot_real,
          abhaengigkeit: ROHSTOFF_BEZUG[ccy] ?? "",
          regime: regime?.text ?? "Kein Regime.",
          ereignisse,
        }}
        notizFormular={
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-accent-soft hover:underline">bearbeiten</summary>
            <form action={notenbankSpeichern} className="mt-2 space-y-2">
              <input type="hidden" name="ccy" value={ccy} />
              <label className="block text-[11px] text-ink-muted">
                Zyklus
                <select name="zyklus" defaultValue={manuell ?? ""}
                  className="mt-1 block w-full rounded-lg border border-line bg-field px-2 py-1.5 text-sm text-ink">
                  <option value="">automatisch aus dem Zinsverlauf</option>
                  {Object.entries(ZYKLUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="block text-[11px] text-ink-muted">
                Warum — welche Sorge besteht?
                <textarea name="notiz" rows={3} defaultValue={b.notizen[ccy] ?? ""}
                  className="mt-1 block w-full rounded-lg border border-line bg-field px-2 py-1.5 text-sm text-ink" />
              </label>
              <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-on">
                Speichern
              </button>
            </form>
          </details>
        }
      />

      <details className="rounded-2xl border border-line/70 bg-card/60 p-4">
        <summary className="cursor-pointer text-sm text-ink-soft">Zahlen von Hand pflegen · Datenlauf</summary>
        <div className="mt-4 space-y-4">
          <SyncLeiste sync={b.sync} />
          <PflegeFormular ccy={ccy} hand={b.hand[ccy] ?? {}} stichtag={b.stichtag} />
        </div>
      </details>
    </div>
  );
}
