import Link from "next/link";
import { Badge, Card, CardTitle, cx } from "@/components/ui";
import { Intervall, GruppenTabelle, BefundKarte, VetoKarte } from "@/components/confluence/bilanz-teile";
import { Pfeil } from "@/components/confluence/teile";
import { LAGER_LABEL } from "@/lib/confluence/bilanz";
import { LAGER_ORDNUNG } from "@/lib/confluence/tiefe";
import type {
  KreuzZeile, FaktorZeile, Auffaellig, FaktorBefund, JahresZeile, ZeitBefund,
  SichtVergleich, TiefenTrade,
} from "@/lib/confluence/tiefe";
import type { BacktestFundamentalBild } from "@/lib/confluence/backtest-bilanz";

/**
 * Die Fundamental-Auswertung des Backtests, als Block im Analyse-Modus.
 *
 * Reihenfolge ist Absicht: erst die eine Frage, die überhaupt zählt (trägt der
 * Filter), dann wo der Unterschied sitzt (Ergebnis-Kreuz), dann wer ihn trägt
 * (Faktor-Tabelle), und ganz zuletzt die Handvoll Charts, die man sich
 * tatsächlich ansehen sollte. Wer oben „kein Nachweis" liest, kann unten
 * aufhören — dann sind die Details Rauschen.
 */

const BEFUND_TON: Record<FaktorBefund, "good" | "warn" | "bad" | "neutral"> = {
  traegt: "good", verkehrt: "bad", "kein-nachweis": "neutral", "zu-wenig": "warn",
};

const BEFUND_LABEL: Record<FaktorBefund, string> = {
  traegt: "trägt", verkehrt: "verkehrt herum",
  "kein-nachweis": "kein Nachweis", "zu-wenig": "zu wenig",
};

export function BacktestFundamental({ bild, ergebnisLabel }: {
  bild: BacktestFundamentalBild;
  ergebnisLabel: string[];
}) {
  if (bild.ausgewertet === 0) {
    return (
      <Card>
        <CardTitle>Fundamentale Lage</CardTitle>
        <p className="py-4 text-sm leading-relaxed text-ink-muted">
          Noch keine gewerteten Trades in dieser Session. Skips zählen nicht mit —
          ohne Ergebnis gibt es nichts, was sich einer Fundamentallage zuordnen liesse.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardTitle>Trug die Fundamentallage?</CardTitle>
        <BefundKarte v={bild.vergleich} />
        <div className="mt-4"><GruppenTabelle gruppen={bild.gruppen} /></div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          {bild.ausgewertet} Trades von {bild.von} bis {bild.bis}
          {bild.uebersprungen > 0 && ` · ${bild.uebersprungen} ohne Ergebnis übersprungen`}
          {bild.paare.length > 0 && ` · ${bild.paare.join(", ")}`}.
          Jeder Trade wurde mit dem Stand <strong>seines</strong> Handelstages bewertet,
          inklusive Veröffentlichungsverzug. Der Vergleich oben zählt nur
          <strong> gewertete</strong> Trades — Break-even gehört zur Gruppe, aber nicht in
          eine Trefferquote. Deshalb stehen dort kleinere Zahlen als in der Tabelle.
        </p>
        <p className="mt-2 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
          <strong>Was diese Zahlen nicht sind:</strong> ein Out-of-Sample-Test. Du hast
          die Setups am Chart gesucht und dabei gesehen, was danach kam — die absolute
          Trefferquote ist deshalb nach oben verzerrt. Aussagekräftig ist nur der
          <em> Unterschied</em> zwischen den Lagern: beim Erfassen hat niemand auf die
          Zinsdifferenz geschaut, die Verzerrung trifft also beide Seiten gleich.
        </p>
      </Card>

      <Card>
        <CardTitle>Wie die Trades ausgegangen sind</CardTitle>
        <KreuzTabelle kreuz={bild.kreuz} labels={ergebnisLabel} />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Eine Trefferquote kann gleich bleiben, während sich die <strong>Art</strong> der
          Gewinne verschiebt. Wenn mit Rückenwind gleich oft gewonnen wird, aber öfter
          voll durchläuft statt am Break-even zu enden, steht das nur in dieser Tabelle.
        </p>
      </Card>

      <Card>
        <CardTitle>Verteilt über die Jahre</CardTitle>
        <JahresTabelle jahre={bild.jahre} />
        <p className={cx("mt-3 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed",
          bild.zeit.verdaechtig ? "bg-bad-tint text-ink-soft" : "bg-sand/50 text-ink-muted")}>
          {bild.zeit.verdaechtig && <strong>Achtung: </strong>}
          {bild.zeit.satz}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Warum das hier steht: „kein Urteil möglich" entsteht, wenn dem Modell die Daten
          fehlen — und Daten fehlen vor allem früh, weil die Kursreihen für das
          Risiko-Regime nicht so weit zurückreichen wie deine ältesten Trades. Häufen sich
          die urteilslosen Trades am Anfang, trennt die Tabelle ganz oben nicht nach
          Fundamentallage, sondern nach Jahr.
        </p>
      </Card>

      <Card>
        <CardTitle>Welcher Faktor trägt</CardTitle>
        <FaktorTabelle faktoren={bild.faktoren} />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Je Faktor getrennt: Trades, bei denen er in die gehandelte Richtung zeigte,
          gegen Trades, bei denen er dagegen zeigte. Wo er nichts sagte, fällt der Trade
          aus <strong>beiden</strong> Seiten heraus — sonst hätte ein Faktor ohne Quelle
          automatisch eine schlechte Bilanz.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          <strong>Vorsicht beim Aussuchen:</strong> die fünf Zeilen sind nicht unabhängig.
          Zinsdifferenz und Realzins teilen sich den Leitzins, und wer bei fünf Faktoren
          nach dem besten sucht, findet auch in Zufallszahlen einen. Die Tabelle ist zum
          Verstehen da, nicht zum Auswählen.
        </p>
      </Card>

      <Card>
        <CardTitle>COT — zwei Lesarten derselben Daten</CardTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          {bild.sichten.map((s) => <SichtKarte key={s.titel} s={s} />)}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Links das Veto aus Fonds und Real Money, rechts Commercials gegen
          Nicht-Meldepflichtige. Beide lesen denselben COT-Bericht, nur andere
          Gruppen — deshalb lassen sie sich gegeneinander halten.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          <strong>Warum „keine Streckung" so gross ist:</strong> Commercials stehen
          im COT fast immer gegen Retail — netto gilt
          <em> Commercials ≈ −(Grossspekulanten + Retail)</em>, jemand muss die
          Gegenseite halten. Ein blosses Auseinanderzeigen ist deshalb kein Signal,
          sondern Buchhaltung. Gezählt wird nur, wenn <strong>beide gleichzeitig</strong>
          {" "}am Rand ihrer eigenen drei Jahre stehen — und das ist selten.
        </p>
      </Card>

      <Card>
        <CardTitle>Alle Trades mit der COT-Lage des Tages</CardTitle>
        <TradeCotTabelle trades={bild.trades} />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Perzentilränge über drei Jahre, je Währung getrennt: <strong>K</strong> =
          Commercials, <strong>R</strong> = Nicht-Meldepflichtige, Basis / Quote.
          Ein Pfeil steht nur, wenn beide gestreckt waren. Saisonalität kommt in
          dieser Tabelle dazu, sobald die Monty-Seite sie rechnet — vorher würde
          hier eine leere Spalte stehen.
        </p>
      </Card>

      <Card>
        <CardTitle>Das COT-Veto im Detail</CardTitle>
        <VetoKarte v={bild.veto} />
      </Card>

      {bild.auffaellig.length > 0 && (
        <Card>
          <CardTitle>Diese Charts lohnen sich</CardTitle>
          <div className="space-y-4">
            {bild.auffaellig.map((g) => <AuffaelligBlock key={g.titel} g={g} />)}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Bewusst nur die Widersprüche und nicht alle Stopouts: ein Screenshot
            beantwortet keine Frage, die man vorher nicht gestellt hat. Nur dort, wo die
            Zahl gegen das Ergebnis steht, kann das Bild etwas erklären, was die Tabellen
            oben nicht schon sagen.
          </p>
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------- Kreuz */

function KreuzTabelle({ kreuz, labels }: { kreuz: KreuzZeile[]; labels: string[] }) {
  const gesamt = kreuz.reduce((s, z) => s + z.n, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Lage</th>
            <th className="px-2 py-2 text-right font-normal">n</th>
            {labels.map((l) => (
              <th key={l} className="px-2 py-2 text-right font-normal">{l}</th>
            ))}
            <th className="px-2 py-2 text-right font-normal">Trefferquote</th>
            <th className="px-2 py-2 text-right font-normal">Ø R</th>
            <th className="px-2 py-2 text-right font-normal">Summe R</th>
          </tr>
        </thead>
        <tbody>
          {kreuz.map((z) => (
            <tr key={z.lager} className="border-b border-line/50 last:border-b-0">
              <td className="px-2 py-2 text-ink">{LAGER_LABEL[z.lager]}</td>
              <td className="num px-2 py-2 text-right text-ink-soft">
                {z.n}
                {gesamt > 0 && (
                  <span className="ml-1 text-[11px] text-ink-faint">
                    {((z.n / gesamt) * 100).toFixed(0)}%
                  </span>
                )}
              </td>
              {z.proErgebnis.map((n, i) => (
                <td key={i} className={cx("num px-2 py-2 text-right",
                  n === 0 ? "text-ink-faint" : "text-ink-soft")}>
                  {n}
                  {z.n > 0 && n > 0 && (
                    <span className="ml-1 text-[11px] text-ink-faint">
                      {((n / z.n) * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
              ))}
              <td className="px-2 py-2 text-right"><Intervall q={z.quote} /></td>
              <td className={cx("num px-2 py-2 text-right",
                (z.erwartung ?? 0) > 0 ? "text-good-bright"
                  : (z.erwartung ?? 0) < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {z.erwartung === null ? "·" : `${z.erwartung > 0 ? "+" : ""}${z.erwartung.toFixed(2)}`}
              </td>
              <td className={cx("num px-2 py-2 text-right",
                z.gesamtR > 0 ? "text-good-bright" : z.gesamtR < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {z.gesamtR > 0 ? "+" : ""}{z.gesamtR.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- Sichten */

function SichtKarte({ s }: { s: SichtVergleich }) {
  return (
    <div className="rounded-xl bg-sand/40 px-3 py-3">
      <div className="text-sm font-medium text-ink">{s.titel}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{s.erklaerung}</p>
      <ul className="mt-2.5 space-y-1.5">
        {s.gruppen.map((g) => (
          <li key={g.label} className="flex flex-wrap items-center gap-2">
            <span className="w-44 shrink-0 text-xs text-ink-soft">{g.label}</span>
            <span className="num text-xs text-ink-muted">{g.n}</span>
            <Intervall q={g.quote} />
            <span className={cx("num ml-auto text-xs",
              (g.erwartung ?? 0) > 0 ? "text-good-bright"
                : (g.erwartung ?? 0) < 0 ? "text-bad-bright" : "text-ink-faint")}>
              {g.erwartung === null ? "·" : `${g.erwartung > 0 ? "+" : ""}${g.erwartung.toFixed(2)} R`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">{s.satz}</p>
    </div>
  );
}

/* --------------------------------------------------------- Trade-Tabelle */

const rang = (v: number | null) => (v === null ? "·" : v.toFixed(0));

function TradeCotTabelle({ trades }: { trades: TiefenTrade[] }) {
  if (trades.length === 0) return null;

  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Datum</th>
            <th className="px-2 py-2 text-left font-normal">Paar</th>
            <th className="px-2 py-2 text-left font-normal">Richtung</th>
            <th className="px-2 py-2 text-left font-normal">Ergebnis</th>
            <th className="px-2 py-2 text-right font-normal">R</th>
            <th className="px-2 py-2 text-right font-normal" title="Commercials, Basis / Quote">K</th>
            <th className="px-2 py-2 text-right font-normal" title="Nicht-Meldepflichtige (Retail), Basis / Quote">R&nbsp;(Retail)</th>
            <th className="px-2 py-2 text-center font-normal">Divergenz</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-line/50 last:border-b-0">
              <td className="num px-2 py-1.5 text-ink-soft">{t.datum}</td>
              <td className="px-2 py-1.5 text-ink">{t.paar}</td>
              <td className={cx("px-2 py-1.5 text-xs",
                t.richtung > 0 ? "text-good-bright" : "text-bad-bright")}>
                {t.richtung > 0 ? "Long" : "Short"}
              </td>
              <td className="px-2 py-1.5 text-xs text-ink-muted">{t.ergebnis}</td>
              <td className={cx("num px-2 py-1.5 text-right",
                t.r > 0 ? "text-good-bright" : t.r < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {t.r > 0 ? "+" : ""}{t.r.toFixed(2)}
              </td>
              <td className="num px-2 py-1.5 text-right text-ink-soft">
                {rang(t.cot?.kommBasis ?? null)}<span className="text-ink-faint"> / </span>
                {rang(t.cot?.kommQuote ?? null)}
              </td>
              <td className="num px-2 py-1.5 text-right text-ink-soft">
                {rang(t.cot?.retailBasis ?? null)}<span className="text-ink-faint"> / </span>
                {rang(t.cot?.retailQuote ?? null)}
              </td>
              <td className="px-2 py-1.5 text-center">
                {t.cot && t.cot.div !== 0
                  ? <Pfeil dir={t.cot.div} />
                  : <span className="text-ink-faint">–</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- Jahre */

function JahresTabelle({ jahre }: { jahre: JahresZeile[] }) {
  if (jahre.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Jahr</th>
            <th className="px-2 py-2 text-right font-normal">Trades</th>
            {LAGER_ORDNUNG.map((l) => (
              <th key={l} className="px-2 py-2 text-right font-normal">{LAGER_LABEL[l]}</th>
            ))}
            <th className="px-2 py-2 text-right font-normal">Trefferquote</th>
            <th className="px-2 py-2 text-right font-normal">Ø R</th>
          </tr>
        </thead>
        <tbody>
          {jahre.map((z) => (
            <tr key={z.jahr} className="border-b border-line/50 last:border-b-0">
              <td className="num px-2 py-2 text-ink">{z.jahr}</td>
              <td className="num px-2 py-2 text-right text-ink-soft">{z.n}</td>
              {z.proLager.map((n, i) => (
                <td key={i} className={cx("num px-2 py-2 text-right",
                  n === 0 ? "text-ink-faint" : "text-ink-soft")}>
                  {n}
                  {n > 0 && z.n > 0 && (
                    <span className="ml-1 text-[11px] text-ink-faint">
                      {((n / z.n) * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
              ))}
              <td className="px-2 py-2 text-right"><Intervall q={z.quote} /></td>
              <td className={cx("num px-2 py-2 text-right",
                (z.erwartung ?? 0) > 0 ? "text-good-bright"
                  : (z.erwartung ?? 0) < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {z.erwartung === null ? "·" : `${z.erwartung > 0 ? "+" : ""}${z.erwartung.toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- Faktoren */

function FaktorTabelle({ faktoren }: { faktoren: FaktorZeile[] }) {
  return (
    <ul className="space-y-2">
      {faktoren.map((f) => (
        <li key={f.key} className="rounded-xl bg-sand/40 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{f.label}</span>
            <Badge tone={BEFUND_TON[f.befund]}>{BEFUND_LABEL[f.befund]}</Badge>
            {f.abstand !== null && (
              <span className={cx("num text-xs",
                f.abstand > 0 ? "text-good-bright" : f.abstand < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {f.abstand > 0 ? "+" : ""}{f.abstand.toFixed(1)} Pkt.
              </span>
            )}
            <span className="num ml-auto text-[11px] text-ink-faint">
              {f.dafuer.n} / {f.dagegen.n}
              {f.stumm > 0 && ` · ${f.stumm} stumm`}
            </span>
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-ink-muted">dafür</span>
              <Intervall q={f.dafuer} />
              {f.erwartungDafuer !== null && (
                <span className="num text-[11px] text-ink-faint">
                  {f.erwartungDafuer > 0 ? "+" : ""}{f.erwartungDafuer.toFixed(2)} R
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-ink-muted">dagegen</span>
              <Intervall q={f.dagegen} />
              {f.erwartungDagegen !== null && (
                <span className="num text-[11px] text-ink-faint">
                  {f.erwartungDagegen > 0 ? "+" : ""}{f.erwartungDagegen.toFixed(2)} R
                </span>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">{f.satz}</p>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- Auffällig */

function AuffaelligBlock({ g }: { g: Auffaellig }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">{g.titel}</span>
        <Badge tone="warn">{g.trades.length}</Badge>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{g.grund}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {g.trades.map((t) => (
          <li key={t.id}>
            <Link href={t.link!} target="_blank" rel="noopener noreferrer"
              title={`${t.datum} · ${t.paar} · ${t.richtung > 0 ? "Long" : "Short"} · ${t.r > 0 ? "+" : ""}${t.r.toFixed(2)} R`}
              className="flex items-center gap-1.5 rounded-lg bg-sand px-2.5 py-1.5 text-xs text-ink-soft transition duration-150 ease-tactile hover:text-ink active:scale-95">
              <span className="num">{t.datum.slice(5)}</span>
              <span className={t.richtung > 0 ? "text-good-bright" : "text-bad-bright"}>
                {t.richtung > 0 ? "▲" : "▼"}
              </span>
              <span className="num text-ink-faint">
                {t.r > 0 ? "+" : ""}{t.r.toFixed(1)}R
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
