import { tradingConfigured } from "@/lib/supabase/trading";
import { heuteISO } from "@/lib/time";
import { PAARE } from "@/lib/confluence/faktoren";
import { baueRueckblick } from "@/lib/confluence/seite";
import {
  RegimeKarte, UrteilKarte, FaktorZeile, VetoZeile, Luecken,
} from "@/components/confluence/teile";
import { Card, CardTitle, Input, Select, Label, Button, Badge, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Rückblick — hättest du an diesem Tag Rückenwind gehabt?
 *
 * Stand vorher unter `/trading/confluence?ansicht=rueckblick`. Umgezogen, weil
 * die Frage zum Backtest gehört und nicht zur Lagebeurteilung: sie wird immer
 * NACH einem Einstieg gestellt, mit einem Datum in der Vergangenheit, während
 * man den Trade nachträgt. Am alten Ort musste man dafür den Bereich wechseln
 * und das Datum aus dem Kopf wieder eintippen.
 *
 * Gerechnet wird weiter mit den fünf Faktoren aus `lib/confluence/` — das ist
 * hier auch richtig so: für die Auswertung eines vergangenen Tages zählt, was
 * damals messbar war, nicht welches Modell heute in der Oberfläche steht.
 */
type Params = Promise<Record<string, string | string[] | undefined>>;

const einer = (v: string | string[] | undefined): string | null =>
  typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null;

export default async function RueckblickSeite({ searchParams }: { searchParams: Params }) {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Rückblick</CardTitle>
        <Empty>
          Trading-Datenbank nicht verbunden. In Vercel fehlen TRADING_SUPABASE_URL
          und TRADING_SUPABASE_SERVICE_ROLE_KEY.
        </Empty>
      </Card>
    );
  }

  const p = await searchParams;
  const heute = heuteISO();
  const paarRoh = (einer(p.paar) ?? "EURUSD").toUpperCase().replace(/[^A-Z]/g, "");
  const paar = (PAARE as readonly string[]).includes(paarRoh) ? paarRoh : "EURUSD";
  const datumRoh = einer(p.datum) ?? heute;
  // Ein Datum in der Zukunft ergibt kein As-of - dann gilt heute.
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(datumRoh) && datumRoh <= heute ? datumRoh : heute;
  const richtungRoh = einer(p.richtung);
  const richtung: -1 | 0 | 1 = richtungRoh === "long" ? 1 : richtungRoh === "short" ? -1 : 0;

  const { urteil, regime, labor, bericht, eigeneTrades } =
    await baueRueckblick(paar, datum, richtung);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Rückblick · Confluence</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Die fundamentale Lage an einem vergangenen Handelstag — für den Trade,
          den du gerade nachträgst.
        </p>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <div>
            <Label htmlFor="datum">Handelstag</Label>
            <Input id="datum" name="datum" type="date" defaultValue={datum} max={heute}
              className="w-44" />
          </div>
          <div>
            <Label htmlFor="paar">Paar</Label>
            <Select id="paar" name="paar" defaultValue={paar} className="w-36">
              {PAARE.map((x) => (
                <option key={x} value={x}>{x.slice(0, 3)}/{x.slice(3)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="richtung">Richtung</Label>
            <Select id="richtung" name="richtung"
              defaultValue={richtung > 0 ? "long" : richtung < 0 ? "short" : ""}
              className="w-36">
              <option value="">— egal —</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </Select>
          </div>
          <Button type="submit" className="mb-0">Nachsehen</Button>
        </form>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          Gerechnet wird mit dem Stand <strong>dieses Tages</strong>, inklusive
          Veröffentlichungsverzug: eine Inflationszahl mit Stichtag 1. März gilt
          hier erst ab Mitte April, weil sie vorher niemand kennen konnte. Ohne
          diese Regel würde der Rückblick jeden Trade nachträglich schönrechnen.
        </p>
      </Card>

      <Card>
        <UrteilKarte u={urteil} />
        <ul className="mt-3 space-y-2">
          {urteil.faktoren.map((f) => <FaktorZeile key={f.key} f={f} />)}
          <VetoZeile v={urteil.veto} gefragt={urteil.gefragt} />
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Marktumfeld an diesem Tag</CardTitle>
          <RegimeKarte regime={regime} />
        </Card>

        <Card>
          <CardTitle>Zweitmeinung aus dem Labor</CardTitle>
          {labor ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={labor.richtung === "LONG" ? "good" : labor.richtung === "SHORT" ? "bad" : "neutral"}>
                  {labor.richtung ?? "keine Richtung"}
                </Badge>
                <span className="num text-xs text-ink-muted">
                  {labor.einig} Faktoren einig · Woche ab {labor.woche}
                </span>
                <Badge tone={labor.quelle === "live" ? "good" : "warn"}>
                  {labor.quelle === "live" ? "live eingefroren" : "rekonstruiert"}
                </Badge>
              </div>
              <ul className="mt-2.5 space-y-1.5">
                {labor.faktoren.map((f) => (
                  <li key={f.name} className="text-xs leading-relaxed text-ink-muted">
                    <span className={cx("mr-1.5 font-medium",
                      f.dir > 0 ? "text-good-bright" : f.dir < 0 ? "text-bad-bright" : "text-ink-faint")}>
                      {f.dir > 0 ? "▲" : f.dir < 0 ? "▼" : "–"} {f.name}:
                    </span>
                    {f.text}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
                Das Labor rechnet mit fünf Faktoren, unter anderem Saisonalität, und
                seine rekonstruierten Wochen haben ein bekanntes Lookahead-Problem.
                Deshalb steht das hier <strong>neben</strong> dem Urteil und nicht
                darin — interessant vor allem dort, wo beide dasselbe sagen.
              </p>
            </>
          ) : (
            <Empty>
              Für diese Woche gibt es keinen Labor-Snapshot. Die Tabelle
              `weekly_outlook_snapshots` ist ein eingefrorener Stand bis
              28.09.2026 und wird nicht mehr nachgeführt.
            </Empty>
          )}
        </Card>
      </div>

      {eigeneTrades.length > 0 && (
        <Card>
          <CardTitle>Deine Trades auf {paar} an diesem Tag</CardTitle>
          <ul className="space-y-2">
            {eigeneTrades.map((t) => {
              const passt = richtung === 0 || t.richtung === richtung;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-sand/50 px-3 py-2 text-sm">
                  <Badge tone={t.richtung > 0 ? "good" : "bad"}>
                    {t.richtung > 0 ? "LONG" : "SHORT"}
                  </Badge>
                  <span className="text-ink-soft">{t.ergebnis ?? "offen"}</span>
                  <span className="num text-ink-muted">
                    {t.r > 0 ? "+" : ""}{t.r.toFixed(2)} R
                  </span>
                  {!passt && (
                    <span className="text-xs text-ink-faint">
                      — das Urteil oben gilt für die andere Richtung
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Luecken leer={bericht.leer} cotQuelle={bericht.cotQuelle} />
    </div>
  );
}
