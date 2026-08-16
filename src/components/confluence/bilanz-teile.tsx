import { Badge, Bar, cx } from "@/components/ui";
import { URTEIL_LABEL } from "@/lib/confluence/faktoren";
import type { Gruppe, Vergleich, VetoBilanz, Aufteilung, Quote, TradeUrteil } from "@/lib/confluence/bilanz";
import { TON } from "./teile";

/**
 * Die Bilanz — hat der Rückenwind bei Kerims eigenen Trades etwas bewirkt?
 *
 * Die Darstellung ist bewusst darauf ausgelegt, ein „kein Nachweis" nicht
 * verschwinden zu lassen. Eine Trefferquote ohne Intervall daneben ist eine
 * Behauptung; mit Intervall ist sie eine Messung.
 */

const pz = (q: number | null, n = 1) => (q === null ? "·" : `${(q * 100).toFixed(n)} %`);

/** Konfidenzintervall als Balken — die Breite IST die Aussage. */
export function Intervall({ q }: { q: Quote }) {
  if (q.quote === null || q.unten === null || q.oben === null) {
    return <div className="h-[16px] rounded-lg bg-sand" />;
  }
  // Skala 0–100 %: bei 20 Trades reicht ein Intervall schnell von 30 auf 80,
  // eine engere Skala würde das abschneiden und harmloser aussehen lassen.
  const links = q.unten * 100;
  const breite = Math.max(1.5, (q.oben - q.unten) * 100);
  const mitte = q.quote * 100;
  const belegt = q.unten > 0.5 || q.oben < 0.5;

  return (
    <div className="relative h-[16px] overflow-hidden rounded-lg bg-sand"
      title={`${pz(q.quote)} · Intervall ${pz(q.unten)} bis ${pz(q.oben)} · n = ${q.n}`}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div className={cx("absolute inset-y-[4px] rounded-full opacity-50",
        belegt ? (q.quote > 0.5 ? "bg-good" : "bg-bad") : "bg-ink-faint")}
        style={{ left: `${links}%`, width: `${breite}%` }} />
      <div className={cx("absolute inset-y-[2px] w-[2px] rounded-full",
        belegt ? (q.quote > 0.5 ? "bg-good-bright" : "bg-bad-bright") : "bg-ink-muted")}
        style={{ left: `${mitte}%` }} />
    </div>
  );
}

export function GruppenTabelle({ gruppen }: { gruppen: Gruppe[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Lage beim Einstieg</th>
            <th className="px-2 py-2 text-right font-normal">Trades</th>
            <th className="px-2 py-2 text-right font-normal">G / V</th>
            <th className="px-2 py-2 text-right font-normal">Quote</th>
            <th className="px-2 py-2 text-left font-normal">95-%-Intervall</th>
            <th className="px-2 py-2 text-right font-normal">Ø R</th>
            <th className="px-2 py-2 text-right font-normal">Summe R</th>
          </tr>
        </thead>
        <tbody>
          {gruppen.map((g) => (
            <tr key={g.lager} className="border-b border-line/50 last:border-b-0">
              <td className="px-2 py-2.5 text-ink">{g.label}</td>
              <td className="num px-2 py-2.5 text-right text-ink-muted">{g.n}</td>
              <td className="num px-2 py-2.5 text-right text-ink-muted">
                {g.gewinne} / {g.verluste}
              </td>
              <td className={cx("num px-2 py-2.5 text-right font-medium",
                g.quote.quote === null ? "text-ink-faint"
                  : g.quote.quote > 0.5 ? "text-good-bright" : "text-bad-bright")}>
                {pz(g.quote.quote)}
              </td>
              <td className="px-2 py-2.5">
                <div className="w-40"><Intervall q={g.quote} /></div>
              </td>
              <td className={cx("num px-2 py-2.5 text-right",
                (g.erwartung ?? 0) > 0 ? "text-good-bright"
                  : (g.erwartung ?? 0) < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {g.erwartung === null ? "·" : `${g.erwartung > 0 ? "+" : ""}${g.erwartung.toFixed(2)}`}
              </td>
              <td className="num px-2 py-2.5 text-right text-ink-muted">
                {g.summeR > 0 ? "+" : ""}{g.summeR.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BefundKarte({ v }: { v: Vergleich }) {
  const ton = v.befund === "traegt" ? "good"
    : v.befund === "verkehrt" ? "bad" : "neutral";

  return (
    <div className={cx("rounded-xl border p-4",
      ton === "good" ? "border-good/30 bg-good-tint"
        : ton === "bad" ? "border-bad/30 bg-bad-tint" : "border-line bg-sand/50")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">Trägt der Filter?</span>
        <Badge tone={ton}>
          {v.befund === "traegt" ? "ja, belegt"
            : v.befund === "verkehrt" ? "verkehrt herum"
              : v.befund === "kein-nachweis" ? "kein Nachweis" : "zu wenig Material"}
        </Badge>
        {v.abstand !== null && (
          <span className="num text-xs text-ink-muted">
            {v.abstand > 0 ? "+" : ""}{v.abstand.toFixed(1)} Punkte
          </span>
        )}
        {v.abstandR !== null && (
          <span className="num text-xs text-ink-muted">
            {v.abstandR > 0 ? "+" : ""}{v.abstandR.toFixed(2)} R je Trade
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {v.satz.replace(/\*\*/g, "")}
      </p>
    </div>
  );
}

export function VetoKarte({ v }: { v: VetoBilanz }) {
  return (
    <div className="rounded-xl bg-sand/50 p-3.5">
      <div className="text-sm font-medium text-ink">Hat das COT-Veto etwas gebracht?</div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{v.satz}</p>
      <div className="mt-2.5 space-y-2">
        {[["gegen ein Veto gehandelt", v.mitVeto], ["ohne Veto", v.ohneVeto]].map(
          ([label, q]) => (
            <div key={label as string} className="flex items-center gap-3">
              <span className="w-48 shrink-0 text-xs text-ink-muted">{label as string}</span>
              <span className="num w-14 shrink-0 text-right text-xs text-ink-soft">
                {pz((q as Quote).quote)}
              </span>
              <span className="flex-1"><Intervall q={q as Quote} /></span>
              <span className="num w-12 shrink-0 text-right text-xs text-ink-faint">
                n={(q as Quote).n}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Wie oft welches Urteil vorkam.
 *
 * Der wichtigste Kontrollwert: Ein Filter, der bei fast allen Trades
 * „Rückenwind" sagt, filtert nichts — er beruhigt nur.
 */
export function VerteilungKarte({ verteilung, gesamt }: {
  verteilung: Aufteilung[]; gesamt: number;
}) {
  const groesster = Math.max(...verteilung.map((a) => a.anteil), 0);
  const einseitig = groesster > 0.7;

  return (
    <div className="rounded-xl bg-sand/50 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">Wie oft welches Urteil</span>
        {einseitig && <Badge tone="warn">filtert kaum</Badge>}
      </div>
      <div className="mt-2.5 space-y-1.5">
        {verteilung.map((a) => (
          <div key={a.urteil} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-ink-muted">{URTEIL_LABEL[a.urteil]}</span>
            <span className="flex-1">
              <Bar pct={a.anteil * 100}
                color={TON[a.urteil] === "good" ? "var(--good, #6BBF8A)"
                  : TON[a.urteil] === "bad" ? "var(--bad, #D97070)"
                    : "var(--accent, #E7A96B)"} />
            </span>
            <span className="num w-20 shrink-0 text-right text-xs text-ink-faint">
              {a.n} · {(a.anteil * 100).toFixed(0)} %
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
        {einseitig
          ? `Ein Urteil deckt ${(groesster * 100).toFixed(0)} % aller ${gesamt} Trades ab. `
            + "Ein Filter, der fast immer dasselbe sagt, trennt nichts — dann sind "
            + "entweder die Schwellen zu weich oder die Faktoren zu ähnlich."
          : `Verteilt über ${gesamt} Trades. Kein Urteil dominiert — der Filter trennt `
            + "die Trades tatsächlich in Gruppen."}
      </p>
    </div>
  );
}

export function TradeListe({ trades }: { trades: TradeUrteil[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Datum</th>
            <th className="px-2 py-2 text-left font-normal">Paar</th>
            <th className="px-2 py-2 text-left font-normal">Richtung</th>
            <th className="px-2 py-2 text-center font-normal">dafür / dagegen</th>
            <th className="px-2 py-2 text-left font-normal">Lage</th>
            <th className="px-2 py-2 text-right font-normal">R</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-line/50 last:border-b-0 hover:bg-sand/40">
              <td className="num px-2 py-2 text-ink-muted">
                <a className="hover:text-accent-soft hover:underline"
                  href={`/trading/confluence?ansicht=rueckblick&paar=${t.paar}&datum=${t.datum}&richtung=${t.richtung > 0 ? "long" : "short"}`}>
                  {t.datum}
                </a>
              </td>
              <td className="px-2 py-2 text-ink">{t.paar}</td>
              <td className="px-2 py-2">
                <Badge tone={t.richtung > 0 ? "good" : "bad"}>
                  {t.richtung > 0 ? "LONG" : "SHORT"}
                </Badge>
              </td>
              <td className="num px-2 py-2 text-center text-ink-muted">
                {t.dafuer} / {t.dagegen}
              </td>
              <td className="px-2 py-2">
                <span className="flex flex-wrap items-center gap-1">
                  <Badge tone={TON[t.urteil]}>{URTEIL_LABEL[t.urteil]}</Badge>
                  {t.vetoAktiv && <Badge tone="bad">Veto</Badge>}
                </span>
              </td>
              <td className={cx("num px-2 py-2 text-right",
                t.r > 0 ? "text-good-bright" : t.r < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {t.r > 0 ? "+" : ""}{t.r.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
