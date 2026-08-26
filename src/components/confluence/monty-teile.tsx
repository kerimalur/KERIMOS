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

/* ------------------------------------------------- COT je Paar */

/**
 * Dieselbe Lage, nur auf Paarebene.
 *
 * Zwei Spalten mit einem Urteil, und das ist Absicht: **beide Beine** rechnet
 * der Screener (Basis minus Quote), **nur Basis** rechnet Kerims
 * Pine-Indikator — und so zeigt es TradingView, weil es kein
 * „EURUSD"-Terminkontrakt gibt, sondern nur den auf den Euro.
 *
 * Strittige Zeilen stehen oben und sind markiert. Sie sind kein Fehler,
 * sondern der Grund für diese Tabelle: stehen beide Währungen gleich
 * gestreckt, hebt sich die Differenz auf und der Screener sagt nichts,
 * während der Indikator ein Signal zeigt. Wer das nicht weiss, hält eines
 * von beiden für kaputt.
 */
export function CotPaarTabelle({ zeilen }: {
  zeilen: {
    paar: string;
    urteil: { dir: -1 | 0 | 1; staerke: number; text: string;
      basis: { ccy: string; kommRang: number | null; retailRang: number | null; divergenz: -1 | 0 | 1 };
      quote: { ccy: string; kommRang: number | null; retailRang: number | null; divergenz: -1 | 0 | 1 } };
    nurBasis: -1 | 0 | 1;
    widerspruch: boolean;
  }[];
}) {
  const rang = (v: number | null) => (v === null ? "·" : v.toFixed(0));
  const seite = (d: -1 | 0 | 1) =>
    d === 0 ? <span className="text-ink-faint">–</span>
      : <Badge tone={d > 0 ? "good" : "bad"}>{d > 0 ? "long" : "short"}</Badge>;

  const mitAussage = zeilen.filter((z) => z.urteil.dir !== 0 || z.nurBasis !== 0);
  const strittig = zeilen.filter((z) => z.widerspruch).length;

  if (mitAussage.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Kein einziges der 28 Paare hat gerade eine Aussage — weder über beide
        Beine noch über die Basiswährung allein. Das ist ein normaler Zustand
        und keine Datenlücke: die Streckung ist selten, sonst wäre sie keine.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="px-2 py-2 text-left font-normal">Paar</th>
              <th className="px-2 py-2 text-right font-normal"
                title="Commercials / Retail der Basiswährung">Basis C/R</th>
              <th className="px-2 py-2 text-right font-normal"
                title="Commercials / Retail der Quotewährung">Quote C/R</th>
              <th className="px-2 py-2 text-center font-normal"
                title="Basis minus Quote — so rechnet der Screener">beide Beine</th>
              <th className="px-2 py-2 text-center font-normal"
                title="Nur die Basiswährung — so rechnet dein Pine und so zeigt es TradingView">
                nur Basis
              </th>
            </tr>
          </thead>
          <tbody>
            {mitAussage.map((z) => (
              <tr key={z.paar}
                className={cx("border-b border-line/50 last:border-b-0 hover:bg-sand/40",
                  z.widerspruch && "bg-warn-tint/40")}>
                <td className="px-2 py-2 font-medium text-ink">
                  {z.paar}
                  {z.widerspruch && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-warn">
                      strittig
                    </span>
                  )}
                </td>
                <td className={cx("num px-2 py-2 text-right",
                  z.urteil.basis.divergenz !== 0 ? "text-ink" : "text-ink-soft")}>
                  {rang(z.urteil.basis.kommRang)} / {rang(z.urteil.basis.retailRang)}
                </td>
                <td className={cx("num px-2 py-2 text-right",
                  z.urteil.quote.divergenz !== 0 ? "text-ink" : "text-ink-soft")}>
                  {rang(z.urteil.quote.kommRang)} / {rang(z.urteil.quote.retailRang)}
                </td>
                <td className="px-2 py-2 text-center" title={z.urteil.text}>
                  {seite(z.urteil.dir)}
                  {z.urteil.dir !== 0 && z.urteil.staerke < 1 && (
                    <span className="ml-1 text-[10px] text-ink-faint">halb</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">{seite(z.nurBasis)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        {mitAussage.length} von {zeilen.length} Paaren haben überhaupt eine
        Aussage
        {strittig > 0 && (
          <>
            , davon <strong className="text-warn">{strittig} strittig</strong>
          </>
        )}
        . Paare ohne jede Aussage stehen gar nicht erst da.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        <strong>strittig</strong> heisst: die zwei Spalten sagen nicht
        dasselbe. Drei Arten, wie das passiert —
        {" "}<em>gegenläufig</em> (beide sprechen, in verschiedene Richtungen),
        {" "}<em>ausgelöscht</em> (beide Währungen gleich gestreckt, die
        Differenz ist null, nur die Basis spricht) und
        {" "}<em>nur Quote</em> (das Signal kommt allein vom Gegenbein, die
        Basis schweigt — dann zeigt TradingView nichts).
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        <strong>halb</strong> heisst: nur eine der beiden Währungen ist
        gestreckt. Volle Stärke gibt es nur, wenn beide Seiten am Rand stehen
        und in dieselbe Richtung zeigen.
      </p>
      <p className="mt-2 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
        <strong>Für den Vergleich mit TradingView:</strong> nimm die Spalte
        „nur Basis". TradingView zeigt den Terminkontrakt der Währung, nicht
        des Paares — einen EURUSD-Kontrakt gibt es nicht. Bei
        USD-Quote-Paaren ist das die linke Währung, bei USD-Basis-Paaren
        (USDJPY, USDCAD, USDCHF) der <strong>Dollar-Index</strong>, CFTC
        098662. Weichen die Perzentile trotzdem ab, liegt es fast immer an
        einer der drei Stellen: anderes Fenster als drei Jahre, netto statt
        Anteil am Open Interest, oder ein Bericht Versatz.
      </p>
    </>
  );
}
