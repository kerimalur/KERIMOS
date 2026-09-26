import { waehrungSpeichern } from "@/lib/makro-actions";
import { HAND_FELDER, NUR_KONTEXT, istVeraltet, type HandWert } from "@/lib/makro/bewertung";
import { AUTO_FELDER } from "@/lib/makro/katalog";
import { BrowserNachladen } from "@/components/makro/browser-nachladen";
import { ZustandMarke, standKurz } from "@/components/makro/teile";
import { Card, CardTitle, Badge, Button, Input, Label } from "@/components/ui";

/**
 * Pflege der Zahlen je Währung und der Stand des Datenlaufs.
 *
 * Stand bis zum 26.09.2026 abends auf der alten Übersicht /trading/waehrungen.
 * Seit es nur noch die Seite je Währung gibt, steht beides dort unten —
 * aufklappbar, weil man es selten braucht. Zyklus und Notiz zur Notenbank
 * sind in Ebene 2 gewandert, wo man sie liest.
 */
export function PflegeFormular({ ccy, hand, stichtag }: {
  ccy: string;
  hand: Partial<Record<string, HandWert>>;
  stichtag: string;
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <CardTitle className="mb-0">Zahlen für {ccy} pflegen</CardTitle>
        <span className="ml-auto text-[11px] text-ink-faint">
          Leeres Feld = unverändert · „-" löscht den Wert
        </span>
      </div>

      <form action={waehrungSpeichern} className="space-y-4">
        <input type="hidden" name="ccy" value={ccy} />

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
                  <ZustandMarke ccy={ccy} feld={f.key} status={status} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-stand">Stand der Zahlen</Label>
            <Input id="f-stand" name="stand" type="date" defaultValue={stichtag} />
          </div>
          <div>
            <Label htmlFor="f-quelle">Quelle</Label>
            <Input id="f-quelle" name="quelle" placeholder="Trading Economics" />
          </div>
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
export function SyncLeiste({ sync }: { sync: { gelaufen: string | null; bericht: Record<string, string> } }) {
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
        <BrowserNachladen />
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
      <BrowserNachladen />
    </Card>
  );
}
