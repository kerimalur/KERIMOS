import { Badge, cx } from "@/components/ui";
import { COT_GRENZE } from "@/lib/confluence/cot-divergenz";
import { MIN_SIGNALE } from "@/lib/confluence/vorwaerts";
import type { Kalibrierung } from "@/lib/confluence/kalibrierung";

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
