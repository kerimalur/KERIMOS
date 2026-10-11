import Link from "next/link";
import { tradingConfigured } from "@/lib/supabase/trading";
import { ladeEreignisse, ladeLaeufe, type LaborEreignis, type LaborLauf } from "@/lib/strategie/labor-laden";
import { LAUF_STANDARD } from "@/lib/strategie/lauf";
import { yahooStunden, zu4h } from "@/lib/strategie/kerzen";
import { loescheLaborLauf } from "@/lib/labor-actions";
import { LaborFormular } from "@/components/labor/formular";
import { Kurve, TradeChart } from "@/components/labor/grafik";
import { Badge, Card, CardTitle, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
// Ein Durchlauf lädt 28 Paare (Yahoo) und rechnet sie — das braucht Zeit.
export const maxDuration = 300;

/**
 * Strategie-Labor (11.10.2026).
 *
 * Kerims GVA-Strategie als feste Regel, über alle 28 Paare gerechnet
 * (src/lib/strategie). Hier sieht er jeden Durchlauf, vergleicht Einstellungen
 * und schaut sich jedes einzelne Setup als Chart an — mit Treffer, Struktur,
 * BOS, H, L, Einstieg, SL und TP, so wie die Regel es gesehen hat. Dieselben
 * Regeln stehen im Pine-Skript „GVA → BOS" (tools/tradingview/GVA-BOS.pine).
 */

type SP = { lauf?: string; ev?: string; filter?: string; paar?: string };

const STATUS: Record<string, { text: string; ton: "good" | "bad" | "warn" | "neutral" | "accent" }> = {
  tp: { text: "TP", ton: "good" },
  sl: { text: "SL", ton: "bad" },
  zeit: { text: "Zeit", ton: "warn" },
  offen: { text: "läuft", ton: "accent" },
  kein_einstieg: { text: "kein Einstieg", ton: "neutral" },
  verfallen: { text: "○ ohne BOS", ton: "neutral" },
  ungueltig: { text: "× ungültig", ton: "warn" },
};

const FILTER: { key: string; text: string; passt: (e: LaborEreignis) => boolean }[] = [
  { key: "trades", text: "Trades", passt: (e) => e.einstiegT !== null },
  { key: "tp", text: "TP", passt: (e) => e.status === "tp" },
  { key: "sl", text: "SL", passt: (e) => e.status === "sl" },
  { key: "kein_einstieg", text: "kein Einstieg", passt: (e) => e.status === "kein_einstieg" },
  { key: "verfallen", text: "ohne BOS", passt: (e) => e.status === "verfallen" },
  { key: "alle", text: "alle", passt: () => true },
];

const DATUM = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Zurich" });
const ZEIT = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
const r2 = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);

function Kachel({ titel, wert, hinweis, ton }: { titel: string; wert: string; hinweis?: string; ton?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-card px-4 py-3 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{titel}</p>
      <p className={cx("tabular mt-1 font-display text-2xl font-bold", ton === "bad" ? "text-bad-bright" : ton === "good" ? "text-good-bright" : "text-ink")}>{wert}</p>
      {hinweis && <p className="mt-0.5 text-[11px] text-ink-faint">{hinweis}</p>}
    </div>
  );
}

function einstellungText(l: LaborLauf): string {
  const e = l.einstellungen;
  return [
    `GVA ${e.gvaTol ?? 5}/${e.gvaK2 ?? 40}${e.wochen ? " + W" : ""}`,
    `Struktur ${e.strukturTf === "impuls4h" ? `Impuls ${e.impulsAtr ?? 0.75}×ATR` : (e.strukturTf ?? "chart") === "4h" ? "4h-Swing" : `${e.tf}-Swing`}`,
    `Ausführung ${e.tf}`, `BOS ${e.bos === "schluss" ? "Schluss" : "Docht"}`, `Swing ${e.swingN}`,
    e.dailyOpen ? "Daily Open" : "ohne Daily Open", `Tol. ${e.tolPips} Pips`, `Frist ${e.maxTage} T`,
    `Einstieg ${e.einstiegFib}`, `TP ${e.tpFib}`,
  ].join(" · ");
}

/** Trichter: wie viele Treffer kamen wie weit? */
function Trichter({ ev }: { ev: LaborEreignis[] }) {
  const stufen = [
    { text: "GVA-Treffer", n: ev.length },
    { text: "mit BOS", n: ev.filter((e) => e.bosT !== null).length },
    { text: "Einstieg", n: ev.filter((e) => e.einstiegT !== null).length },
    { text: "TP", n: ev.filter((e) => e.status === "tp").length },
  ];
  const max = Math.max(1, stufen[0].n);
  return (
    <div className="space-y-1.5">
      {stufen.map((s) => (
        <div key={s.text} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-ink-muted">{s.text}</span>
          <div className="h-5 flex-1 rounded bg-sand">
            <div className="h-5 rounded bg-accent/70" style={{ width: `${(s.n / max) * 100}%` }} />
          </div>
          <span className="tabular w-12 text-right font-semibold text-ink">{s.n}</span>
        </div>
      ))}
    </div>
  );
}

async function ladeChart(e: LaborEreignis, tf: "1h" | "4h") {
  try {
    const stunden = await yahooStunden(e.paar);
    const bars = tf === "4h" ? zu4h(stunden) : stunden;
    const treffer = Date.parse(e.trefferT);
    const bildung = e.bStart ? Date.parse(`${e.bStart}T00:00:00Z`) - 86_400_000 : treffer;
    const von = Math.max(treffer - 30 * 86_400_000, Math.min(treffer - (tf === "4h" ? 8 : 3) * 86_400_000, bildung));
    const endeRoh = e.ausstiegT ?? e.einstiegT ?? e.bosT ?? e.trefferT;
    const bis = Date.parse(endeRoh) + (tf === "4h" ? 5 : 2) * 86_400_000;
    return bars.filter((b) => b.t >= von && b.t <= bis);
  } catch {
    return [];
  }
}

export default async function LaborSeite({ searchParams }: { searchParams: Promise<SP> }) {
  if (!tradingConfigured()) return <Card><Empty>Trading-Datenbank nicht verbunden.</Empty></Card>;
  const sp = await searchParams;
  const { laeufe, tabelleFehlt } = await ladeLaeufe();
  if (tabelleFehlt) {
    return <Card><p className="text-sm text-bad-bright">Die Tabellen des Labors fehlen (supabase/trading/13_strategie_labor.sql).</p></Card>;
  }
  const lauf = laeufe.find((l) => l.id === sp.lauf) ?? laeufe[0] ?? null;
  const ev = lauf ? await ladeEreignisse(lauf.id) : [];
  const filter = FILTER.find((f) => f.key === sp.filter) ?? FILTER[0];
  const paare = [...new Set(ev.map((e) => e.paar))].sort();
  const liste = ev.filter((e) => filter.passt(e) && (!sp.paar || e.paar === sp.paar));
  const gewaehlt = sp.ev ? ev.find((e) => String(e.id) === sp.ev) ?? null : null;
  const bars = gewaehlt && lauf ? await ladeChart(gewaehlt, lauf.einstellungen.tf) : [];
  const trades = ev.filter((e) => e.rNetto !== null && e.ausstiegT !== null)
    .sort((a, b) => Date.parse(a.ausstiegT!) - Date.parse(b.ausstiegT!));
  const k = lauf?.kennzahlen ?? null;

  const link = (p: Partial<SP>) => {
    const q = new URLSearchParams();
    const alles = { lauf: lauf?.id, filter: sp.filter, paar: sp.paar, ev: sp.ev, ...p };
    for (const [key, v] of Object.entries(alles)) if (v) q.set(key, v);
    return `/trading/labor?${q}`;
  };

  // Je Paar: Summe R netto
  const jePaar = paare.map((p) => {
    const t = trades.filter((x) => x.paar === p);
    return { paar: p, n: t.length, r: t.reduce((s, x) => s + (x.rNetto ?? 0), 0) };
  }).filter((x) => x.n > 0).sort((a, b) => b.r - a.r);
  const maxPaar = Math.max(1, ...jePaar.map((x) => Math.abs(x.r)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Strategie-Labor</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Deine GVA-Strategie als feste Regel über alle 28 Paare: Treffer → BOS unter dem Daily Open → Fibonacci H–L,
          Einstieg 0.618, SL am H, TP −1. Einstellungen ändern, Durchlauf starten, jedes Setup als Chart prüfen.
          Dieselben Regeln zeigt das Pine-Skript „GVA → BOS“.
        </p>
      </div>

      {/* Neuer Durchlauf */}
      <Card>
        <CardTitle>Neuer Durchlauf</CardTitle>
        <div className="mt-3"><LaborFormular start={lauf?.einstellungen ?? LAUF_STANDARD} /></div>
        <p className="mt-2 text-xs text-ink-faint">
          Daten: GVA aus OANDA-Tageskerzen, BOS und Einstieg aus Yahoo-Stundenkerzen (rund 2 Jahre). Kosten werden vom Ergebnis abgezogen.
        </p>
      </Card>

      {/* Durchläufe im Vergleich */}
      <Card>
        <CardTitle>Durchläufe im Vergleich</CardTitle>
        {laeufe.length === 0 ? <Empty>Noch kein Durchlauf.</Empty> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="py-1 pr-3 font-medium">Durchlauf</th>
                  <th className="py-1 pr-3 text-right font-medium">Trades</th>
                  <th className="py-1 pr-3 text-right font-medium">TP-Quote</th>
                  <th className="py-1 pr-3 text-right font-medium">Ø R</th>
                  <th className="py-1 pr-3 text-right font-medium">Summe R</th>
                  <th className="py-1 pr-3 text-right font-medium">max. DD</th>
                  <th className="py-1 text-right font-medium">am</th>
                </tr>
              </thead>
              <tbody>
                {laeufe.map((l) => (
                  <tr key={l.id} className={cx("border-t border-line", l.id === lauf?.id && "bg-accent-tint/60")}>
                    <td className="py-1.5 pr-3">
                      <Link href={`/trading/labor?lauf=${l.id}`} className="font-medium text-ink hover:underline">{l.name ?? "ohne Name"}</Link>
                      <span className="block text-[11px] text-ink-faint">{einstellungText(l)}</span>
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right">{l.kennzahlen?.trades ?? "–"}</td>
                    <td className="tabular py-1.5 pr-3 text-right">{l.kennzahlen?.trefferquote === null || l.kennzahlen?.trefferquote === undefined ? "–" : `${Math.round(l.kennzahlen.trefferquote * 100)} %`}</td>
                    <td className={cx("tabular py-1.5 pr-3 text-right font-semibold", (l.kennzahlen?.schnittNetto ?? 0) > 0 ? "text-good-bright" : "text-bad-bright")}>{r2(l.kennzahlen?.schnittNetto)}</td>
                    <td className="tabular py-1.5 pr-3 text-right">{r2(l.kennzahlen?.rNetto, 1)}</td>
                    <td className="tabular py-1.5 pr-3 text-right">{l.kennzahlen ? `${l.kennzahlen.maxDrawdownR} R` : "–"}</td>
                    <td className="py-1.5 text-right text-xs text-ink-muted">{DATUM.format(new Date(l.erstelltAm))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {lauf && (
        <>
          {/* Kopf des gewählten Laufs */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-ink">{lauf.name}</h2>
              <p className="text-xs text-ink-muted">
                {einstellungText(lauf)} · Fenster {lauf.fenster?.von ?? "?"} bis {lauf.fenster?.bis ?? "?"}
                {lauf.dauerS ? ` · ${lauf.dauerS} s` : ""}
              </p>
              {lauf.fehler && <p className="mt-1 text-xs text-warn">Hinweise: {lauf.fehler}</p>}
            </div>
            <form action={loescheLaborLauf}>
              <input type="hidden" name="id" value={lauf.id} />
              <button className="text-xs text-ink-faint hover:text-bad-bright">Durchlauf löschen</button>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kachel titel="Trades" wert={String(k?.trades ?? 0)} hinweis={`${k?.tp ?? 0} TP · ${k?.sl ?? 0} SL`} />
            <Kachel titel="TP-Quote" wert={k?.trefferquote === null || k?.trefferquote === undefined ? "–" : `${Math.round(k.trefferquote * 100)} %`} hinweis={`Gewinn bei TP ≈ ${((lauf.einstellungen.einstiegFib - lauf.einstellungen.tpFib) / (1 - lauf.einstellungen.einstiegFib)).toFixed(2)} R`} />
            <Kachel titel="Ø R netto" wert={r2(k?.schnittNetto)} ton={(k?.schnittNetto ?? 0) > 0 ? "good" : "bad"} hinweis={k?.t === null || k?.t === undefined ? undefined : `t = ${k.t} (ab 3 belastbar)`} />
            <Kachel titel="Summe R netto" wert={r2(k?.rNetto, 1)} ton={(k?.rNetto ?? 0) > 0 ? "good" : "bad"} hinweis={k?.profitFaktor ? `Profitfaktor ${k.profitFaktor}` : undefined} />
            <Kachel titel="Max. Drawdown" wert={`${k?.maxDrawdownR ?? 0} R`} hinweis={`längste Verlustserie ${k?.serieVerluste ?? 0}`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardTitle>Vom Treffer zum TP</CardTitle>
              <div className="mt-3"><Trichter ev={ev} /></div>
              <p className="mt-2 text-xs text-ink-faint">
                {lauf.zaehler?.verworfen ?? 0} Treffer vom Nachbar-Filter verworfen (zu früh nach der Bildung).
              </p>
            </Card>
            <Card>
              <CardTitle>Kurve (Summe R netto)</CardTitle>
              <div className="mt-2"><Kurve punkte={trades.map((t) => t.rNetto ?? 0)} /></div>
            </Card>
          </div>

          <Card>
            <CardTitle>Je Paar</CardTitle>
            {jePaar.length === 0 ? <Empty>Keine Trades.</Empty> : (
              <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {jePaar.map((p) => (
                  <Link key={p.paar} href={link({ paar: sp.paar === p.paar ? undefined : p.paar, ev: undefined })}
                    className={cx("flex items-center gap-2 rounded px-1 text-sm hover:bg-sand", sp.paar === p.paar && "bg-accent-tint/60")}>
                    <span className="w-16 shrink-0 font-medium text-ink">{p.paar}</span>
                    <div className="relative h-3 flex-1">
                      <div className="absolute left-1/2 top-0 h-3 w-px bg-line" />
                      <div className={cx("absolute top-0 h-3 rounded", p.r >= 0 ? "bg-good-bright/70" : "bg-bad-bright/70")}
                        style={p.r >= 0 ? { left: "50%", width: `${(p.r / maxPaar) * 50}%` } : { right: "50%", width: `${(-p.r / maxPaar) * 50}%` }} />
                    </div>
                    <span className="tabular w-20 text-right text-xs text-ink-muted">{r2(p.r, 1)} R · {p.n}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Gewähltes Setup als Chart */}
          {gewaehlt && (
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{gewaehlt.paar} · {gewaehlt.seite === "short" ? "Short" : "Long"}</CardTitle>
                <Badge tone={STATUS[gewaehlt.status]?.ton ?? "neutral"}>{STATUS[gewaehlt.status]?.text ?? gewaehlt.status}</Badge>
                {gewaehlt.rNetto !== null && <span className={cx("text-sm font-semibold", gewaehlt.rNetto > 0 ? "text-good-bright" : "text-bad-bright")}>{r2(gewaehlt.rNetto)} R netto</span>}
                <Link href={link({ ev: undefined })} className="ml-auto text-xs text-ink-muted hover:text-ink">schliessen ×</Link>
              </div>
              <div className="mt-2"><TradeChart bars={bars} e={gewaehlt} /></div>
              <ol className="mt-3 grid gap-2 text-xs sm:grid-cols-5">
                {[
                  { t: "GVA gebildet", w: gewaehlt.bStart ? `${gewaehlt.gvaTf}-Kerze ${DATUM.format(new Date(`${gewaehlt.bStart}T12:00:00Z`))}${gewaehlt.bEnde && gewaehlt.bEnde !== gewaehlt.bStart ? ` – ${DATUM.format(new Date(`${gewaehlt.bEnde}T12:00:00Z`))}` : ""}` : "–", z: `Level ${gewaehlt.level.toFixed(gewaehlt.paar.endsWith("JPY") ? 3 : 5)}` },
                  { t: "Treffer", w: ZEIT.format(new Date(gewaehlt.trefferT)), z: "Setup beginnt" },
                  { t: "BOS", w: gewaehlt.bosT ? ZEIT.format(new Date(gewaehlt.bosT)) : "–", z: gewaehlt.struktur === null ? "" : `Struktur ${gewaehlt.struktur.toFixed(gewaehlt.paar.endsWith("JPY") ? 3 : 5)}` },
                  { t: "Einstieg", w: gewaehlt.einstiegT ? ZEIT.format(new Date(gewaehlt.einstiegT)) : "–", z: gewaehlt.einstieg === null ? "" : `${gewaehlt.einstieg.toFixed(gewaehlt.paar.endsWith("JPY") ? 3 : 5)} · Risiko ${gewaehlt.risikoPips?.toFixed(1) ?? "–"} Pips` },
                  { t: "Ausgang", w: gewaehlt.ausstiegT ? ZEIT.format(new Date(gewaehlt.ausstiegT)) : "–", z: STATUS[gewaehlt.status]?.text ?? gewaehlt.status },
                ].map((s, i) => (
                  <li key={s.t} className="rounded-xl border border-line bg-sand/50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{i + 1}. {s.t}</p>
                    <p className="mt-0.5 font-semibold text-ink">{s.w}</p>
                    {s.z && <p className="text-ink-muted">{s.z}</p>}
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-ink-faint">Zum Gegenprüfen: in TradingView {gewaehlt.paar}, OANDA, Wiedergabe ab dem Treffer, mit „GVA → BOS“.</p>
            </Card>
          )}

          {/* Liste */}
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Setups ({liste.length})</CardTitle>
              <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
                {FILTER.map((f) => (
                  <Link key={f.key} href={link({ filter: f.key, ev: undefined })}
                    className={cx("rounded-full border px-2.5 py-1", f.key === filter.key ? "border-accent bg-accent-tint text-ink" : "border-line text-ink-muted hover:text-ink")}>
                    {f.text}
                  </Link>
                ))}
                {sp.paar && <Link href={link({ paar: undefined })} className="rounded-full border border-accent px-2.5 py-1 text-ink">{sp.paar} ×</Link>}
              </div>
            </div>
            {liste.length === 0 ? <Empty>Nichts in dieser Auswahl.</Empty> : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted">
                      <th className="py-1 pr-3 font-medium">Treffer</th>
                      <th className="py-1 pr-3 font-medium">Paar</th>
                      <th className="py-1 pr-3 font-medium">GVA gebildet</th>
                      <th className="py-1 pr-3 font-medium">Seite</th>
                      <th className="py-1 pr-3 font-medium">Ausgang</th>
                      <th className="py-1 pr-3 text-right font-medium">Risiko</th>
                      <th className="py-1 text-right font-medium">R netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...liste].reverse().slice(0, 300).map((e) => (
                      <tr key={e.id} className={cx("border-t border-line hover:bg-sand", String(e.id) === sp.ev && "bg-accent-tint/60")}>
                        <td className="py-1.5 pr-3"><Link href={link({ ev: String(e.id) })} className="text-ink hover:underline">{ZEIT.format(new Date(e.trefferT))}</Link></td>
                        <td className="py-1.5 pr-3 font-medium">{e.paar}</td>
                        <td className="py-1.5 pr-3 text-xs text-ink-muted">{e.bStart ? `${e.gvaTf} ${DATUM.format(new Date(`${e.bStart}T12:00:00Z`))}` : "–"}</td>
                        <td className="py-1.5 pr-3 text-ink-muted">{e.seite === "short" ? "Short" : "Long"}</td>
                        <td className="py-1.5 pr-3"><Badge tone={STATUS[e.status]?.ton ?? "neutral"}>{STATUS[e.status]?.text ?? e.status}</Badge></td>
                        <td className="tabular py-1.5 pr-3 text-right text-ink-muted">{e.risikoPips === null ? "–" : `${e.risikoPips.toFixed(0)} P`}</td>
                        <td className={cx("tabular py-1.5 text-right font-semibold", (e.rNetto ?? 0) > 0 ? "text-good-bright" : e.rNetto === null ? "text-ink-faint" : "text-bad-bright")}>{r2(e.rNetto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
