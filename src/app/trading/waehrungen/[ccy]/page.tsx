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
import { Card, CardTitle, Empty, cx } from "@/components/ui";
import { ZielbandZeile } from "@/components/makro/zielband-zeile";
import { VerlaufPopup } from "@/components/makro/verlauf-popup";
import { INFLATIONSZIELE } from "@/lib/makro/ziele";
import { ladeWaehrungsReleases, ladeUebersicht } from "@/lib/makro/releases-laden";
import {
  Datenluecken, EntscheidTabelle, NaechsteTermine, ReleasesNachKategorie,
} from "@/components/makro/ueberraschung-teile";
import { IndexKategorien, IstGegenErwartung } from "@/components/makro/ueberraschung-grafik";
import {
  FeldChip, GrosseUeberraschungen, GruendeListe, KernKarte, UrteilBalken, UrteilMarke,
} from "@/components/makro/urteil-teile";
import { Info } from "@/components/makro/info";
import { ERKLAERUNG } from "@/lib/makro/erklaerungen";
import { BANK } from "@/lib/makro/urteil";
import { istNotenbankTon } from "@/lib/makro/releases";

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
 *
 * Seit dem 29.09.2026 abends (Kerims Rückmeldung: zu viele Daten, zu wenig
 * Aussage) zuerst das Urteil mit drei bis fünf Begründungen, dann die drei
 * Ebenen mit je wenigen Kernzahlen (Rohdaten im Pop-up), dann grosse
 * Überraschungen und was als Nächstes kommt. Alles andere — Grafiken, alle
 * Reihen, Tabellen, Datenlücken, Niveau-Verlauf, Pflege — steht aufklappbar
 * unter „Alle Daten".
 */
export default async function Waehrung({ params }: { params: Promise<{ ccy: string }> }) {
  const ccy = (await params).ccy.toUpperCase();
  if (!(G8 as readonly string[]).includes(ccy)) notFound();
  if (!tradingConfigured()) {
    return <Card><Empty>Trading-Datenbank nicht verbunden.</Empty></Card>;
  }

  const [indikatoren, b] = await Promise.all([ladeVerlauf(ccy), ladeMakro()]);
  const zeile = b.zeilen.find((z) => z.ccy === ccy) ?? null;
  const [rel, { urteile }] = await Promise.all([
    ladeWaehrungsReleases(ccy, b.hand[ccy] ?? {}, zeile),
    ladeUebersicht(b.zeilen),
  ]);
  const u = rel.urteil;
  const I = Object.fromEntries(indikatoren.map((i) => [i.key, i])) as Record<string, Indikator>;
  const kern = (key: string) => u.kern.find((k) => k.key === key)!;
  const e1 = zeile?.ebenen.find((e) => e.ebene === 1);
  const e2 = zeile?.ebenen.find((e) => e.ebene === 2);
  const e3 = zeile?.ebenen.find((e) => e.ebene === 3);

  const schritte = zinsSchritteAus(I.leitzins.punkte);
  // Für die Pop-ups: höchstens ein Punkt pro Woche, sonst gehen tausende Tageswerte in den Browser.
  const woechentlich = (pk: { datum: string; wert: number }[] | undefined) => {
    const out = new Map<string, { datum: string; wert: number }>();
    for (const p of pk ?? []) {
      const d = new Date(`${p.datum.slice(0, 10)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      out.set(d.toISOString().slice(0, 10), { datum: p.datum.slice(0, 10), wert: p.wert });
    }
    return [...out.values()];
  };
  const letzter = (pk: { wert: number }[] | undefined) => (pk && pk.length ? pk[pk.length - 1].wert : null);
  const zinsJetzt = letzter(I.leitzins?.punkte), inflJetzt = letzter(I.inflation?.punkte), zweiJetzt = letzter(I.zweijahr?.punkte);
  const ziel = INFLATIONSZIELE[ccy];
  const manuell = b.zyklen[ccy] ?? null;
  const zyklus = manuell ?? zyklusAus(schritte);
  const erwartung = e2?.teile.find((t) => t.key === "erwartung");
  const regime = e3?.teile.find((t) => t.key === "regime");
  const cot = e3?.teile.find((t) => t.key === "cot");
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
                : urteile[z.ccy]?.ton === "gut" ? "text-good-bright"
                  : urteile[z.ccy]?.ton === "schlecht" ? "text-bad-bright" : "text-ink-faint")}>
              {urteile[z.ccy]?.ton === "gut" ? "▲" : urteile[z.ccy]?.ton === "schlecht" ? "▼" : "●"}
            </span>
          </Link>
        ))}
        <Link href="/trading/fundamentals" className="ml-auto text-xs text-accent-soft hover:underline">
          ← Terminal
        </Link>
      </div>

      <Card area="trading">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-3xl font-bold text-ink">{ccy}</span>
          <span className="text-sm text-ink-muted">{NAME[ccy]}</span>
          <UrteilMarke wort={u.wort} gross />
          <Info titel="Das Urteil" breit={320}>
            <span className="block">{ERKLAERUNG.urteil}</span>
            <span className="mt-2 block text-ink-faint">{ERKLAERUNG.gewichtung}</span>
          </Info>
          <span className="ml-auto"><UrteilBalken score={u.score} breit={160} /></span>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Warum</p>
          <GruendeListe gruende={u.gruende} />
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line/50 pt-3">
          <FeldChip label="Zentralbank" feld={u.felder.zentralbank} info={ERKLAERUNG.zentralbank} />
          <FeldChip label="Wirtschaft" feld={u.felder.wirtschaft} info={ERKLAERUNG.wirtschaft} />
          <FeldChip label="Überraschung" feld={u.felder.ueberraschung} info={ERKLAERUNG.ueberraschung} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CardTitle className="mb-0">1 · Wirtschaft</CardTitle>
            <Info titel="Ebene 1 · Wirtschaft">{ERKLAERUNG.wirtschaft}</Info>
          </div>
          <div className="space-y-2">
            <KernKarte k={kern("pmi_industrie")} />
            <KernKarte k={kern("pmi_dienste")} />
            <div className="-mt-1 text-right">
              <VerlaufPopup titel={`${ccy} · PMI Industrie und Dienste`} knopf="Verlauf: PMI" einheit=""
                linien={[
                  { label: "PMI Industrie", punkte: woechentlich(I.pmi_industrie?.punkte) },
                  { label: "PMI Dienste", punkte: woechentlich(I.pmi_dienste?.punkte) },
                ]}
                referenz={{ wert: 50, text: "50 = Wachstumsschwelle" }}
                zeilen={["Wichtiger als „über 50“: die Richtung. Fällt der PMI, verliert die Wirtschaft Schwung, auch wenn er noch über 50 liegt.",
                  "Für den Kurs zählt zusätzlich die Überraschung gegen den Konsens (siehe Kalender)."]} />
            </div>
            <KernKarte k={kern("bip")} />
            <KernKarte k={kern("arbeitslos")} />
            <KernKarte k={kern("jobs")} />
          </div>
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CardTitle className="mb-0">2 · Zentralbank · {BANK[ccy]}</CardTitle>
            <Info titel="Ebene 2 · Zentralbank">{ERKLAERUNG.zentralbank}</Info>
          </div>
          <div className="space-y-2">
            <KernKarte k={kern("leitzins")} />
            <div className="-mt-1 text-right">
              <VerlaufPopup titel={`${BANK[ccy]} · Leitzins, Inflation und Markterwartung`} knopf="Verlauf: Zins, Inflation, 2J-Rendite"
                linien={[
                  { label: "Leitzins", punkte: woechentlich(I.leitzins?.punkte), stufe: true },
                  { label: "Inflation", punkte: woechentlich(I.inflation?.punkte) },
                  { label: "2-Jahres-Rendite (Markterwartung)", punkte: woechentlich(I.zweijahr?.punkte) },
                ]}
                band={ziel ? { min: ziel.min, max: ziel.max, text: `Inflationsziel ${ziel.text}` } : undefined}
                zeilen={[
                  zinsJetzt !== null && inflJetzt !== null
                    ? `Realzins (Leitzins − Inflation): ${(zinsJetzt - inflJetzt).toFixed(2)} % — ${zinsJetzt - inflJetzt >= 0 ? "Sparer verdienen real" : "Sparer verlieren real Kaufkraft"}.` : "",
                  zinsJetzt !== null && zweiJetzt !== null
                    ? `2-Jahres-Rendite minus Leitzins: ${(zweiJetzt - zinsJetzt >= 0 ? "+" : "")}${(zweiJetzt - zinsJetzt).toFixed(2)} % — ${zweiJetzt - zinsJetzt > 0.15 ? "der Markt preist eher Erhöhungen ein" : zweiJetzt - zinsJetzt < -0.15 ? "der Markt preist eher Senkungen ein" : "der Markt erwartet kaum Veränderung"}. Was eingepreist ist, bewegt den Kurs nicht mehr — nur eine Abweichung davon.` : "",
                  u.schritt ? `Nächster Termin laut Kalender: ${u.schritt}.` : "",
                  rel.inflationJahr && ziel ? `Inflation ${rel.inflationJahr.wert.toFixed(1)} % gegen Ziel ${ziel.text}.` : "",
                ].filter(Boolean)} />
            </div>
            {u.schritt && (
              <p className="rounded-xl bg-trading-bg px-3 py-2 text-xs text-trading-bright">Nächster Schritt: {u.schritt}</p>
            )}
            {erwartung && erwartung.score !== null && (
              <p className="rounded-xl bg-sand/60 px-3 py-2 text-xs text-ink-soft">
                <span className="text-ink-muted">Markt:</span> {erwartung.text}
              </p>
            )}
            <KernKarte k={kern("cpi")} info={ERKLAERUNG.inflation} />
            <KernKarte k={kern("kern_cpi")} info={ERKLAERUNG.inflation} />
            <ZielbandZeile ccy={ccy} inflation={rel.inflationJahr} />
          </div>
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CardTitle className="mb-0">3 · Stimmung</CardTitle>
            <span className="text-[11px] text-ink-faint">nur Anzeige</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="rounded-xl bg-sand/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-ink-muted">Risiko-Regime</span>
                <Info titel="Risiko-Regime" breit={320}>{ERKLAERUNG.regime}</Info>
              </div>
              <p className="mt-1 text-xs text-ink-soft">{regime?.text ?? "Kein Regime."}</p>
            </div>
            <div className="rounded-xl bg-sand/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-ink-muted">COT</span>
                <Info titel="COT">{ERKLAERUNG.cot}</Info>
              </div>
              <p className="mt-1 text-xs text-ink-soft">{cot?.text ?? "Keine COT-Reihe."}</p>
            </div>
            {ROHSTOFF_BEZUG[ccy] && (
              <div className="rounded-xl bg-sand/60 px-3 py-2.5">
                <span className="text-[11px] text-ink-muted">Rohstoffe</span>
                <p className="mt-1 text-xs text-ink-soft">{ROHSTOFF_BEZUG[ccy]}</p>
              </div>
            )}
            {ereignisse.length > 0 && (
              <div className="rounded-xl bg-sand/60 px-3 py-2.5">
                <span className="text-[11px] text-ink-muted">Ereignisse</span>
                {ereignisse.map((x) => (
                  <p key={x.titel} className={cx("mt-1 text-xs", x.richtung > 0 ? "text-good-bright" : "text-bad-bright")}>
                    {x.richtung > 0 ? "▲" : "▼"} {x.titel}
                  </p>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CardTitle className="mb-0">Grosse Überraschungen · 30 Tage</CardTitle>
            <Info titel="Grosse Überraschungen">{ERKLAERUNG.grosse}</Info>
          </div>
          <GrosseUeberraschungen liste={u.grosse} ccy={ccy} />
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CardTitle className="mb-0">Als Nächstes</CardTitle>
            <Link href={`/trading/fundamentals/kalender?ccy=${ccy}`} className="ml-auto text-[11px] text-accent-soft hover:underline">
              Kalender {ccy} →
            </Link>
          </div>
          <NaechsteTermine termine={rel.naechste.filter((r) =>
            r.impact === "High" || r.kategorie === "notenbank" || (istNotenbankTon(r.titel) && r.impact === "Medium"))} />
        </Card>
      </div>

      <details className="rounded-2xl border border-line/70 bg-card/60 p-4">
        <summary className="cursor-pointer text-sm text-ink-soft">
          Alle Daten · Grafiken, alle Veröffentlichungen, Datenlücken, Niveau-Verlauf
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardTitle>Ist gegen Erwartung · Verlauf</CardTitle>
              <IstGegenErwartung serien={rel.serien} ccy={ccy} />
            </Card>
            <Card>
              <CardTitle>Datenlücken</CardTitle>
              <Datenluecken luecken={rel.luecken} />
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>Überraschungsindex {ccy}</CardTitle>
              <IndexKategorien verlauf={rel.verlauf} />
            </Card>
            <Card>
              <CardTitle>Zinsentscheide gegen die Erwartung</CardTitle>
              <EntscheidTabelle entscheide={rel.entscheide} />
            </Card>
          </div>
          <Card>
            <CardTitle>Veröffentlichungen der letzten 45 Tage</CardTitle>
            <ReleasesNachKategorie releases={rel.letzte} />
          </Card>

          <h2 className="font-display text-lg font-semibold text-ink">Niveau-Verlauf nach den drei Ebenen</h2>

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
      </details>
    </div>
  );
}
