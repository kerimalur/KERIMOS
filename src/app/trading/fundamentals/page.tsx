import Link from "next/link";
import { tradingConfigured, G8 } from "@/lib/supabase/trading";
import { ladeMakro } from "@/lib/makro/laden";
import { paarIdeen, EBENEN_LABEL, ZYKLUS_LABEL } from "@/lib/makro/bewertung";
import { PAARE } from "@/lib/trading/journal";
import { ereignisAnlegen, ereignisLoeschen } from "@/lib/makro-actions";
import { RangTabelle, ScoreBalken, MontyZeichen } from "@/components/makro/teile";
import { ladeUebersicht } from "@/lib/makro/releases-laden";
import { QUELLE_LABEL, type IstQuelle } from "@/lib/makro/releases";
import { BANK, paarKlasse, type PaarKlasse } from "@/lib/makro/urteil";
import { ERKLAERUNG } from "@/lib/makro/erklaerungen";
import { UeberraschungsMatrix } from "@/components/makro/ueberraschung-teile";
import { UrteilMarke, WaehrungsZeile } from "@/components/makro/urteil-teile";
import { Info } from "@/components/makro/info";
import { Card, CardTitle, Badge, Empty, Button, Input, Label, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Makro-Terminal — welche Währung ist bullish, welche bearish, und warum.
 *
 * Geschichte in Kürze:
 *   26.09.2026  ersetzt das ML-Ranking; drei Ebenen nach Kerims Notizen;
 *               einzige Stelle für Paar-Ideen; Monty als Gegenprobe.
 *   29.09.2026  Erwartung gegen Ist (lib/makro/releases.ts), Ist aus MT5.
 *   29.09.2026  abends, nach Kerims Rückmeldung „zu viele Daten, nichts, was
 *               ich direkt interpretieren kann": oben nur noch das Urteil je
 *               Währung mit den drei Feldern und dem wichtigsten Grund
 *               (lib/makro/urteil.ts). Matrix, Niveau-Rangliste, Monty,
 *               Regime-Details und Ereignisse stehen aufklappbar darunter.
 *               Die 8-Linien-Grafik ist weg — sie war nicht lesbar.
 */
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

  const b = await ladeMakro();
  const { terminal: t, urteile } = await ladeUebersicht(b.zeilen);

  const reihe = G8.map((c) => urteile[c])
    .sort((x, y) => (y.score ?? -9) - (x.score ?? -9));

  // Paar-Ideen jetzt aus dem Urteil (Zentralbank, Wirtschaft, Überraschung),
  // nicht mehr nur aus dem Niveau.
  const ideen = paarIdeen(b.zeilen.map((z) => ({ ...z, gesamt: urteile[z.ccy]?.score ?? null })), PAARE)
    .map((i) => ({ ...i, klasse: paarKlasse(urteile[i.stark]?.score ?? null, urteile[i.schwach]?.score ?? null) }));
  const ideenA = ideen.filter((i) => i.klasse === "A");
  const ideenB = ideen.filter((i) => i.klasse === "B");
  const montyJeCcy = Object.fromEntries(b.monty.zeilen.map((z) => [z.ccy, z]));

  const zyklen = Object.fromEntries(G8.map((ccy) => {
    const teil = b.zeilen.find((z) => z.ccy === ccy)?.ebenen.find((e) => e.ebene === 2)
      ?.teile.find((x) => x.key === "zyklus");
    const text = teil?.score === null || teil?.score === undefined
      ? "unbekannt" : teil.text.split(" — ")[0].replace(" (aus dem Zinsverlauf)", "");
    const ton: "gut" | "schlecht" | "neutral" = teil?.score == null ? "neutral"
      : teil.score > 0 ? "gut" : teil.score < 0 ? "schlecht" : "neutral";
    return [ccy, { bank: BANK[ccy], zyklus: text, ton, hinweis: t.schritt[ccy] }];
  }));
  const quellenText = Object.entries(t.status.jeQuelle)
    .map(([q, n]) => `${QUELLE_LABEL[q as IstQuelle] ?? q} ${n}`).join(" · ") || "keine";

  const regimeWort = b.regime.lage === "risk-on" ? "Risk-on"
    : b.regime.lage === "risk-off" ? "Risk-off"
      : b.regime.lage === "neutral" ? "neutral" : "unbekannt";
  const regimeFolge = b.regime.lage === "risk-on" ? "stützt AUD, NZD, CAD · belastet JPY, CHF"
    : b.regime.lage === "risk-off" ? "stützt JPY, CHF (oft USD) · belastet AUD, NZD, CAD"
      : "kein klarer Rückenwind für eine Seite";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Makro-Terminal</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Welche Währung ist bullish, welche bearish — und warum. Antippen für
            die Begründung. Stand {b.stichtag}.
          </p>
        </div>
        <Link href="/trading/fundamentals/kalender"
          className="text-xs text-accent-soft transition hover:underline">
          Kalender →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sand/50 px-4 py-2.5">
        <span className="text-xs text-ink-muted">Risiko-Regime</span>
        <span className={cx("rounded-lg px-2 py-0.5 text-xs font-semibold",
          b.regime.lage === "risk-on" ? "bg-good-tint text-good-bright"
            : b.regime.lage === "risk-off" ? "bg-bad-tint text-bad-bright" : "bg-sand text-ink-soft")}>
          {regimeWort}
        </span>
        <span className="text-xs text-ink-soft">{regimeFolge}</span>
        <Info titel="Risiko-Regime" breit={320}>
          <span className="block">{ERKLAERUNG.regime}</span>
          {b.regime.teile.length > 0 && (
            <span className="mt-2 block text-ink-faint">
              {b.regime.teile.map((x) => `${x.label}: ${x.text}`).join(" · ")}
            </span>
          )}
        </Info>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Die acht Währungen</CardTitle>
          <Info titel="Wie das Urteil entsteht" breit={320}>
            <span className="block">{ERKLAERUNG.urteil}</span>
            <span className="mt-2 block text-ink-faint">{ERKLAERUNG.gewichtung}</span>
          </Info>
          <span className="ml-auto text-[11px] text-ink-faint">
            Zentralbank 40 % · Wirtschaft 35 % · Überraschung 25 %
          </span>
        </div>
        <div className="space-y-1.5">
          {reihe.map((u, i) => <WaehrungsZeile key={u.ccy} u={u} rang={i + 1} />)}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Stark gegen schwach</CardTitle>
          <Info titel="Paar-Ideen">
            Die Regel aus deinen Notizen: eine starke gegen eine schwache Währung.
            Nur Paare mit mindestens 0.40 Abstand im Urteil — bei zwei
            mittelmässigen Währungen ist das Urteil keins. Ersetzt keine
            GVA-Linie, es sagt nur, in welche Richtung du sie suchen solltest.
          </Info>
        </div>
        {ideenA.length === 0 ? (
          <Empty>
            Kein Paar stark gegen schwach. Das ist eine Aussage: heute steht keine
            Währung klar gegen eine andere.
          </Empty>
        ) : (
          <IdeenListe ideen={ideenA} urteile={urteile} />
        )}
        {ideenB.length > 0 && (
          <details className="mt-3 rounded-xl border border-warn/30 bg-warn-tint/40 px-3 py-2">
            <summary className="cursor-pointer text-xs text-accent-soft">
              Mit Vorsicht · stark gegen neutral ({ideenB.length})
            </summary>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              Nur eine Seite zieht. Meist die schwächere Idee — die Wochenaussicht misst,
              ob diese Klasse bei dir überhaupt trägt.
            </p>
            <div className="mt-2"><IdeenListe ideen={ideenB} urteile={urteile} /></div>
          </details>
        )}
        <Link href="/trading/fundamentals/wochenideen" className="mt-3 inline-block text-xs text-accent-soft hover:underline">
          Wochenaussicht und Auswertung →
        </Link>
      </Card>

      <h2 className="pt-2 font-display text-base font-semibold text-ink-soft">Hintergrund</h2>

      <Card>
        <details>
          <summary className="cursor-pointer list-none">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CardTitle className="mb-0">Überraschungs-Matrix</CardTitle>
              <span className="text-xs text-ink-muted">je Währung und Bereich, wie die Daten gegen die Erwartung ausfallen</span>
              <span className="ml-auto text-[11px] text-accent-soft">aufklappen</span>
            </span>
          </summary>
          <div className="mt-4">
            <UeberraschungsMatrix matrix={t.matrix} waehrungen={G8} zyklen={zyklen} />
            <p className="mt-3 rounded-xl bg-sand/60 px-3 py-2.5 text-[11px] leading-relaxed text-ink-muted">
              Letzte 45 Tage: {t.status.termine45} Termine, {t.status.mitErwartung45} mit Erwartung,{" "}
              {t.status.mitIst45} mit Ist ({quellenText}), {t.status.offenOhneIst} warten noch auf ihr Ist.
              Werte in typischen Schritten (±3): über 0 = besser als erwartet.
            </p>
          </div>
        </details>
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer list-none">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CardTitle className="mb-0">Niveau-Rangliste</CardTitle>
              <span className="text-xs text-ink-muted">nur Wirtschaft und Zentralbank, ohne Überraschungen</span>
              <span className="ml-auto text-[11px] text-accent-soft">aufklappen</span>
            </span>
          </summary>
          <div className="mt-4">
            <RangTabelle zeilen={b.zeilen} monty={montyJeCcy} />
          </div>
        </details>
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

      <Card>
        <details>
          <summary className="cursor-pointer list-none">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CardTitle className="mb-0">Ereignisse · Regime im Detail · Methode</CardTitle>
              <span className="text-xs text-ink-muted">{b.ereignisse.length} Ereignis{b.ereignisse.length === 1 ? "" : "se"} eingetragen</span>
              <span className="ml-auto text-[11px] text-accent-soft">aufklappen</span>
            </span>
          </summary>
          <div className="mt-4">
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
                <strong className="text-ink-soft">Zentralbank · 40 %:</strong> Zyklus
                ({Object.values(ZYKLUS_LABEL).join(", ")} — aus den Zinsschritten,
                von Hand überschreibbar), Zinsrichtung über sechs Monate und die
                Markterwartung aus der 2-Jahres-Rendite.
              </li>
              <li>
                <strong className="text-ink-soft">Wirtschaft · 35 %:</strong> PMI Industrie
                und Dienste (über 50 positiv) und BIP zum Vorjahr.
              </li>
              <li>
                <strong className="text-ink-soft">Überraschungen · 25 %:</strong> wie
                Wachstum, Inflation und Arbeitsmarkt gegen die Erwartung ausfallen —
                jüngere und wichtige Termine zählen mehr.
              </li>
              <li>
                <strong className="text-ink-soft">{EBENEN_LABEL[3]}:</strong> Risiko-Regime,
                COT, Ereignisse — angezeigt, nicht gewertet.
              </li>
            </ol>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{ERKLAERUNG.gewichtung}</p>
          </Card>
        </div>
      </div>
          </div>
        </details>
      </Card>
    </div>
  );
}

function IdeenListe({ ideen, urteile }: {
  ideen: { paar: string; seite: string; stark: string; schwach: string; klasse: PaarKlasse | null }[];
  urteile: Record<string, import("@/lib/makro/urteil").UrteilBild>;
}) {
  return (
    <ul className="space-y-1.5">
      {ideen.map((i) => {
        const s = urteile[i.stark], w = urteile[i.schwach];
        return (
          <li key={i.paar + i.seite} className="rounded-xl bg-sand/50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-[86px] font-display font-bold text-ink">{i.paar}</span>
              <Badge tone={i.seite === "Long" ? "good" : "bad"}>{i.seite}</Badge>
              <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                {i.stark} <UrteilMarke wort={s.wort} /> gegen {i.schwach} <UrteilMarke wort={w.wort} />
              </span>
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              <span className="text-good-bright">▲</span> {s.gruende[0]?.text ?? "—"}
            </p>
            <p className="text-xs text-ink-muted">
              <span className="text-bad-bright">▼</span> {w.gruende[0]?.text ?? "—"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
