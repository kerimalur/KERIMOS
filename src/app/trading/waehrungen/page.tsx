import Link from "next/link";
import { tradingConfigured, G8 } from "@/lib/supabase/trading";
import { ladeMakro } from "@/lib/makro/laden";
import {
  HAND_FELDER, NUR_KONTEXT, ROHSTOFF_BEZUG, ZYKLUS_LABEL, istVeraltet,
} from "@/lib/makro/bewertung";
import { AUTO_FELDER } from "@/lib/makro/quellen";
import { waehrungSpeichern } from "@/lib/makro-actions";
import { EbenenKarte, ScoreBalken, urteilWort, ZustandMarke, standKurz } from "@/components/makro/teile";
import { Card, CardTitle, Badge, Empty, Button, Input, Select, Label, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Währungen — jede für sich, ungepaart.
 *
 * Kerims Ansage vom 26.09.2026: Er will einen Ort, an dem eine einzelne
 * Währung vollständig dasteht — Zinsen, Lage des Landes, Arbeitslosenquote,
 * Handelsbilanz, Staatsanleihen und die Nachfrage danach. Erst danach paart
 * man sie.
 *
 * Die Seite ist zugleich der Ort, an dem die Zahlen gepflegt werden, die es
 * nirgends kostenlos als Schnittstelle gibt (PMI, BIP, Arbeitslosenquote,
 * Handelsbilanz, Anleihen). Eintragen und ansehen am selben Ort: sonst
 * pflegt man an einer Stelle und wundert sich an der anderen.
 */
export default async function WaehrungenSeite({ searchParams }: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Währungen</CardTitle>
        <Empty>Trading-Datenbank nicht verbunden.</Empty>
      </Card>
    );
  }

  const sp = await searchParams;
  const b = await ladeMakro();
  const gewaehlt = (G8 as readonly string[]).includes(sp.w ?? "") ? sp.w! : "USD";
  const zeile = b.zeilen.find((z) => z.ccy === gewaehlt);
  const hand = b.hand[gewaehlt] ?? {};
  const zyklus = b.zyklen[gewaehlt] ?? "";
  const notiz = b.notizen[gewaehlt] ?? "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Währungen</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Eine Währung für sich: Zinsen, Wirtschaft, Anleihen, Stimmung.
            Gepaart wird erst in den Fundamentals.
          </p>
        </div>
        <Link href="/trading/fundamentals"
          className="text-xs text-accent-soft transition hover:underline">
          ← Rangliste
        </Link>
      </div>

      {/* Alle acht als Reiter, mit ihrem Urteil — so sieht man beim Wechseln,
          wo man hinwechselt. */}
      <div className="flex flex-wrap gap-1.5">
        {b.zeilen.map((z) => (
          <Link key={z.ccy} href={`/trading/waehrungen?w=${z.ccy}`}
            className={cx("rounded-xl px-3 py-1.5 text-sm transition duration-150 ease-tactile",
              z.ccy === gewaehlt
                ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                : "bg-sand text-ink-muted hover:text-ink")}>
            {z.ccy}
            <span className={cx("ml-2 text-[11px]",
              z.ccy === gewaehlt ? "text-ink-on/80"
                : z.gesamt === null ? "text-ink-faint"
                  : z.gesamt > 0.05 ? "text-good-bright"
                    : z.gesamt < -0.05 ? "text-bad-bright" : "text-ink-faint")}>
              {z.gesamt === null ? "—" : `${z.gesamt > 0 ? "+" : ""}${z.gesamt.toFixed(2)}`}
            </span>
          </Link>
        ))}
      </div>

      <SyncLeiste sync={b.sync} />

      {!zeile ? (
        <Card><Empty>Für {gewaehlt} liegt nichts vor.</Empty></Card>
      ) : (
        <>
          <Card area="trading">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-2xl font-bold text-ink">{gewaehlt}</span>
              <Badge tone={zeile.gesamt === null ? "neutral"
                : zeile.gesamt > 0.15 ? "good" : zeile.gesamt < -0.15 ? "bad" : "neutral"}>
                {urteilWort(zeile.gesamt)}
              </Badge>
              {zyklus && <Badge tone="accent">{ZYKLUS_LABEL[zyklus as keyof typeof ZYKLUS_LABEL]}</Badge>}
              <span className="ml-auto"><ScoreBalken score={zeile.gesamt} breit={160} /></span>
            </div>
            <p className="mt-3 text-sm text-ink-soft">{ROHSTOFF_BEZUG[gewaehlt]}</p>
            {notiz && <p className="mt-2 text-sm text-ink-muted">{notiz}</p>}
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {zeile.ebenen.map((e) => <EbenenKarte key={e.ebene} e={e} ccy={gewaehlt} />)}
          </div>

          <Card>
            <div className="mb-3 flex flex-wrap items-baseline gap-2">
              <CardTitle className="mb-0">Zahlen für {gewaehlt} pflegen</CardTitle>
              <span className="ml-auto text-[11px] text-ink-faint">
                Leeres Feld = unverändert · „-" löscht den Wert
              </span>
            </div>

            <form action={waehrungSpeichern} className="space-y-4">
              <input type="hidden" name="ccy" value={gewaehlt} />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {HAND_FELDER.map((f) => {
                  const w = hand[f.key];
                  const auto = AUTO_FELDER.includes(f.key);
                  const status = !w || w.wert === null ? "fehlt"
                    : istVeraltet(f.key, w) ? "veraltet" : "ok";
                  return (
                    <div key={f.key}>
                      <Label htmlFor={`f-${f.key}`}>
                        {f.label}
                        <span className="ml-1 text-ink-faint">({f.einheit})</span>
                        {auto && (
                          <span className="ml-1.5 rounded bg-good-tint px-1 py-px text-[10px]
                                           font-medium uppercase tracking-wide text-good-bright"
                            title="Holt sich der Lauf selbst (OECD, Eurostat, IMF, FRED). Eine Eingabe hier gewinnt, bis die Quelle eine neuere Zahl hat.">
                            auto
                          </span>
                        )}
                        {NUR_KONTEXT.includes(f.key) && (
                          <span className="ml-1 text-ink-faint">· nur Kontext</span>
                        )}
                      </Label>
                      <Input id={`f-${f.key}`} name={f.key} inputMode="decimal"
                        placeholder={w?.wert !== null && w?.wert !== undefined
                          ? String(w.wert) : "—"} />
                      <p className="mt-1 text-[11px] leading-snug text-ink-faint">
                        {w?.wert !== null && w?.wert !== undefined
                          ? `Jetzt ${w.wert}${w.vorwert !== null ? ` (vorher ${w.vorwert})` : ""}`
                            + `${standKurz(w.stand) ? ` · Stand ${standKurz(w.stand)}` : ""}`
                            + `${w.quelle ? ` · ${w.quelle}` : ""}`
                          : f.hinweis}
                      </p>
                      <div className="mt-1">
                        <ZustandMarke ccy={gewaehlt} feld={f.key} status={status} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="f-zyklus">Zyklus der Notenbank</Label>
                  <Select id="f-zyklus" name="zyklus" defaultValue={zyklus}>
                    <option value="">nicht gesetzt</option>
                    {Object.entries(ZYKLUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="f-stand">Stand der Zahlen</Label>
                  <Input id="f-stand" name="stand" type="date" defaultValue={b.stichtag} />
                </div>
                <div>
                  <Label htmlFor="f-quelle">Quelle</Label>
                  <Input id="f-quelle" name="quelle" placeholder="Trading Economics" />
                </div>
              </div>

              <div>
                <Label htmlFor="f-notiz">Notiz zur Notenbank</Label>
                <Input id="f-notiz" name="notiz" defaultValue={notiz}
                  placeholder="z.B. Fed: Senkung im Dezember zu 62 % gepreist" />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit">Speichern</Button>
                <span className="text-[11px] text-ink-faint">
                  Der bisherige Wert rutscht automatisch auf „vorher" — daraus kommt der Trendpfeil.
                  Felder mit <span className="text-good-bright">auto</span> musst du nicht pflegen;
                  eine Eingabe hier überschreibt den geholten Wert trotzdem, für den Fall, dass
                  die Reihe hinterherhinkt.
                </span>
              </div>
            </form>

            <div className="mt-4 border-t border-line/70 pt-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">Woher die Zahlen kommen</p>
              <ul className="mt-1.5 grid gap-x-6 gap-y-1 text-[11px] text-ink-faint sm:grid-cols-2">
                {HAND_FELDER.map((f) => (
                  <li key={f.key}>
                    <span className="text-ink-muted">{f.label}:</span> {f.quelle}
                    {AUTO_FELDER.includes(f.key) && <span className="ml-1 text-good-bright">· automatisch</span>}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- FRED-Lauf */

/**
 * Was der automatische Lauf zuletzt gemacht hat.
 *
 * Steht bewusst über dem Formular und nicht darunter: die erste Frage beim
 * Öffnen dieser Seite ist „muss ich hier überhaupt etwas eintragen?", und die
 * Antwort hängt daran, ob der Cron durchgelaufen ist. Ohne diese Zeile sieht
 * ein leeres Feld gleich aus, egal ob die Reihe fehlt oder der Lauf nie
 * stattgefunden hat.
 */
function SyncLeiste({ sync }: { sync: { gelaufen: string | null; bericht: Record<string, string> } }) {
  const eintraege = Object.entries(sync.bericht);
  // Nur Einträge, die mit „fehlt" beginnen, sind Fehler — alle anderen
  // nennen die Quelle, die geliefert hat.
  const fehler = eintraege.filter(([, v]) => /^fehlt/i.test(v));

  if (!sync.gelaufen) {
    return (
      <Card flat>
        <p className="text-sm text-ink-soft">
          Der automatische Lauf war noch nie da.
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
          Frühindikator, BIP, Arbeitslosenquote, 10-Jahres-Rendite, Leistungsbilanz
          und Staatsschulden holt
          <code className="mx-1 rounded bg-sand px-1">/api/makro-sync</code>
          von OECD, Eurostat, IMF und FRED. Dafür braucht Vercel
          <code> SUPABASE_SERVICE_ROLE_KEY</code> (und für die FRED-Reihen
          <code> FRED_API_KEY</code>), und der externe Cron muss die Adresse mit
          dem <code>CRON_SECRET</code> aufrufen. Bis dahin bleiben diese Felder
          leer — von Hand eintragen geht trotzdem.
        </p>
      </Card>
    );
  }

  return (
    <Card flat>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-ink-soft">
          Datenlauf zuletzt {new Date(sync.gelaufen).toLocaleString("de-CH", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}
        </span>
        <Badge tone={fehler.length === 0 ? "good" : "bad"}>
          {fehler.length === 0
            ? `${eintraege.length} Reihen geholt`
            : `${fehler.length} von ${eintraege.length} Reihen fehlen`}
        </Badge>
      </div>
      {fehler.length > 0 && (
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-[11px] text-ink-faint sm:grid-cols-2">
          {fehler.map(([k, v]) => (
            <li key={k}><span className="text-ink-muted">{k}:</span> {v}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
