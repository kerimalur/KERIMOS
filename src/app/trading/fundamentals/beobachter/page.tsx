import Link from "next/link";
import { tradingConfigured } from "@/lib/supabase/trading";
import { ladeBeobachter, type Ampel } from "@/lib/beobachter/laden";
import { HORIZONTE, HORIZONT_NAME, KOSTEN_PROZENT, STATUS_TEXT, istHorizont, kategorieName, type GruppeErgebnis, type Horizont, type Status } from "@/lib/beobachter/rechnen";
import { URTEIL_TEXT, type Urteil } from "@/lib/beobachter/hypothesen";
import { Badge, Card, CardTitle, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fundamentaler Beobachter (11.10.2026) — der passive Auswerter.
 *
 * Läuft im Hintergrund (Cron → /api/makro-sync?job=releases), misst nach jeder
 * Veröffentlichung, wie das Messpaar der Währung reagiert hat, und zeigt:
 * 1. ob der Beobachter läuft, 2. was er bisher herausgefunden hat — mit einer
 * strengen Statusstufe, damit Zufall nicht als Erkenntnis durchgeht.
 */

const PUNKT: Record<Ampel, string> = { gut: "bg-good-bright", warn: "bg-warn", schlecht: "bg-bad-bright" };
const STATUS_TONE: Record<Status, "good" | "warn" | "neutral" | "bad"> = { stabil: "good", hinweis: "warn", zufall: "neutral", zuwenig: "neutral" };
const URTEIL_TONE: Record<Urteil, "good" | "warn" | "neutral" | "bad"> = { bestaetigt: "good", widerlegt: "bad", offen: "warn" };
const ZEIT = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
const TAG = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Zurich" });

const vorzeichen = (x: number, d = 2) => `${x > 0 ? "+" : ""}${x.toFixed(d)} %`;

function Punkt({ a }: { a: Ampel }) {
  return <span className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", PUNKT[a])} aria-hidden />;
}

function alterWort(stunden: number | null): string {
  if (stunden === null) return "noch nie";
  if (stunden < 1) return "vor wenigen Minuten";
  if (stunden < 48) return `vor ${Math.round(stunden)} Std.`;
  return `vor ${Math.round(stunden / 24)} Tagen`;
}

/** Balken um die Nulllinie: rechts = Markt folgt der Überraschung. */
function Balken({ wert, max }: { wert: number; max: number }) {
  const breite = Math.min(50, (Math.abs(wert) / max) * 50);
  return (
    <div className="relative h-2 w-full rounded bg-sand" aria-hidden>
      <div className="absolute left-1/2 top-0 h-full w-px bg-ink-faint" />
      <div
        className={cx("absolute top-0 h-full rounded", wert >= 0 ? "bg-good-bright" : "bg-bad-bright")}
        style={wert >= 0 ? { left: "50%", width: `${breite}%` } : { right: "50%", width: `${breite}%` }}
      />
    </div>
  );
}

function Tabelle({ gruppen, titel }: { gruppen: GruppeErgebnis[]; titel: string }) {
  if (gruppen.length === 0) return <Empty>Noch keine Fälle.</Empty>;
  const max = Math.max(0.05, ...gruppen.map((g) => Math.abs(g.mittel)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th className="py-1 pr-3 font-medium">{titel}</th>
            <th className="py-1 pr-3 text-right font-medium">Fälle</th>
            <th className="w-40 py-1 pr-3 font-medium">Ø Bewegung</th>
            <th className="py-1 pr-3 text-right font-medium">Trefferquote</th>
            <th className="py-1 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {gruppen.map((g) => (
            <tr key={g.schluessel} className="border-t border-line">
              <td className="py-1.5 pr-3 text-ink">{g.titel}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">{g.n}</td>
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-2">
                  <div className="w-24"><Balken wert={g.mittel} max={max} /></div>
                  <span className="tabular-nums text-xs text-ink-muted">{vorzeichen(g.mittel)}</span>
                </div>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">{g.treffer === null ? "–" : `${Math.round(g.treffer * 100)} %`}</td>
              <td className="py-1.5 text-right"><Badge tone={STATUS_TONE[g.status]}>{STATUS_TEXT[g.status]}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function BeobachterSeite({ searchParams }: { searchParams: Promise<{ h?: string; z?: string }> }) {
  if (!tradingConfigured()) return <Card><Empty>Trading-Datenbank nicht verbunden.</Empty></Card>;
  const p = await searchParams;
  const h: Horizont = istHorizont(p.h) ? p.h : "1d";
  const minZ = p.z === "2" ? 2 : 1;
  const s = await ladeBeobachter(h, minZ);

  if (s.tabelleFehlt) {
    return (
      <Card>
        <p className="text-sm text-bad-bright">Die Tabellen des Beobachters fehlen (supabase/trading/12_beobachter.sql).</p>
      </Card>
    );
  }

  const laeuft = s.lauf.ampel !== "schlecht" && !s.lauf.fehler && s.kurse.ampel !== "schlecht";
  const matrixKategorien = ["wachstum", "inflation", "arbeit", "stimmung", "sonstiges"];
  const waehrungen = Object.keys(s.matrix).sort();
  const maxMatrix = Math.max(0.05, ...waehrungen.flatMap((c) => Object.values(s.matrix[c]).map((g) => Math.abs(g.mittel))));
  const link = (hh: Horizont, zz: number) => `?h=${hh}&z=${zz}`;
  const bestaetigt = s.pruefstand.filter((x) => x.urteil === "bestaetigt").length;
  const widerlegt = s.pruefstand.filter((x) => x.urteil === "widerlegt").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-bold text-ink">Beobachter</h1>
            <Badge tone={laeuft ? "good" : "bad"}>{laeuft ? "läuft" : "läuft nicht richtig"}</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Misst nach jeder Veröffentlichung, wie der Markt reagiert hat, und prüft, ob daraus ein Muster wird.
            Nichts davon ist ein Signal, solange der Status nicht „stabil" ist.
          </p>
        </div>
        <Link href="/trading/fundamentals/rueckblick" className="text-xs text-accent-soft hover:underline">Wochenrückblick ↗</Link>
      </div>

      {/* Läuft er? */}
      <Card>
        <CardTitle>Läuft er?</CardTitle>
        <div className="mt-2 grid gap-3 text-sm md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2"><Punkt a={s.lauf.ampel} /><span className="font-medium text-ink">Letzter Lauf</span></div>
            <p className="mt-0.5 text-ink-muted">
              {s.lauf.gelaufen ? `${alterWort(s.lauf.alterStunden)} (${ZEIT.format(new Date(s.lauf.gelaufen))})` : "noch nie gelaufen"}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2"><Punkt a={s.kurse.ampel} /><span className="font-medium text-ink">Kurse</span></div>
            <p className="mt-0.5 text-ink-muted">
              {s.kurse.bis ? `bis ${TAG.format(new Date(`${s.kurse.bis}T12:00:00Z`))}` : "kein Stand"}
              {s.kurse.ampel === "schlecht" ? " – ohne frische Kurse bleiben neue Ereignisse offen" : ""}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2"><Punkt a={s.ereignisse > 0 ? "gut" : "schlecht"} /><span className="font-medium text-ink">Ereignisse</span></div>
            <p className="mt-0.5 text-ink-muted">
              {s.ereignisse} gemessen, {s.vollGemessen} über 5 Tage, {s.offen} offen
              {s.neuLetzterLauf > 0 ? `, ${s.neuLetzterLauf} neu im letzten Lauf` : ""}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2"><Punkt a="gut" /><span className="font-medium text-ink">Zeitraum</span></div>
            <p className="mt-0.5 text-ink-muted">
              {s.ersterTag ? `${TAG.format(new Date(s.ersterTag))} bis ${TAG.format(new Date(s.letzterTag ?? s.ersterTag))}` : "–"}
            </p>
          </div>
        </div>
        {s.lauf.fehler && <p className="mt-2 text-sm text-bad-bright">Fehler im letzten Lauf: {s.lauf.fehler}</p>}
        {s.lauf.ampel === "schlecht" && (
          <p className="mt-2 text-xs text-ink-muted">
            Der Lauf hängt am Cron-Job <code>/api/makro-sync?job=releases</code> (alle 15 Minuten). Erster Lauf von Hand:{" "}
            <code>/api/makro-sync?job=beobachter&amp;secret=…</code>
          </p>
        )}
      </Card>

      {/* Prüfstand */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Prüfstand: funktioniert es?</CardTitle>
          <div className="flex gap-2 text-xs">
            <Badge tone="good">{bestaetigt} bestätigt</Badge>
            <Badge tone="warn">{s.pruefstand.length - bestaetigt - widerlegt} offen</Badge>
            <Badge tone="bad">{widerlegt} widerlegt</Badge>
          </div>
        </div>
        <p className="mt-2 text-sm font-medium text-ink">{s.fazit}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Sechs feste Fragen, vorab festgelegt und nie nachträglich angepasst. Kosten angenommen mit {KOSTEN_PROZENT} % je Trade.
          {" "}{s.mitStunden} Ereignisse haben Stundenwerte (Yahoo, rund 2 Jahre).
        </p>
        <div className="mt-3 space-y-3">
          {s.pruefstand.map((p) => (
            <div key={p.h.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink-muted">{p.h.id}</span>
                <span className="text-sm font-medium text-ink">{p.h.titel}</span>
                <Badge tone={URTEIL_TONE[p.urteil]}>{URTEIL_TEXT[p.urteil]}</Badge>
                <span className="ml-auto text-xs text-ink-muted">
                  nach {HORIZONT_NAME[p.h.horizont]} · |z| ≥ {p.h.minZ} · {p.h.richtung === "folgt" ? "Markt folgt" : "Markt kehrt um"}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">{p.h.frage}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div><span className="text-ink-muted">Fälle </span><b className="tabular-nums text-ink">{p.ergebnis.n}</b></div>
                <div><span className="text-ink-muted">Ø </span><b className="tabular-nums text-ink">{p.ergebnis.n ? vorzeichen(p.ergebnis.mittel, 3) : "–"}</b></div>
                <div><span className="text-ink-muted">nach Kosten </span><b className={cx("tabular-nums", p.ergebnis.netto > 0 ? "text-good-bright" : "text-bad-bright")}>{p.ergebnis.n ? vorzeichen(p.ergebnis.netto, 3) : "–"}</b></div>
                <div><span className="text-ink-muted">Trefferquote </span><b className="tabular-nums text-ink">{p.ergebnis.treffer === null ? "–" : `${Math.round(p.ergebnis.treffer * 100)} %`}</b></div>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{p.begruendung}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Einstellungen der Ansicht */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-muted">Erkundung nach</span>
        {HORIZONTE.map((x) => (
          <Link key={x} href={link(x, minZ)} className={cx("rounded-full border px-2.5 py-1", x === h ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-muted hover:text-ink")}>
            {HORIZONT_NAME[x]}
          </Link>
        ))}
        <span className="ml-2 text-ink-muted">Überraschung ab</span>
        {[1, 2].map((zz) => (
          <Link key={zz} href={link(h, zz)} className={cx("rounded-full border px-2.5 py-1", zz === minZ ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-muted hover:text-ink")}>
            |z| ≥ {zz}
          </Link>
        ))}
        <span className="ml-2 text-ink-muted">{s.ueberraschungen} Überraschungen</span>
      </div>

      {/* Erkenntnisse */}
      <Card>
        <CardTitle>Erkundung (Zufallsgefahr hoch)</CardTitle>
        {s.gesamt.n > 0 && (
          <p className="mt-2 text-sm text-ink">
            Insgesamt: nach {s.gesamt.n} Überraschungen bewegte sich der Markt nach {HORIZONT_NAME[h]} im Schnitt{" "}
            <b>{vorzeichen(s.gesamt.mittel)}</b> in Richtung der Überraschung
            {s.gesamt.treffer !== null ? ` (Trefferquote ${Math.round(s.gesamt.treffer * 100)} %)` : ""} –{" "}
            <Badge tone={STATUS_TONE[s.gesamt.status]}>{STATUS_TEXT[s.gesamt.status]}</Badge>
          </p>
        )}
        {s.erkenntnisse.length === 0 ? (
          <Empty>Noch keine Gruppe mit mindestens 30 Fällen.</Empty>
        ) : (
          <ul className="mt-3 space-y-2">
            {s.erkenntnisse.map((e) => (
              <li key={e.gruppe.schluessel} className="flex items-start gap-2 text-sm">
                <Badge tone={STATUS_TONE[e.gruppe.status]}>{STATUS_TEXT[e.gruppe.status]}</Badge>
                <span className="text-ink-muted">{e.text}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          Es werden {s.geprueft} Gruppen gleichzeitig geprüft; rund jede zwanzigste sieht allein durch Zufall auffällig aus.
          Darum gilt „Hinweis" erst ab 30 Fällen, |t| ≥ 2 und gleichem Vorzeichen in beiden Zeithälften, „stabil" ab 50 Fällen und |t| ≥ 3.
          Erst „stabil" taugt als Grundlage für eine Regel.
        </p>
      </Card>

      {/* Nach Kategorie */}
      <Card>
        <CardTitle>Nach Art der Meldung</CardTitle>
        <div className="mt-2"><Tabelle gruppen={s.jeKategorie} titel="Kategorie" /></div>
      </Card>

      {/* Matrix Währung × Kategorie */}
      <Card>
        <CardTitle>Währung und Kategorie</CardTitle>
        {waehrungen.length === 0 ? <Empty>Noch keine Fälle.</Empty> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="py-1 pr-3 font-medium">&nbsp;</th>
                  {matrixKategorien.map((k) => <th key={k} className="py-1 pr-3 text-center font-medium">{kategorieName(k).split(" ")[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {waehrungen.map((c) => (
                  <tr key={c} className="border-t border-line">
                    <td className="py-1.5 pr-3 font-medium text-ink">{c}</td>
                    {matrixKategorien.map((k) => {
                      const g = s.matrix[c]?.[k];
                      if (!g || g.n < 5) return <td key={k} className="py-1.5 pr-3 text-center text-ink-faint">–</td>;
                      const staerke = Math.min(1, Math.abs(g.mittel) / maxMatrix);
                      return (
                        <td key={k} className="py-1.5 pr-3 text-center">
                          <div
                            className={cx("rounded px-1 py-0.5 text-xs tabular-nums", g.mittel >= 0 ? "text-good-bright" : "text-bad-bright", g.status === "zuwenig" && "opacity-50")}
                            style={{ backgroundColor: `color-mix(in srgb, ${g.mittel >= 0 ? "var(--good-bright, #3fb950)" : "var(--bad-bright, #f85149)"} ${Math.round(staerke * 28)}%, transparent)` }}
                            title={`${g.n} Fälle · ${STATUS_TEXT[g.status]}`}
                          >
                            {vorzeichen(g.mittel, 2)}
                            <span className="block text-[10px] text-ink-muted">{g.n} · {STATUS_TEXT[g.status]}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-muted">Grün: der Markt folgt der Überraschung, rot: er läuft dagegen. Blasse Felder haben unter 30 Fälle.</p>
      </Card>

      {/* Einzelne Serien */}
      <Card>
        <CardTitle>Auffälligste einzelne Meldungen</CardTitle>
        <div className="mt-2"><Tabelle gruppen={s.jeSerie} titel="Meldung" /></div>
      </Card>

      {/* Letzte Ereignisse */}
      <Card>
        <CardTitle>Letzte Überraschungen</CardTitle>
        {s.letzte.length === 0 ? <Empty>Noch nichts gemessen.</Empty> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="py-1 pr-3 font-medium">Zeit</th><th className="py-1 pr-3 font-medium">Meldung</th>
                  <th className="py-1 pr-3 text-right font-medium">z</th><th className="py-1 text-right font-medium">Bewegung nach {HORIZONT_NAME[h]}</th>
                </tr>
              </thead>
              <tbody>
                {s.letzte.map(({ e, a }) => (
                  <tr key={e.release_id} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-ink-muted">{ZEIT.format(new Date(e.event_time))}</td>
                    <td className="py-1.5 pr-3 text-ink">{e.ccy} {e.titel}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">{e.z > 0 ? "+" : ""}{e.z.toFixed(1)}</td>
                    <td className={cx("py-1.5 text-right tabular-nums", a === null ? "text-ink-faint" : a > 0 ? "text-good-bright" : "text-bad-bright")}>
                      {a === null ? "offen" : `${vorzeichen(a)} ${a > 0 ? "mit" : "gegen"} die Überraschung`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>So wird gemessen</CardTitle>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>Ereignis = Veröffentlichung mit Ist und Erwartung (High/Medium) aus <code>makro_releases</code>, z = Überraschung in Standardabweichungen.</li>
          <li>Messpaar je Währung (EUR→EURUSD, CAD→USDCAD …); USD wird grob gegen EURUSD gemessen.</li>
          <li>Bewegung = Kurs 1 oder 4 Stunden nach der Meldung gegen den Kurs davor (Stundenkerzen) bzw. Schluss 1, 3 oder 5 Handelstage danach gegen den Schluss des Vortags, jeweils in Richtung der Überraschung gedreht.</li>
          <li>Nach Kosten: vom Betrag der Ø-Bewegung werden {KOSTEN_PROZENT} % abgezogen. Ein Muster unter den Kosten ist nicht handelbar.</li>
          <li>Tageskerzen sind grob: andere Nachrichten am selben Tag mischen mit. Darum zählt nur, was über viele Fälle und beide Zeithälften hält.</li>
        </ul>
      </Card>
    </div>
  );
}
