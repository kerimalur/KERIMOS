import { Badge, cx } from "@/components/ui";
import { Intervall } from "@/components/confluence/bilanz-teile";
import { MONATS_KURZ, MIN_JAHRE, type SaisonBild } from "@/lib/confluence/saison";
import { HAEUFIG_AB, type CotStatistik } from "@/lib/confluence/monty-cot";
import {
  SYNTH, BIAS_WORT, type BiasStufe, type SynthBild,
} from "@/lib/confluence/cot-synth";

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

/* --------------------------------------- COT je Paar, synthetisch */

/**
 * Alle 28 Paare, gerechnet wie Kerims Pine-Indikator.
 *
 * Gezeichnet wird der **Bias** — die Zahl, nach der er handelt. Sie fasst
 * zwei Dinge zusammen: das Niveau (wie weit stehen Commercials und Retail
 * auseinander) und den Impuls (wohin hat sich das in zwei Wochen bewegt).
 * Beides je auf −1…+1 geklemmt, Summe also −2…+2.
 *
 * Dass der Impuls dabei ist, ist kein Beiwerk: bei seinem EURCHF vom 26.08.
 * kamen zwei Drittel des „STARK LONG" daher. Wer nur die Streckung anschaut,
 * sieht dort gar kein Signal — und genau das zeigte KerimOS vorher.
 *
 * **Zur Kodierung.** Die Länge trägt die Stärke, die Richtung das Vorzeichen.
 * Die Farbe sagt dasselbe noch einmal und ist Zugabe, nicht Träger — daneben
 * stehen die vorzeichenbehaftete Zahl und das Wort. Die zwei Kerben markieren
 * seine Schwellen 0,4 (neutral endet) und 1,0 (stark beginnt); der Punkt am
 * Balkenende erscheint, wenn zusätzlich die 90/10-Streckung greift.
 */
const LANG = "#5FC2A6";
const KURZ = "#E28B72";

/** Bias −2…+2 auf die halbe Breite abbilden. */
const anteil = (v: number) => Math.min(50, Math.abs(v) / 2 * 50);

export function SynthPaarGrafik({ bilder }: { bilder: SynthBild[] }) {
  const fertig = bilder.filter((b) => b.bias !== null);
  const fehlend = bilder.length - fertig.length;

  if (fertig.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Für kein Paar liegen {SYNTH.wochen} Wochenberichte vor. Solange das
        Fenster nicht voll ist, gibt es keinen Rang — ein Rang aus dreissig
        Wochen sähe genauso aus wie einer aus drei Jahren und wäre etwas
        anderes.
      </p>
    );
  }

  const zahl = (v: number | null, n = 1) => (v === null ? "·" : v.toFixed(n));

  return (
    <>
      <ul className="space-y-0.5">
        {fertig.map((b) => {
          const bias = b.bias as number;
          const links = bias < 0;
          const farbe = Math.abs(bias) < SYNTH.neutral
            ? "#7A6E5C" : links ? KURZ : LANG;
          const breite = anteil(bias);

          return (
            <li key={b.paar}
              title={`${b.paar} — Commercials ${zahl(b.kommRang, 2)}, `
                + `Retail ${zahl(b.retailRang, 2)}, Impuls ${zahl(b.impulsRang, 2)}. `
                + `Score ${zahl(b.score, 2)}, Bias ${zahl(bias, 2)}.`}
              className="grid grid-cols-[64px_minmax(0,1fr)_50px] items-center gap-2
                         rounded-lg px-1.5 py-1 hover:bg-sand/40
                         sm:grid-cols-[64px_146px_minmax(0,1fr)_50px_86px]">
              <span className="truncate text-xs font-medium text-ink">
                {b.paar}
                {b.extrem !== 0 && (
                  <span className="ml-1 text-accent-soft" title="90/10-Streckung">◆</span>
                )}
              </span>

              <span className="num hidden text-[11px] text-ink-faint sm:block">
                C {zahl(b.kommRang)} · R {zahl(b.retailRang)} · I {zahl(b.impulsRang)}
              </span>

              <span className="relative block h-3 rounded bg-sand">
                {/* Die Schwellen als Kerben. Ohne sie ist „1,03" eine Zahl
                    ohne Massstab — mit ihnen sieht man, dass sie knapp über
                    „stark" liegt. */}
                {[SYNTH.neutral, SYNTH.stark].flatMap((t) => [-t, t]).map((t) => (
                  <span key={t} aria-hidden
                    className="absolute inset-y-0.5 w-px bg-line-strong"
                    style={{ left: `${50 + (t / 2) * 50}%` }} />
                ))}
                <span aria-hidden
                  className="absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-ink-faint/70" />
                <span className="absolute inset-y-0.5 rounded-sm"
                  style={{
                    background: farbe,
                    width: `${breite}%`,
                    left: links ? `${50 - breite}%` : "50%",
                    minWidth: Math.abs(bias) > 0.02 ? 2 : 0,
                  }} />
                {b.extrem !== 0 && (
                  <span aria-hidden
                    className="absolute top-1/2 z-20 h-2 w-2 -translate-y-1/2 rounded-full ring-2 ring-card"
                    style={{
                      background: farbe,
                      left: links ? `${50 - breite}%` : `${50 + breite}%`,
                      marginLeft: -4,
                    }} />
                )}
              </span>

              <span className="num text-right text-xs" style={{ color: farbe }}>
                {bias > 0 ? "+" : ""}{bias.toFixed(2)}
              </span>

              <span className="hidden text-right text-[11px] sm:block"
                style={{ color: b.stufe === "neutral" ? undefined : farbe }}>
                {b.stufe === "neutral"
                  ? <span className="text-ink-faint">neutral</span>
                  : BIAS_WORT[b.stufe as BiasStufe]}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: KURZ }} />short
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: LANG }} />long
        </span>
        <span>Kerben bei {SYNTH.neutral} und {SYNTH.stark}</span>
        <span className="text-accent-soft">◆ = {SYNTH.oben}/{SYNTH.unten}-Streckung</span>
        {fehlend > 0 && (
          <span className="text-warn">
            {fehlend} {fehlend === 1 ? "Paar hat" : "Paare haben"} noch keine{" "}
            {SYNTH.wochen} Wochen
          </span>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        <strong>C</strong> und <strong>R</strong> sind die Perzentilränge von
        Commercials und Retail auf der <em>synthetischen</em> Reihe: erst
        Basis minus Quote (netto je Open Interest), dann der Rang.
        <strong> I</strong> ist der Rang der Zwei-Wochen-Änderung dazwischen.
        Der <strong>Bias</strong> verrechnet Niveau und Impuls je auf −1…+1
        geklemmt — dieselbe Rechnung wie im TradingView-Panel, dieselben
        Zahlen.
      </p>
      <p className="mt-2 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
        <strong>Warum synthetisch und nicht Ränge vergleichen:</strong> der Rang
        wirft die Abstände weg und behält nur die Ordnung. Zwei Währungen, die
        je im Mittelfeld liegen, können als <em>Differenz</em> an einem
        historischen Extrem stehen. Bis zum 26.08.2026 rechnete KerimOS
        Rang-minus-Rang und konnte genau das nie sehen.
      </p>
    </>
  );
}
