import { Badge, cx } from "@/components/ui";
import { COT_GRENZE } from "@/lib/confluence/cot-divergenz";
import { MIN_SIGNALE } from "@/lib/confluence/vorwaerts";
import { SCHWELLEN, type Gesamtbild, type Kalibrierung } from "@/lib/confluence/kalibrierung";

/**
 * Die Schwellen-Tabelle.
 *
 * Sie beantwortet eine einzige Frage: was hätte eine andere COT-Grenze
 * gebracht? Für jede Schwelle steht da, wie viele Signale sie erzeugt hätte
 * und um wie viele Prozentpunkte der Markt danach besser lief als in einer
 * beliebigen Woche.
 *
 * Der ABSTAND ist die Zahl, auf die es ankommt — nicht die Rendite. Eine
 * Signalrendite von 1.5 % klingt gut und ist nichts wert, wenn der Markt in
 * einer beliebigen Woche 1.4 % machte.
 *
 * Hervorgehoben wird nur, was belegt ist: unter MIN_SIGNALE Signalen bleibt
 * die Zeile blass, egal wie gut die Zahl aussieht.
 */
export function SchwellenTabelle({ bild }: { bild: Kalibrierung }) {
  const horizonte = bild.reihen[0]?.zeilen.map((z) => z.wochen) ?? [];

  const zelle = (abstand: number | null, n: number) => {
    if (abstand === null || n < MIN_SIGNALE) {
      return <span className="text-ink-faint">·</span>;
    }
    // Unter 0.2 Punkten ist es Rauschen — das soll man nicht als Farbe lesen.
    const stark = Math.abs(abstand) >= 0.2;
    return (
      <span className={cx(
        "tabular",
        !stark ? "text-ink-faint"
          : abstand > 0 ? "font-medium text-good-bright" : "text-bad-bright",
      )}>
        {abstand > 0 ? "+" : ""}{abstand.toFixed(2)}
      </span>
    );
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="px-2 py-2 text-left font-normal">Schwelle</th>
              <th className="px-2 py-2 text-right font-normal"
                title="Übergänge in einen Divergenz-Zustand über die ganze Historie">
                Signale
              </th>
              {horizonte.map((h) => (
                <th key={h} className="px-2 py-2 text-right font-normal"
                  title={`Abstand zur Basis nach ${h} Wochen, in Prozentpunkten`}>
                  {h} W
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bild.reihen.map((r) => {
              const aktuell = r.oben === COT_GRENZE.oben;
              return (
                <tr key={r.oben}
                  className={cx("border-b border-line/50 last:border-b-0",
                    aktuell ? "bg-sand/60" : "hover:bg-sand/40")}>
                  <td className="px-2 py-2 font-medium text-ink">
                    {r.oben}/{r.unten}
                    {aktuell && <span className="ml-2"><Badge tone="neutral">aktuell</Badge></span>}
                  </td>
                  <td className={cx("px-2 py-2 text-right tabular",
                    r.signale < MIN_SIGNALE ? "text-ink-faint" : "text-ink-muted")}>
                    {r.signale}
                  </td>
                  {r.zeilen.map((z) => (
                    <td key={z.wochen} className="px-2 py-2 text-right">
                      {zelle(z.abstand, z.signal.n)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink">{bild.fazit}</p>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        Gezählt werden <strong>Übergänge</strong>, nicht Wochen: hält eine
        Streckung acht Wochen an, ist das ein Ereignis und nicht acht. Der Wert
        je Horizont ist der Abstand zur Basis in Prozentpunkten — was der Markt
        nach dem Signal tat, minus was er in einer beliebigen Woche tat. Unter{" "}
        {MIN_SIGNALE} Signalen bleibt das Feld leer. <strong>Kein Stop, kein
        Ziel:</strong> gemessen wird die Drift, nicht dein Setup. Ein Faktor kann
        Drift haben und trotzdem jeden Stop abräumen, bevor sie eintritt.
      </p>
    </div>
  );
}

export function SchwellenTabelleLaedt({ paar }: { paar: string }) {
  return (
    <p className="py-6 text-sm text-ink-faint">
      {paar}: zwanzig Jahre COT-Historie werden gerechnet …
    </p>
  );
}


/**
 * Alle sieben Paare auf einen Blick.
 *
 * Diese Tabelle ist der eigentliche Entscheidungsgrund. Ein einzelnes Paar
 * findet bei fünf Schwellen mal vier Horizonten immer irgendwo eine gute
 * Zahl — erst nebeneinander sieht man, ob eine Schwelle trägt oder ob sich
 * die Paare widersprechen.
 *
 * Gezeigt wird je Feld der MITTELWERT über die vier Horizonte. Das versteckt
 * Ausreisser bewusst: eine Schwelle, die nur bei 26 Wochen glänzt und sonst
 * verliert, soll hier nicht gut aussehen.
 */
export function PaarUebersicht({ bild }: { bild: Gesamtbild }) {
  const zelle = (w: number | null) => {
    if (w === null) return <span className="text-ink-faint">·</span>;
    const stark = Math.abs(w) >= 0.2;
    return (
      <span className={cx("tabular",
        !stark ? "text-ink-faint"
          : w > 0 ? "font-medium text-good-bright" : "text-bad-bright")}>
        {w > 0 ? "+" : ""}{w.toFixed(2)}
      </span>
    );
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="px-2 py-2 text-left font-normal">Paar</th>
              {SCHWELLEN.map((o) => (
                <th key={o} className="px-2 py-2 text-right font-normal">
                  {o}/{100 - o}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-normal">beste</th>
            </tr>
          </thead>
          <tbody>
            {bild.zeilen.map((z) => (
              <tr key={z.paar} className="border-b border-line/50 last:border-b-0 hover:bg-sand/40">
                <td className="px-2 py-2 font-medium text-ink">{z.paar}</td>
                {z.jeSchwelle.map((w, i) => (
                  <td key={i} className="px-2 py-2 text-right">{zelle(w)}</td>
                ))}
                <td className="px-2 py-2 text-right text-xs">
                  {z.beste === null
                    ? <span className="text-ink-faint">keine</span>
                    : <span className="text-ink-muted">{z.beste}/{100 - z.beste}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink">{bild.fazit}</p>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        Je Feld der Mittelwert über die vier Horizonte, in Prozentpunkten
        gegenüber der Basis. Das versteckt Ausreisser mit Absicht: eine
        Schwelle, die nur bei 26 Wochen glänzt und sonst verliert, soll hier
        nicht gut aussehen. „beste" bleibt leer, wenn keine Schwelle über der
        Basis liegt.
      </p>
    </div>
  );
}

export function PaarUebersichtLaedt() {
  return (
    <p className="py-6 text-sm text-ink-faint">
      Sieben Paare über zwanzig Jahre — das dauert einen Moment …
    </p>
  );
}
