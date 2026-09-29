import Link from "next/link";
import { tradingConfigured, G8 } from "@/lib/supabase/trading";
import { ladeMakro } from "@/lib/makro/laden";
import { paarIdeen, GEWICHT, EBENEN_LABEL, ZYKLUS_LABEL } from "@/lib/makro/bewertung";
import { PAARE } from "@/lib/trading/journal";
import { ereignisAnlegen, ereignisLoeschen } from "@/lib/makro-actions";
import { RangTabelle, ScoreBalken, MontyZeichen, urteilWort } from "@/components/makro/teile";
import { ladeTerminal } from "@/lib/makro/releases-laden";
import { QUELLE_LABEL, urteilUeberraschung, fmtZ, type IstQuelle } from "@/lib/makro/releases";
import { UeberraschungsMatrix } from "@/components/makro/ueberraschung-teile";
import { IndexAlle } from "@/components/makro/ueberraschung-grafik";
import { Card, CardTitle, Stat, Badge, Empty, Button, Input, Label } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Fundamentals — die Lage aller acht Währungen auf einen Blick.
 *
 * Ersetzt das Währungs-Ranking als Einstieg (26.09.2026). Grund: Der Q-Score
 * des ML-Modells besteht in der Praxis fast nur aus der Zinslage — die
 * Saisonalität steht bei allen acht auf 0.000 —, und die Zinsen selbst waren
 * nirgends zu sehen. Hier steht jede Zahl, aus der das Urteil entsteht.
 *
 * Aufbau nach Kerims drei Ebenen: Wirtschaft, Zentralbank, Sentiment.
 *
 * Seit dem 26.09.2026 ist das die EINZIGE Stelle, an der Paare vorgeschlagen
 * werden. Vorher gab es dieselbe Empfehlung noch einmal unter Confluence, aus
 * einem anderen Modell und mit teils anderem Ergebnis — wer zwei Listen vor
 * sich hat, entscheidet bei jedem Blick neu, welcher er glaubt. Monty steht
 * jetzt als aufklappbare Gegenprobe darunter: es sagt nicht, was zu handeln
 * ist, sondern nur, ob die Commercials gerade zustimmen.
 *
 * Seit dem 29.09.2026 das Makro-Terminal: oben die Überraschungs-Matrix und
 * der Überraschungsindex (Ist gegen Erwartung, lib/makro/releases.ts), darunter
 * die Niveau-Rangliste wie bisher. Beides steht bewusst NEBENEINANDER und wird
 * nicht verrechnet: das Niveau sagt, wo eine Wirtschaft steht, die
 * Überraschung, wohin der Markt sie gerade umbewertet. Wie man beides
 * gewichtet, soll erst ein Backtest zeigen.
 */

const BANK: Record<string, string> = {
  USD: "Fed", EUR: "EZB", GBP: "BoE", JPY: "BoJ", AUD: "RBA", NZD: "RBNZ", CAD: "BoC", CHF: "SNB",
};
export default async function FundamentalsSeite() {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Fundamentals</CardTitle>
        <Empty>
          Trading-Datenbank nicht verbunden. Ohne sie fehlen Leitzins,
          Inflation, COT und das Risiko-Regime.
        </Empty>
      </Card>
    );
  }

  const [b, t] = await Promise.all([ladeMakro(), ladeTerminal()]);
  const ideen = paarIdeen(b.zeilen, PAARE);

  // Zyklus je Währung aus Ebene 2 — dort steht er schon, automatisch aus dem
  // Zinsverlauf oder von Hand übersteuert.
  const zyklen = Object.fromEntries(G8.map((ccy) => {
    const teil = b.zeilen.find((z) => z.ccy === ccy)?.ebenen.find((e) => e.ebene === 2)
      ?.teile.find((x) => x.key === "zyklus");
    const text = teil?.score === null || teil?.score === undefined
      ? "unbekannt" : teil.text.split(" — ")[0].replace(" (aus dem Zinsverlauf)", "");
    const ton: "gut" | "schlecht" | "neutral" = teil?.score == null ? "neutral"
      : teil.score > 0 ? "gut" : teil.score < 0 ? "schlecht" : "neutral";
    return [ccy, { bank: BANK[ccy], zyklus: text, ton, hinweis: t.schritt[ccy] }];
  }));
  const ueberraschung = (ccy: string) => t.matrix[ccy]?.gesamt.wert ?? null;
  const quellenText = Object.entries(t.status.jeQuelle)
    .map(([q, n]) => `${QUELLE_LABEL[q as IstQuelle] ?? q} ${n}`).join(" · ") || "keine";
  const nurRekonstruiert = !t.status.jeQuelle.jblanked && !t.status.jeQuelle.mt5;
  const montyJeCcy = Object.fromEntries(b.monty.zeilen.map((z) => [z.ccy, z]));

  const stark = b.zeilen[0];
  const schwach = [...b.zeilen].reverse().find((z) => z.gesamt !== null) ?? null;
  const ohneDaten = b.zeilen.filter((z) => z.abdeckung < 0.5).map((z) => z.ccy);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Makro-Terminal</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Nicht die Zahl bewegt den Kurs, sondern ihre Abweichung von der
            Erwartung. Oben die Überraschung, darunter das Niveau nach deinen
            drei Ebenen. Stand {b.stichtag}.
          </p>
        </div>
        <div className="flex gap-4">
          <Link href="/trading/fundamentals/kalender"
            className="text-xs text-accent-soft transition hover:underline">
            Kalender →
          </Link>
          <Link href="/trading/waehrungen"
            className="text-xs text-accent-soft transition hover:underline">
            Währungen →
          </Link>
        </div>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <CardTitle className="mb-0">Überraschungs-Matrix</CardTitle>
          <span className="ml-auto text-[11px] text-ink-faint">
            grün = besser als erwartet · stützt &nbsp;·&nbsp; rot = schlechter · belastet &nbsp;·&nbsp; Werte in typischen Schritten (±3)
          </span>
        </div>
        <UeberraschungsMatrix matrix={t.matrix} waehrungen={G8} zyklen={zyklen} />
        <p className={`mt-3 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed ${nurRekonstruiert ? "bg-warn-tint text-ink-soft" : "bg-sand/60 text-ink-muted"}`}>
          Letzte 45 Tage: {t.status.termine45} Termine, {t.status.mitErwartung45} mit Erwartung,{" "}
          {t.status.mitIst45} mit Ist ({quellenText}), {t.status.offenOhneIst} warten noch auf ihr Ist.
          {nurRekonstruiert && " Das Ist wird nur aus dem Folgetermin rekonstruiert und kommt deshalb verzögert. Mit einem JBLANKED_API_KEY kommt es Minuten nach der Veröffentlichung."}
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <CardTitle className="mb-0">Überraschungsindex</CardTitle>
          <span className="ml-auto text-[11px] text-ink-faint">wer schlägt gerade die Erwartungen?</span>
        </div>
        <IndexAlle verlauf={t.verlauf} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card area="trading">
          <Stat label="Stärkste" value={stark?.gesamt === null ? "—" : stark?.ccy ?? "—"}
            tone="good" sub={stark ? urteilWort(stark.gesamt) : ""} />
        </Card>
        <Card>
          <Stat label="Schwächste" value={schwach?.ccy ?? "—"}
            tone="bad" sub={schwach ? urteilWort(schwach.gesamt) : ""} />
        </Card>
        <Card>
          <Stat label="Risiko-Regime"
            value={b.regime.lage === "risk-on" ? "Risk-on"
              : b.regime.lage === "risk-off" ? "Risk-off"
                : b.regime.lage === "neutral" ? "neutral" : "unbekannt"}
            sub={b.regime.score === null ? "keine Quelle"
              : `Score ${b.regime.score.toFixed(2)} · ${b.regime.teile.length} Quellen`} />
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <CardTitle className="mb-0">Rangliste</CardTitle>
          <span className="ml-auto text-[11px] text-ink-faint">
            Gewichte: Wirtschaft {Math.round(GEWICHT[1] * 100)} % ·
            Zentralbank {Math.round(GEWICHT[2] * 100)} % ·
            Sentiment {Math.round(GEWICHT[3] * 100)} %
          </span>
        </div>
        <RangTabelle zeilen={b.zeilen} monty={montyJeCcy} />
        {ohneDaten.length > 0 && (
          <p className="mt-3 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
            Dünne Datenlage bei {ohneDaten.join(", ")} — dort fehlen die von Hand
            gepflegten Zahlen. Bis sie eingetragen sind, trägt das Urteil dieser
            Währungen fast nur die Zentralbank-Ebene.{" "}
            <Link href="/trading/waehrungen" className="text-accent-soft hover:underline">
              Jetzt eintragen
            </Link>.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>Stark gegen schwach</CardTitle>
        {ideen.length === 0 ? (
          <Empty>
            Kein Paar mit deutlichem Abstand. Das ist eine Aussage: heute steht
            keine Währung klar gegen eine andere.
          </Empty>
        ) : (
          <ul className="space-y-1.5">
            {ideen.map((i) => (
              <li key={i.paar + i.seite}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-sand/50 px-3 py-2">
                <span className="w-[86px] font-display font-bold text-ink">{i.paar}</span>
                <Badge tone={i.seite === "Long" ? "good" : "bad"}>{i.seite}</Badge>
                <span className="text-xs text-ink-muted">
                  {i.stark} stark gegen {i.schwach} schwach
                </span>
                <UeberraschungsProbe stark={ueberraschung(i.stark)} schwach={ueberraschung(i.schwach)} />
                <span className="tabular ml-auto text-xs text-ink-soft">
                  Abstand {i.abstand.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Die Regel aus deinen Notizen: eine starke gegen eine schwache Währung.
          Gezeigt werden nur Paare mit mindestens 0.40 Abstand — bei zwei
          mittelmässigen Währungen ist das Urteil keins. Das ersetzt keine
          GVA-Linie, es sagt nur, in welche Richtung du sie suchen solltest.
          Die Marke „Überraschung" zeigt, ob die jüngsten Daten dieselbe
          Richtung stützen (starke Währung überrascht besser als die schwache).
        </p>
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer list-none">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CardTitle className="mb-0">Gegenprobe: was sagen die Commercials?</CardTitle>
              <span className="text-xs text-ink-muted">{b.monty.satz}</span>
              <span className="ml-auto text-[11px] text-accent-soft">aufklappen</span>
            </span>
          </summary>

          <div className="mt-4 space-y-3">
            <ul className="space-y-1.5">
              {b.monty.zeilen.map((z) => (
                <li key={z.ccy}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-sand/50 px-3 py-2">
                  <MontyZeichen stand={z.stand} />
                  <span className="w-[42px] font-display font-bold text-ink">{z.ccy}</span>
                  <span className="tabular text-xs text-ink-faint">Rang {z.rang}</span>
                  <span className="text-xs text-ink-muted">{z.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              ✓ heisst: Commercials und Retail stehen gestreckt gegeneinander, und
              zwar auf der Seite, die auch die drei Ebenen sehen. ✗ heisst, sie
              stehen dagegen — das ist <strong className="text-ink-soft">kein Verbot</strong>,
              sondern der Hinweis, dass die Hedger am Terminmarkt anders liegen als
              die Fundamentaldaten. · heisst, keine Seite steht am Rand; dann sagt
              Monty nichts, und das ist der Normalfall.{" "}
              <Link href="/trading/confluence" className="text-accent-soft hover:underline">
                Monty im Detail
              </Link>{" "}
              — Perzentilverläufe, Saisonalität und die Schwellen-Kalibrierung.
            </p>
          </div>
        </details>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="ereignisse">
          <CardTitle>Ereignisse (Ebene 3 · nicht gewertet)</CardTitle>
          {b.ereignisse.length === 0 ? (
            <Empty>Nichts eingetragen. Kriege, Wahlen, Zollstreit — was gerade läuft.</Empty>
          ) : (
            <ul className="space-y-2">
              {b.ereignisse.map((e) => (
                <li key={e.id} className="rounded-xl bg-sand/50 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <strong className="text-sm text-ink">{e.titel}</strong>
                    <span className="text-[11px] text-ink-faint">seit {e.datum}</span>
                    <form action={ereignisLoeschen} className="ml-auto">
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-[11px] text-ink-faint transition hover:text-bad">
                        weg
                      </button>
                    </form>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {e.profitiert.map((c) => <Badge key={c} tone="good">+ {c}</Badge>)}
                    {e.leidet.map((c) => <Badge key={c} tone="bad">− {c}</Badge>)}
                  </div>
                  {e.notiz && <p className="mt-1.5 text-xs text-ink-muted">{e.notiz}</p>}
                </li>
              ))}
            </ul>
          )}

          <form action={ereignisAnlegen} className="mt-4 space-y-3 border-t border-line/70 pt-4">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div>
                <Label htmlFor="er-titel">Was läuft gerade?</Label>
                <Input id="er-titel" name="titel" required
                  placeholder="z.B. Zollstreit USA–China" />
              </div>
              <div>
                <Label htmlFor="er-datum">Seit</Label>
                <Input id="er-datum" name="datum" type="date" defaultValue={b.stichtag} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Profitiert</Label>
                <div className="flex flex-wrap gap-1.5">
                  {G8.map((c) => (
                    <label key={c} className="cursor-pointer">
                      <input type="checkbox" name="profitiert" value={c} className="peer sr-only" />
                      <span className="block rounded-lg border border-line bg-sand px-2.5 py-1 text-xs
                                       text-ink-muted transition peer-checked:border-good
                                       peer-checked:bg-good-tint peer-checked:text-good-bright">
                        {c}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Leidet</Label>
                <div className="flex flex-wrap gap-1.5">
                  {G8.map((c) => (
                    <label key={c} className="cursor-pointer">
                      <input type="checkbox" name="leidet" value={c} className="peer sr-only" />
                      <span className="block rounded-lg border border-line bg-sand px-2.5 py-1 text-xs
                                       text-ink-muted transition peer-checked:border-bad
                                       peer-checked:bg-bad-tint peer-checked:text-bad-bright">
                        {c}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="er-notiz">Notiz</Label>
              <Input id="er-notiz" name="notiz" placeholder="Was heisst das für die Währungen?" />
            </div>
            <Button type="submit" variant="ghost">Ereignis eintragen</Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>Risiko-Regime im Detail</CardTitle>
            {b.regime.teile.length === 0 ? (
              <Empty>Keine Quelle geladen ({b.regime.fehlend.join(", ")}).</Empty>
            ) : (
              <ul className="space-y-2.5">
                {b.regime.teile.map((t) => (
                  <li key={t.label}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-ink-soft">{t.label}</span>
                      <ScoreBalken score={t.score} breit={80} />
                    </div>
                    <p className="text-[11px] text-ink-muted">{t.text}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Das Regime wirkt je Währung verschieden: AUD und NZD steigen im
              Risk-on, CHF und JPY im Risk-off. Deshalb geht es mit dem
              Risiko-Beta der Währung multipliziert ins Urteil ein.
            </p>
          </Card>

          <Card flat>
            <CardTitle>Wie das Urteil entsteht</CardTitle>
            <ol className="ml-4 list-decimal space-y-1.5 text-sm text-ink-muted">
              <li>
                <strong className="text-ink-soft">{EBENEN_LABEL[1]}:</strong> PMI Industrie
                und PMI Dienste (über 50 positiv) und BIP zum Vorjahr — automatisch.
                Frühindikator, Arbeitslosenquote und Leistungsbilanz stehen nur als Kontext da.
              </li>
              <li>
                <strong className="text-ink-soft">{EBENEN_LABEL[2]}:</strong> Zyklus
                ({Object.values(ZYKLUS_LABEL).join(", ")} — aus den Zinsschritten
                abgeleitet, von Hand überschreibbar), Zinsrichtung über sechs Monate
                und die Markterwartung aus der 2-Jahres-Rendite. Zinsniveau, Realzins
                und 10J-Rendite sind Kontext.
              </li>
              <li>
                <strong className="text-ink-soft">{EBENEN_LABEL[3]}:</strong> Risiko-Regime,
                COT, Ereignisse, Rohstoff-Abhängigkeit — angezeigt, noch nicht gewertet.
              </li>
            </ol>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Jeder Teil wird auf −1 bis +1 normiert und innerhalb seiner Ebene
              gemittelt — aber nur über die Teile, die Daten haben. Eine
              fehlende Zahl verwässert das Urteil damit nicht, sie verkleinert
              nur die Abdeckung, und die steht in der Tabelle.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Stützen die jüngsten Überraschungen das Paar? Ab 0.3 Abstand zählt es,
 * darunter ist es Rauschen.
 */
function UeberraschungsProbe({ stark, schwach }: { stark: number | null; schwach: number | null }) {
  if (stark === null || schwach === null) {
    return <Badge tone="neutral" title="Für mindestens eine der beiden Währungen fehlen Veröffentlichungen mit Erwartung und Ist.">Überraschung ?</Badge>;
  }
  const d = stark - schwach;
  const titel = `stark ${fmtZ(stark)} (${urteilUeberraschung(stark)}) · schwach ${fmtZ(schwach)} (${urteilUeberraschung(schwach)})`;
  if (d >= 0.3) return <Badge tone="good" title={titel}>Überraschung stützt</Badge>;
  if (d <= -0.3) return <Badge tone="warn" title={titel}>Überraschung dagegen</Badge>;
  return <Badge tone="neutral" title={titel}>Überraschung neutral</Badge>;
}
