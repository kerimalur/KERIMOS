import { cx } from "@/components/ui";
import type { EbenenBild, RangZeile, Teil } from "@/lib/makro/bewertung";

/** −1 … +1 als Balken um die Mitte. Rechts gut, links schlecht. */
export function ScoreBalken({ score, breit = 120 }: { score: number | null; breit?: number }) {
  if (score === null) {
    return <span className="text-xs text-ink-faint">keine Daten</span>;
  }
  const anteil = Math.min(1, Math.abs(score));
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative block h-[7px] rounded-full bg-sand" style={{ width: breit }}>
        <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
        <span
          className={cx("absolute inset-y-0 rounded-full",
            score >= 0 ? "bg-good" : "bg-bad")}
          style={score >= 0
            ? { left: "50%", width: `${(anteil * breit) / 2}px` }
            : { right: "50%", width: `${(anteil * breit) / 2}px` }}
        />
      </span>
      <span className={cx("tabular text-xs font-medium",
        score > 0.05 ? "text-good-bright" : score < -0.05 ? "text-bad-bright" : "text-ink-muted")}>
        {score > 0 ? "+" : ""}{score.toFixed(2)}
      </span>
    </span>
  );
}

/** Ein Wort für den Zahlenwert — damit man nicht rechnen muss. */
export function urteilWort(score: number | null): string {
  if (score === null) return "keine Daten";
  if (score >= 0.5) return "stark";
  if (score >= 0.15) return "eher stark";
  if (score > -0.15) return "neutral";
  if (score > -0.5) return "eher schwach";
  return "schwach";
}

export function TeilZeile({ t }: { t: Teil }) {
  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 border-t border-line/70 py-2 first:border-t-0">
      <span className="text-sm text-ink-soft">{t.label}</span>
      <span className="tabular text-sm text-ink">
        {t.wert === null ? "—" : `${t.wert.toFixed(2)} ${t.einheit}`.trim()}
        {t.delta !== null && t.delta !== undefined && (
          <span className={cx("ml-2 text-[11px]",
            t.delta > 0 ? "text-good-bright" : t.delta < 0 ? "text-bad-bright" : "text-ink-faint")}>
            {t.delta > 0 ? "▲" : t.delta < 0 ? "▼" : "▪"} {Math.abs(t.delta).toFixed(2)}
          </span>
        )}
      </span>
      <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <ScoreBalken score={t.score} breit={90} />
        <span className="text-[11px] text-ink-muted">{t.text}</span>
      </span>
    </li>
  );
}

export function EbenenKarte({ e }: { e: EbenenBild }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-card/60 p-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">
          Ebene {e.ebene} · {e.label}
        </span>
        <span className="ml-auto text-[11px] text-ink-faint">{e.belegt}/{e.moeglich} belegt</span>
      </div>
      <div className="mb-2"><ScoreBalken score={e.score} /></div>
      <ul className="list-none p-0">
        {e.teile.map((t) => <TeilZeile key={t.key} t={t} />)}
      </ul>
    </div>
  );
}

/** Die Rangliste als Tabelle — je Ebene eine Spalte, damit man sieht, woher das Urteil kommt. */
export function RangTabelle({ zeilen, mlQuintil }: {
  zeilen: RangZeile[];
  mlQuintil: Record<string, number | undefined>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
            <th className="pb-2 pr-3 text-left font-medium">#</th>
            <th className="pb-2 pr-3 text-left font-medium">Währung</th>
            <th className="pb-2 pr-3 text-left font-medium">Gesamt</th>
            <th className="pb-2 pr-3 text-right font-medium">Wirtschaft</th>
            <th className="pb-2 pr-3 text-right font-medium">Zentralbank</th>
            <th className="pb-2 pr-3 text-right font-medium">Sentiment</th>
            <th className="pb-2 pr-3 text-right font-medium">Daten</th>
            <th className="pb-2 text-right font-medium">ML</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.ccy} className="border-t border-line/70">
              <td className="py-2 pr-3 text-xs text-ink-faint">{z.rang}</td>
              <td className="py-2 pr-3 font-display font-bold text-ink">{z.ccy}</td>
              <td className="py-2 pr-3">
                <span className="flex flex-wrap items-center gap-2">
                  <ScoreBalken score={z.gesamt} />
                  <span className="text-[11px] text-ink-muted">{urteilWort(z.gesamt)}</span>
                </span>
              </td>
              {z.ebenen.map((e) => (
                <td key={e.ebene} className={cx("tabular py-2 pr-3 text-right text-xs",
                  e.score === null ? "text-ink-faint"
                    : e.score > 0.05 ? "text-good-bright"
                      : e.score < -0.05 ? "text-bad-bright" : "text-ink-muted")}>
                  {e.score === null ? "—" : `${e.score > 0 ? "+" : ""}${e.score.toFixed(2)}`}
                </td>
              ))}
              <td className="tabular py-2 pr-3 text-right text-xs text-ink-faint">
                {Math.round(z.abdeckung * 100)} %
              </td>
              <td className="tabular py-2 text-right text-xs text-ink-muted">
                {mlQuintil[z.ccy] ? `Q${mlQuintil[z.ccy]}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
