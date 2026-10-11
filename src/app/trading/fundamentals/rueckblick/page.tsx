import Link from "next/link";
import { tradingConfigured } from "@/lib/supabase/trading";
import { ladeRueckblick, standardWoche, type Ampel } from "@/lib/makro/rueckblick";
import { montagVon } from "@/lib/makro/wochenideen-rechnen";
import { fmtAbweichung, fmtWert, fmtZ } from "@/lib/makro/releases";
import { Prozent } from "@/components/makro/rueckrechnung-teile";
import { Badge, Card, CardTitle, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Wochenrückblick (11.10.2026) — der Sonntags-Blick.
 *
 * Entstanden aus Kerims Wunsch am Sonntag, 11.10.: „Wie hat das Modell
 * performt, welche News kamen, wie hat der Markt reagiert, kann ich die
 * Währungen für nächste Woche nutzen?" Rechnen steht in lib/makro/rueckblick.ts.
 */

const TAG = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" });
const ZEIT = new Intl.DateTimeFormat("de-CH", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
const tag = (iso: string) => TAG.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

const PUNKT: Record<Ampel, string> = { gut: "bg-good-bright", warn: "bg-warn", schlecht: "bg-bad-bright" };
const TONE: Record<Ampel, "good" | "warn" | "bad"> = { gut: "good", warn: "warn", schlecht: "bad" };
const WORT: Record<Ampel, string> = { gut: "aktuell", warn: "mit Vorsicht", schlecht: "veraltet" };

function Punkt({ a }: { a: Ampel }) {
  return <span className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", PUNKT[a])} aria-hidden />;
}

function alterText(t: number | null): string {
  if (t === null) return "kein Stand";
  if (t < 1) return "heute";
  return `vor ${Math.round(t)} Tag${Math.round(t) === 1 ? "" : "en"}`;
}

export default async function RueckblickSeite({
  searchParams,
}: { searchParams: Promise<{ woche?: string }> }) {
  if (!tradingConfigured()) {
    return <Card><Empty>Trading-Datenbank nicht verbunden.</Empty></Card>;
  }
  const { woche: param } = await searchParams;
  const gewaehlt = param && /^\d{4}-\d{2}-\d{2}$/.test(param)
    ? montagVon(new Date(`${param}T12:00:00Z`)) : standardWoche();
  const r = await ladeRueckblick(gewaehlt);

  const vorher = new Date(Date.parse(`${r.woche}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const nachher = new Date(Date.parse(`${r.woche}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const nachherOk = Date.parse(`${nachher}T00:00:00Z`) <= Date.now();

  const gemessen = r.ideen.filter((i) => i.prozent !== null);
  const treffer = gemessen.filter((i) => (i.prozent ?? 0) > 0).length;
  const schnitt = gemessen.length
    ? Math.round((gemessen.reduce((s, i) => s + (i.prozent ?? 0), 0) / gemessen.length) * 1000) / 1000 : null;

  const newsMess = r.news.filter((n) => n.inRichtung !== null);
  const newsTreffer = newsMess.filter((n) => n.inRichtung).length;
  const schlecht = r.daten.filter((d) => d.ampel === "schlecht");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Wochenrückblick</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Woche {tag(r.woche)} – {tag(r.wocheEnde)}: wie aktuell die Daten sind, wie das Modell lag,
            welche News zählten und ob die Währungen für nächste Woche taugen.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-accent-soft">
          <Link href={`/trading/fundamentals/rueckblick?woche=${vorher}`} className="hover:underline">← Woche davor</Link>
          {nachherOk && <Link href={`/trading/fundamentals/rueckblick?woche=${nachher}`} className="hover:underline">Woche danach →</Link>}
          <Link href="/trading/fundamentals" className="hover:underline">Terminal</Link>
        </div>
      </div>

      {/* 1 · Datenalter */}
      <Card area="trading">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">1 · Wie aktuell sind die Daten?</CardTitle>
          {schlecht.length > 0 && (
            <Badge tone="bad">{schlecht.length} veraltet: {schlecht.map((d) => d.name.split(" (")[0]).join(", ")}</Badge>
          )}
        </div>
        <ul className="space-y-2">
          {r.daten.map((d) => (
            <li key={d.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-sand/40 px-3 py-2">
              <Punkt a={d.ampel} />
              <span className="min-w-[210px] text-sm font-medium text-ink">{d.name}</span>
              <span className="text-xs text-ink-muted">{d.stand ? `${tag(d.stand)} · ${alterText(d.alterTage)}` : "kein Stand"}</span>
              <span className="w-full pl-[22px] text-[11px] text-ink-faint sm:ml-auto sm:w-auto sm:max-w-md sm:pl-0 sm:text-right">{d.hinweis}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* 2 · Modell */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">2 · Wie wäre die Woche mit dem Modell gelaufen?</CardTitle>
          {gemessen.length > 0 && (
            <span className="ml-auto text-[11px] text-ink-faint">
              {treffer} von {gemessen.length} in Richtung der Idee · Schnitt {schnitt !== null && schnitt > 0 ? "+" : ""}{schnitt} %
            </span>
          )}
        </div>
        {r.ideenHinweis && <p className="mb-3 rounded-xl bg-warn-tint/50 px-3 py-2 text-sm text-ink-soft">{r.ideenHinweis}</p>}
        {r.ideen.length > 0 && (
          <ul className="space-y-2">
            {[...r.ideen].sort((x, y) => (y.prozent ?? -99) - (x.prozent ?? -99)).map(({ idee, prozent, pips }) => (
              <li key={idee.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-sand/40 px-3 py-2">
                <span className="w-[86px] font-display font-bold text-ink">{idee.paar}</span>
                <Badge tone={idee.seite === "long" ? "good" : "bad"}>{idee.seite === "long" ? "Long" : "Short"}</Badge>
                <Badge tone={idee.klasse === "A" ? "accent" : "warn"}>{idee.klasse === "A" ? "A" : "B"}</Badge>
                <span className="text-xs text-ink-muted">{idee.stark} gegen {idee.schwach}</span>
                <span className="ml-auto text-xs"><Prozent p={prozent} pips={pips} /></span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-ink-faint">
          Gemessen von der Montagseröffnung bis zum Freitagsschluss, in Prozent in Richtung der Idee.
          Eine einzelne Woche beweist nichts — die Sammlung steht unter „Wochenaussicht".
        </p>
      </Card>

      {/* 3 · News */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">3 · Wichtige News und die Reaktion</CardTitle>
          {newsMess.length > 0 && (
            <span className="ml-auto text-[11px] text-ink-faint">
              Währung ging in {newsTreffer} von {newsMess.length} Fällen in Richtung der Überraschung
            </span>
          )}
        </div>
        {r.news.length === 0 ? (
          <Empty>Keine Veröffentlichungen mit Ist-Wert und Abweichung in dieser Woche.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                <th className="pb-2 font-medium">Zeit</th>
                <th className="pb-2 font-medium">Währung · Zahl</th>
                <th className="pb-2 text-right font-medium">Erwartet</th>
                <th className="pb-2 text-right font-medium">Ist</th>
                <th className="pb-2 text-right font-medium">Überraschung</th>
                <th className="pb-2 text-right font-medium">Reaktion am Tag</th>
              </tr>
            </thead>
            <tbody>
              {r.news.map(({ release: x, paar, reaktion, inRichtung }) => (
                <tr key={x.id} className="border-t border-line/60 align-top">
                  <td className="py-1.5 pr-2 text-xs text-ink-muted">{ZEIT.format(new Date(x.event_time))}</td>
                  <td className="py-1.5 pr-2 text-xs"><span className="font-display font-bold text-ink">{x.ccy}</span> {x.titel}</td>
                  <td className="tabular py-1.5 text-right text-xs text-ink-muted">{fmtWert(x.erwartung, x.einheit)}</td>
                  <td className="tabular py-1.5 text-right text-xs text-ink">{fmtWert(x.ist, x.einheit)}</td>
                  <td className="py-1.5 text-right text-xs">
                    <Badge tone={(x.z ?? 0) > 0 ? "good" : "bad"} title={`Abweichung ${fmtAbweichung(x.abweichung, x.einheit)}`}>{fmtZ(x.z)}</Badge>
                  </td>
                  <td className="py-1.5 text-right text-xs">
                    {reaktion === null ? <span className="text-ink-faint">—</span> : (
                      <span title={`${x.ccy} gemessen an ${paar}`} className={cx("tabular", inRichtung ? "text-good-bright" : "text-bad-bright")}>
                        {reaktion > 0 ? "+" : ""}{reaktion} % {inRichtung ? "✓" : "✗"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] text-ink-faint">
          Überraschung positiv = besser als erwartet für die Währung (bei Arbeitslosigkeit schon umgedreht).
          Reaktion = Tageskerze des Messpaars am Veröffentlichungstag (z.B. EUR an EURUSD, JPY an USDJPY).
          Die Tageskerze enthält auch andere News desselben Tages — ein ✗ heisst nicht, dass die Zahl nichts bewirkt hat.
        </p>
      </Card>

      {/* 4 · Nächste Woche */}
      <Card>
        <CardTitle>4 · Taugen die Währungen für nächste Woche?</CardTitle>
        <ul className="space-y-2">
          {r.naechste
            .sort((x, y) => (y.urteil.score ?? -9) - (x.urteil.score ?? -9))
            .map((n) => (
              <li key={n.ccy} className="rounded-xl bg-sand/40 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Punkt a={n.ampel} />
                  <span className="w-10 font-display font-bold text-ink">{n.ccy}</span>
                  <Badge tone={n.urteil.ton === "gut" ? "good" : n.urteil.ton === "schlecht" ? "bad" : "neutral"}>{n.urteil.wort}</Badge>
                  <Badge tone={TONE[n.ampel]}>{WORT[n.ampel]}</Badge>
                  <span className="text-xs text-ink-muted">{n.grund}</span>
                </div>
                {n.urteil.nachricht && (
                  <p className="mt-1 pl-[22px] text-xs text-ink-muted">
                    Auffälligste News: {n.urteil.nachricht.titel} ({tag(n.urteil.nachricht.event_time)}) · Ist {fmtWert(n.urteil.nachricht.ist, n.urteil.nachricht.einheit)}
                    {" "}gegen erwartet {fmtWert(n.urteil.nachricht.erwartung, n.urteil.nachricht.einheit)}
                  </p>
                )}
                {n.termine.length > 0 && (
                  <p className="mt-0.5 pl-[22px] text-[11px] text-ink-faint">
                    Ansteht: {n.termine.map((t) => `${t.titel} (${tag(t.event_time)})`).join(" · ")}
                  </p>
                )}
              </li>
            ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-faint">
          Die Ampel prüft nur, ob das Urteil auf vollständigen Daten steht — sie sagt nichts darüber, ob es richtig liegt.
          Das zeigt erst die Wochenaussicht über viele Wochen.
        </p>
      </Card>
    </div>
  );
}
