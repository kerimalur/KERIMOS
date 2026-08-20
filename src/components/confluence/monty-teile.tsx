import { Badge, cx } from "@/components/ui";
import { Intervall } from "@/components/confluence/bilanz-teile";
import { MONATS_KURZ, MIN_JAHRE, type SaisonBild } from "@/lib/confluence/saison";
import { HAEUFIG_AB, type CotStatistik } from "@/lib/confluence/monty-cot";

/**
 * Anzeigebausteine für Monty.
 *
 * Beide Tabellen folgen derselben Regel: eine Zahl wird nur dann hervorgehoben,
 * wenn sie belegt ist. Alles andere bleibt blass. Eine Saison-Matrix, in der
 * 336 Felder um Aufmerksamkeit buhlen, ist eine Tapete — hervorgehoben sind
 * hier typischerweise ein paar Dutzend.
 */

/* ------------------------------------------------------------- COT */

export function CotStatistikTabelle({ zeilen }: { zeilen: CotStatistik[] }) {
  const rang = (v: number | null) => (v === null ? "·" : v.toFixed(0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Währung</th>
            <th className="px-2 py-2 text-right font-normal"
              title="Perzentilrang der Commercials über drei Jahre">Commercials</th>
            <th className="px-2 py-2 text-right font-normal"
              title="Perzentilrang der Nicht-Meldepflichtigen (Retail-Proxy)">Retail</th>
            <th className="px-2 py-2 text-center font-normal">jetzt</th>
            <th className="px-2 py-2 text-right font-normal">gestreckt</th>
            <th className="px-2 py-2 text-right font-normal">dafür / dagegen</th>
            <th className="px-2 py-2 text-right font-normal"
              title="Längste ununterbrochene Streckung">längste</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.ccy} className="border-b border-line/50 last:border-b-0 hover:bg-sand/40">
              <td className="px-2 py-2 font-medium text-ink">{z.ccy}</td>
              <td className={cx("num px-2 py-2 text-right",
                z.jetzt.divergenz !== 0 ? "text-ink" : "text-ink-soft")}>
                {rang(z.jetzt.kommRang)}
              </td>
              <td className={cx("num px-2 py-2 text-right",
                z.jetzt.divergenz !== 0 ? "text-ink" : "text-ink-soft")}>
                {rang(z.jetzt.retailRang)}
              </td>
              <td className="px-2 py-2 text-center">
                {z.jetzt.divergenz === 0
                  ? <span className="text-ink-faint">–</span>
                  : (
                    <Badge tone={z.jetzt.divergenz > 0 ? "good" : "bad"}>
                      {z.jetzt.divergenz > 0 ? "gestützt" : "belastet"}
                    </Badge>
                  )}
              </td>
              <td className={cx("num px-2 py-2 text-right",
                (z.anteil ?? 0) > HAEUFIG_AB ? "text-warn" : "text-ink-soft")}
                title={z.satz}>
                {z.anteil === null ? "·" : `${(z.anteil * 100).toFixed(0)} %`}
                <span className="ml-1 text-[11px] text-ink-faint">
                  {z.gestreckt}/{z.termine}
                </span>
              </td>
              <td className="num px-2 py-2 text-right text-ink-soft">
                <span className="text-good-bright">{z.dafuer}</span>
                <span className="text-ink-faint"> / </span>
                <span className="text-bad-bright">{z.dagegen}</span>
              </td>
              <td className="num px-2 py-2 text-right text-ink-muted">{z.laengste}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------- Saison-Matrix */

/** Kopfzeile der Matrix — steht einmal über allen Paar-Zeilen. */
export function SaisonKopf() {
  return (
    <thead className="sticky top-0 bg-card">
      <tr className="border-b border-line text-xs text-ink-muted">
        <th className="px-2 py-2 text-left font-normal">Paar</th>
        {MONATS_KURZ.map((m) => (
          <th key={m} className="px-1 py-2 text-center font-normal">{m}</th>
        ))}
        <th className="px-2 py-2 text-right font-normal"
          title="Wie viele der zwölf Monate statistisch belegt sind">belegt</th>
        <th className="px-2 py-2 text-right font-normal">Jahre</th>
      </tr>
    </thead>
  );
}

/** Platzhalter, solange die Kurse eines Paares laden. */
export function SaisonZeileLaedt({ paar }: { paar: string }) {
  return (
    <tr className="border-b border-line/50">
      <td className="px-2 py-2 text-ink-faint">{paar.slice(0, 3)}/{paar.slice(3)}</td>
      <td colSpan={14} className="px-2 py-2 text-[11px] text-ink-faint">lädt …</td>
    </tr>
  );
}

export function SaisonZeile({ bild }: { bild: SaisonBild }) {
  return (
    <tr className="border-b border-line/50 last:border-b-0 hover:bg-sand/40">
      <td className="px-2 py-2 text-ink">
        {bild.paar.slice(0, 3)}/{bild.paar.slice(3)}
      </td>
      {bild.monate.map((m) => {
        const wert = m.median ?? m.schnitt;
        return (
          <td key={m.monat} className="px-0.5 py-1 text-center"
            title={m.quote.n < MIN_JAHRE
              ? `${MONATS_KURZ[m.monat - 1]}: nur ${m.quote.n} bewegte Jahre — zu wenig`
              : `${MONATS_KURZ[m.monat - 1]}: ${m.quote.treffer} von ${m.quote.n} Jahren positiv`
                + `, Median ${m.median?.toFixed(2) ?? "·"} %`
                + `, Schnitt ${m.schnitt?.toFixed(2) ?? "·"} %`
                + `, Spanne ${m.schlechtestes?.toFixed(1) ?? "·"} bis ${m.bestes?.toFixed(1) ?? "·"} %`
                + (m.flach > 0 ? `, ${m.flach} flach` : "")
                + (m.belegt ? " — belegt" : " — nicht belegt")}>
            <span className={cx(
              "num inline-block w-11 rounded px-0.5 py-1 text-[11px]",
              m.belegt
                ? (m.richtung > 0 ? "bg-good-tint text-good-bright" : "bg-bad-tint text-bad-bright")
                : "text-ink-faint",
            )}>
              {wert === null ? "·" : `${wert > 0 ? "+" : ""}${wert.toFixed(1)}`}
            </span>
          </td>
        );
      })}
      <td className={cx("num px-2 py-2 text-right",
        bild.belegte > 0 ? "text-ink" : "text-ink-faint")}>
        {bild.belegte}
      </td>
      <td className="num px-2 py-2 text-right text-ink-muted">{bild.jahreVorhanden}</td>
    </tr>
  );
}
