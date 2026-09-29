import Link from "next/link";
import { tradingConfigured } from "@/lib/supabase/trading";
import { ladeWochenideen, type WochenIdee } from "@/lib/makro/wochenideen";
import { montagVon } from "@/lib/makro/wochenideen-rechnen";
import { wochenideenJetzt } from "@/lib/wochenideen-actions";
import { EinschaetzungForm } from "@/components/makro/einschaetzung-form";
import { Info } from "@/components/makro/info";
import { Badge, Card, CardTitle, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Wochenaussicht (29.09.2026).
 *
 * Oben die Ideen dieser Woche mit Kerims Einschätzung, darunter die
 * Auswertung: wie sind die Ideen nach 1, 2 und 3 Wochen gelaufen — getrennt
 * nach Klasse (A stark gegen schwach, B stark gegen neutral), nach Kerims
 * Einschätzung und nach Paar. Hauptmass sind 2 Wochen.
 *
 * Gemessen in Prozent in Richtung der Idee, weil Pips zwischen Paaren nicht
 * vergleichbar sind (ein Pip GBPJPY ist etwas anderes als ein Pip EURCHF).
 * Die Pips stehen daneben, zum Einordnen.
 */

const TAG = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
const wocheText = (w: string) => `Woche ab ${TAG.format(new Date(`${w}T00:00:00Z`))}`;

function Prozent({ p, pips }: { p: number | null; pips: number | null }) {
  if (p === null) return <span className="text-ink-faint">—</span>;
  return (
    <span className={cx("tabular font-mono", p > 0 ? "text-good-bright" : p < 0 ? "text-bad-bright" : "text-ink-soft")}
      title={pips === null ? undefined : `${pips > 0 ? "+" : ""}${pips} Pips`}>
      {p > 0 ? "+" : ""}{p.toFixed(2)} %
    </span>
  );
}

interface Gruppe { label: string; n: number; treffer: number | null; schnitt: number | null }

function gruppe(label: string, ideen: WochenIdee[]): Gruppe {
  const mit = ideen.filter((i) => i.prozent_2w !== null);
  const treffer = mit.filter((i) => i.prozent_2w! > 0).length;
  return {
    label, n: mit.length,
    treffer: mit.length ? Math.round((treffer / mit.length) * 100) : null,
    schnitt: mit.length ? mit.reduce((s, i) => s + i.prozent_2w!, 0) / mit.length : null,
  };
}

function GruppenKarten({ gruppen }: { gruppen: Gruppe[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {gruppen.map((g) => (
        <div key={g.label} className="rounded-xl bg-sand/60 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">{g.label}</p>
          <p className="tabular mt-1 font-mono text-lg text-ink">
            {g.treffer === null ? "—" : `${g.treffer} %`}
            <span className="ml-2 text-xs text-ink-muted">aufgegangen</span>
          </p>
          <p className="text-[11px] text-ink-muted">
            {g.n} gemessen · Schnitt {g.schnitt === null ? "—" : `${g.schnitt > 0 ? "+" : ""}${g.schnitt.toFixed(2)} %`}
          </p>
        </div>
      ))}
    </div>
  );
}

function IdeeKarte({ i, mitForm }: { i: WochenIdee; mitForm: boolean }) {
  return (
    <li className={cx("rounded-xl px-3 py-2.5", i.klasse === "A" ? "bg-sand/50" : "bg-warn-tint/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-[86px] font-display font-bold text-ink">{i.paar}</span>
        <Badge tone={i.seite === "long" ? "good" : "bad"}>{i.seite === "long" ? "Long" : "Short"}</Badge>
        <Badge tone={i.klasse === "A" ? "accent" : "warn"}>{i.klasse === "A" ? "A · stark/schwach" : "B · mit Vorsicht"}</Badge>
        <span className="text-xs text-ink-muted">
          {i.stark} {i.urteil?.stark.wort ?? ""} gegen {i.schwach} {i.urteil?.schwach.wort ?? ""}
        </span>
        <span className="ml-auto flex gap-3 text-xs">
          <span className="text-ink-faint">1W</span><Prozent p={i.prozent_1w} pips={i.pips_1w} />
          <span className="text-ink-faint">2W</span><Prozent p={i.prozent_2w} pips={i.pips_2w} />
          <span className="text-ink-faint">3W</span><Prozent p={i.prozent_3w} pips={i.pips_3w} />
        </span>
      </div>
      {i.urteil && (
        <div className="mt-1.5 space-y-0.5">
          {i.urteil.stark.gruende[0] && <p className="text-xs text-ink-muted"><span className="text-good-bright">▲</span> {i.stark}: {i.urteil.stark.gruende[0]}</p>}
          {i.urteil.schwach.gruende[0] && <p className="text-xs text-ink-muted"><span className="text-bad-bright">▼</span> {i.schwach}: {i.urteil.schwach.gruende[0]}</p>}
        </div>
      )}
      {mitForm
        ? <EinschaetzungForm id={i.id} wert={i.einschaetzung} notiz={i.notiz} />
        : (i.einschaetzung || i.notiz) && (
          <p className="mt-1.5 text-[11px] text-ink-faint">
            Deine Einschätzung: {i.einschaetzung === "zustimmen" ? "stimme zu" : i.einschaetzung ?? "—"}
            {i.notiz ? ` · ${i.notiz}` : ""}
          </p>
        )}
    </li>
  );
}

export default async function WochenideenSeite() {
  if (!tradingConfigured()) {
    return <Card><Empty>Trading-Datenbank nicht verbunden.</Empty></Card>;
  }
  const alle = await ladeWochenideen();
  const diese = montagVon(new Date());
  const jetzt = alle.filter((i) => i.woche === diese);
  const frueher = alle.filter((i) => i.woche < diese);

  const nachKlasse = [gruppe("Klasse A · stark gegen schwach", alle.filter((i) => i.klasse === "A")),
    gruppe("Klasse B · stark gegen neutral", alle.filter((i) => i.klasse === "B")),
    gruppe("Alle Ideen", alle)];
  const nachEinschaetzung = [gruppe("Du: stimme zu", alle.filter((i) => i.einschaetzung === "zustimmen")),
    gruppe("Du: Zweifel", alle.filter((i) => i.einschaetzung === "zweifel")),
    gruppe("Du: dagegen", alle.filter((i) => i.einschaetzung === "dagegen"))];
  const gemessen = alle.filter((i) => i.prozent_2w !== null).length;
  const paare = [...new Set(alle.map((i) => i.paar))]
    .map((p) => gruppe(p, alle.filter((i) => i.paar === p)))
    .filter((g) => g.n > 0)
    .sort((a, b) => (b.schnitt ?? 0) - (a.schnitt ?? 0));
  const wochen = [...new Set(frueher.map((i) => i.woche))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Wochenaussicht</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Jeden Montag die Paar-Ideen aus dem Terminal, festgehalten — und danach
            gemessen, wie sie nach 1, 2 und 3 Wochen standen. Hauptmass: 2 Wochen.
          </p>
        </div>
        <Link href="/trading/fundamentals" className="text-xs text-accent-soft hover:underline">← Terminal</Link>
      </div>

      <Card area="trading">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">{wocheText(diese)}</CardTitle>
          <Info titel="Wie gemessen wird">
            Einstieg zur Eröffnung der Montagskerze, Ausstieg zum Schluss am Freitag
            nach 1, 2 und 3 Wochen. Plus heisst: das Paar lief in Richtung der Idee.
            Die Pips stehen im Tooltip — verglichen wird in Prozent, weil Pips
            zwischen Paaren nicht vergleichbar sind.
          </Info>
        </div>
        {jetzt.length === 0 ? (
          <div className="space-y-3">
            <Empty>
              Für diese Woche sind noch keine Ideen festgehalten. Das passiert
              automatisch beim ersten täglichen Lauf ab Montag.
            </Empty>
            <form action={wochenideenJetzt}>
              <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-on">
                Jetzt festhalten
              </button>
            </form>
          </div>
        ) : (
          <ul className="space-y-2">
            {jetzt.map((i) => <IdeeKarte key={i.id} i={i} mitForm />)}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Auswertung nach 2 Wochen</CardTitle>
          <span className="ml-auto text-[11px] text-ink-faint">
            {gemessen} Idee{gemessen === 1 ? "" : "n"} gemessen{gemessen < 30 ? " — unter 30 ist jeder Unterschied noch Zufall" : ""}
          </span>
        </div>
        {gemessen === 0 ? (
          <p className="text-sm text-ink-muted">
            Noch nichts gemessen — die ersten Ergebnisse nach 2 Wochen gibt es zwei
            Wochen nach der ersten festgehaltenen Woche.
          </p>
        ) : (
          <div className="space-y-4">
            <GruppenKarten gruppen={nachKlasse} />
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Dein Bauchgefühl gegen das Urteil</p>
              <GruppenKarten gruppen={nachEinschaetzung} />
              <p className="mt-2 text-[11px] text-ink-faint">
                Laufen die Ideen, bei denen du „dagegen" warst, schlechter als die, denen du zustimmst,
                liegt dein Gefühl besser als das Urteil allein.
              </p>
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-accent-soft">Je Paar ({paare.length})</summary>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                    <th className="pb-2 font-medium">Paar</th>
                    <th className="pb-2 text-right font-medium">Gemessen</th>
                    <th className="pb-2 text-right font-medium">Aufgegangen</th>
                    <th className="pb-2 text-right font-medium">Schnitt 2W</th>
                  </tr>
                </thead>
                <tbody>
                  {paare.map((g) => (
                    <tr key={g.label} className="border-t border-line/60">
                      <td className="py-1.5 font-display text-xs font-bold text-ink">{g.label}</td>
                      <td className="tabular py-1.5 text-right text-xs text-ink-muted">{g.n}</td>
                      <td className="tabular py-1.5 text-right text-xs text-ink-soft">{g.treffer === null ? "—" : `${g.treffer} %`}</td>
                      <td className="py-1.5 text-right text-xs"><Prozent p={g.schnitt} pips={null} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}
      </Card>

      {wochen.map((w) => (
        <Card key={w}>
          <CardTitle>{wocheText(w)}</CardTitle>
          <ul className="space-y-2">
            {frueher.filter((i) => i.woche === w).map((i) => <IdeeKarte key={i.id} i={i} mitForm={false} />)}
          </ul>
        </Card>
      ))}
    </div>
  );
}
