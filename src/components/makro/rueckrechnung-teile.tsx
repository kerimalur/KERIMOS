import { Card, CardTitle, cx } from "@/components/ui";
import { Info } from "@/components/makro/info";
import { zufallsBand } from "@/lib/makro/rueckrechnung-rechnen";
import type { ladeRueckrechnung } from "@/lib/makro/rueckrechnung";

/**
 * Bausteine der Rückrechnung (Backtest des Makro-Modells), herausgelöst aus
 * der Wochenaussicht (02.10.2026), damit sie auch eine eigene Seite hat:
 * /trading/fundamentals/rueckrechnung.
 */

export function Prozent({ p, pips }: { p: number | null; pips: number | null }) {
  if (p === null) return <span className="text-ink-faint">—</span>;
  return (
    <span className={cx("tabular font-mono", p > 0 ? "text-good-bright" : p < 0 ? "text-bad-bright" : "text-ink-soft")}
      title={pips === null ? undefined : `${pips > 0 ? "+" : ""}${pips} Pips`}>
      {p > 0 ? "+" : ""}{p.toFixed(2)} %
    </span>
  );
}

export interface Gruppe { label: string; n: number; treffer: number | null; schnitt: number | null }

export function gruppe(label: string, ideen: { prozent_2w: number | null }[]): Gruppe {
  const mit = ideen.filter((i) => i.prozent_2w !== null);
  const treffer = mit.filter((i) => i.prozent_2w! > 0).length;
  return {
    label, n: mit.length,
    treffer: mit.length ? Math.round((treffer / mit.length) * 100) : null,
    schnitt: mit.length ? mit.reduce((s, i) => s + i.prozent_2w!, 0) / mit.length : null,
  };
}

export function GruppenKarten({ gruppen, band = false }: { gruppen: Gruppe[]; band?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {gruppen.map((g) => {
        const zb = band ? zufallsBand(g.n) : null;
        const ueber = zb !== null && g.treffer !== null && g.treffer > 50 + zb;
        const unter = zb !== null && g.treffer !== null && g.treffer < 50 - zb;
        return (
        <div key={g.label} className={cx("rounded-xl px-3 py-2.5",
          ueber ? "bg-good-tint" : unter ? "bg-bad-tint" : "bg-sand/60")}>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">{g.label}</p>
          <p className="tabular mt-1 font-mono text-lg text-ink">
            {g.treffer === null ? "—" : `${g.treffer} %`}
            <span className="ml-2 text-xs text-ink-muted">aufgegangen</span>
          </p>
          <p className="text-[11px] text-ink-muted">
            {g.n} gemessen · Schnitt {g.schnitt === null ? "—" : `${g.schnitt > 0 ? "+" : ""}${g.schnitt.toFixed(2)} %`}
          </p>
          {zb !== null && (
            <p className="text-[10px] text-ink-faint">
              Zufall: 50 % ± {zb} — {ueber ? "klar besser als Zufall" : unter ? "klar schlechter als Zufall" : "nicht vom Zufall zu unterscheiden"}
            </p>
          )}
        </div>
        );
      })}
    </div>
  );
}

/**
 * Die Rückrechnung ab März 2024: was die Ideen damals gebracht hätten.
 * Getrennt nach Klasse, nach Herkunft der Erwartung (MetaQuotes-Prognose
 * bis Juni 2026, danach Forex-Factory-Konsens), nach Jahr und nach Paar —
 * jeweils mit dem Band, in dem Zufall läge.
 */
export function RueckrechnungKarte({ rueck }: { rueck: Awaited<ReturnType<typeof ladeRueckrechnung>> }) {
  const gemessen = rueck.filter((r) => r.prozent_2w !== null);
  const jahre = [...new Set(rueck.map((r) => r.woche.slice(0, 4)))];
  const paare = [...new Set(rueck.map((r) => r.paar))]
    .map((p) => gruppe(p, rueck.filter((r) => r.paar === p)))
    .filter((g) => g.n > 0)
    .sort((a, b) => (b.schnitt ?? 0) - (a.schnitt ?? 0));
  const stand = rueck[0]?.gerechnet_am
    ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" }).format(new Date(rueck[0].gerechnet_am))
    : null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CardTitle className="mb-0">Rückrechnung ab März 2024</CardTitle>
        <Info titel="Wie zurückgerechnet wird" breit={340}>
          Für jeden Montag genau das Urteil, das das Terminal an diesem Tag gezeigt
          hätte — dasselbe Modell wie live (seit 03.10.2026 nur Wirtschaft; davor Zentralbank 40 %, Wirtschaft 35 %, Überraschung 25 %),
          aber nur mit Daten, die damals schon veröffentlicht waren: Leitzins, 2J-Rendite,
          Inflation mit Veröffentlichungsverzug, Zyklus aus den Zinsschritten bis dahin,
          PMI und Überraschungen aus den Veröffentlichungen davor. BIP, Arbeitslosenquote
          und Frühindikator sind die heutigen (evtl. revidierten) Werte mit angenommenem
          Verzug. Nicht enthalten: deine Handeingaben und Ereignisse. Bis Juni 2026 ist
          die Erwartung die Prognose von MetaQuotes. Überlappende Horizonte machen die
          echte Streuung grösser als das angezeigte Band.
        </Info>
        <span className="ml-auto text-[11px] text-ink-faint">
          {stand ? `gerechnet ${stand} · wöchentlich neu` : "noch nicht gerechnet"}
        </span>
      </div>
      {gemessen.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Noch keine Rückrechnung vorhanden. Sie läuft beim nächsten vollen Datenlauf
          automatisch, oder sofort über den Aufruf mit <code className="text-xs">&amp;job=rueckrechnung</code>.
        </p>
      ) : (
        <div className="space-y-4">
          <GruppenKarten band gruppen={[
            gruppe("Klasse A · stark gegen schwach", rueck.filter((r) => r.klasse === "A")),
            gruppe("Klasse B · stark gegen neutral", rueck.filter((r) => r.klasse === "B")),
            gruppe("Alle Ideen", rueck),
          ]} />
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Nach Herkunft der Erwartung und Jahr</p>
            <GruppenKarten band gruppen={[
              gruppe("MetaQuotes-Prognose", rueck.filter((r) => r.erwartung === "metaquotes")),
              gruppe("Konsens (ab Juli 2026)", rueck.filter((r) => r.erwartung === "konsens")),
              ...jahre.map((j) => gruppe(`Jahr ${j}`, rueck.filter((r) => r.woche.startsWith(j)))),
            ]} />
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-accent-soft">Je Paar ({paare.length})</summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                  <th className="pb-2 font-medium">Paar</th>
                  <th className="pb-2 text-right font-medium">Ideen</th>
                  <th className="pb-2 text-right font-medium">Aufgegangen</th>
                  <th className="pb-2 text-right font-medium">Zufall ±</th>
                  <th className="pb-2 text-right font-medium">Schnitt 2W</th>
                </tr>
              </thead>
              <tbody>
                {paare.map((g) => (
                  <tr key={g.label} className="border-t border-line/60">
                    <td className="py-1.5 font-display text-xs font-bold text-ink">{g.label}</td>
                    <td className="tabular py-1.5 text-right text-xs text-ink-muted">{g.n}</td>
                    <td className="tabular py-1.5 text-right text-xs text-ink-soft">{g.treffer === null ? "—" : `${g.treffer} %`}</td>
                    <td className="tabular py-1.5 text-right text-xs text-ink-faint">{zufallsBand(g.n)}</td>
                    <td className="py-1.5 text-right text-xs"><Prozent p={g.schnitt} pips={null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-ink-faint">
              Je Paar sind es wenige Ideen — ein Paar mit 70 % bei 10 Ideen ist noch Zufall.
              Aussagekräftig ist zuerst die Zeile „Alle Ideen" oben.
            </p>
          </details>
        </div>
      )}
    </Card>
  );
}
