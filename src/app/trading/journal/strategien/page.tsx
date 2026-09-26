import {
  fetchStrategien, ladeKontoKette, computeJournalStats, SESSIONS,
  tradingUserId, type Strategie, type Trade,
} from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { strategieSpeichern, strategieLoeschen } from "@/lib/journal-actions";
import { JournalHinweis } from "@/components/journal-hinweis";
import { Card, CardTitle, Stat, Badge, Empty, Button, Input, Select, Label, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Strategien — welche Regeln gelten, und was sie eingebracht haben.
 *
 * Umgezogen aus dem GVA-Screener (`/journal/strategie`), siehe TRADING-UMBAU.md.
 *
 * Der Unterschied zu einer Notiz-App: Neben jeder Strategie stehen die
 * Kennzahlen der Trades, die ihr zugeordnet wurden. Eine Strategie, die man
 * aufschreibt und nie wieder misst, ist eine Absichtserklärung. Erst die Zahl
 * daneben macht daraus etwas, dem man widersprechen kann.
 */

function StrategieKarte({ s, trades }: { s: Strategie; trades: Trade[] }) {
  const eigene = trades.filter((t) => t.strategyId === s.id);
  const st = computeJournalStats(eigene);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-base font-bold text-ink">{s.name}</span>
        {s.isActive
          ? <Badge tone="good">aktiv</Badge>
          : <Badge tone="neutral">ruht</Badge>}
        <Badge tone="neutral">
          {s.direction === "long" ? "nur Long"
            : s.direction === "short" ? "nur Short" : "beide Richtungen"}
        </Badge>
      </div>

      {s.description && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{s.description}</p>
      )}

      {(s.pairs.length > 0 || s.sessions.length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {s.pairs.map((p) => <Badge key={p} tone="accent">{p}</Badge>)}
          {s.sessions.map((x) => <Badge key={x} tone="neutral">{x}</Badge>)}
        </div>
      )}

      <div className="mt-4 grid gap-4 border-t border-line/70 pt-4 sm:grid-cols-4">
        <Stat label="Trades" value={st.n} sub={`${st.wins} W · ${st.losses} L`} />
        <Stat label="Winrate"
          value={st.winrate === null ? "—" : `${st.winrate.toFixed(0)} %`}
          tone={st.winrate !== null && st.winrate >= 50 ? "good" : "neutral"} />
        <Stat label="Profit Factor"
          value={st.profitFactor === null ? "—" : st.profitFactor.toFixed(2)}
          tone={st.profitFactor !== null && st.profitFactor >= 1.5 ? "good" : "neutral"} />
        <Stat label="Gesamt"
          value={`${st.gesamtR >= 0 ? "+" : ""}${st.gesamtR.toFixed(1)} R`}
          tone={st.gesamtR > 0 ? "good" : st.gesamtR < 0 ? "bad" : "neutral"} />
      </div>

      {st.n === 0 && (
        <p className="mt-3 text-xs text-ink-faint">
          Noch kein Trade dieser Strategie zugeordnet. Die Zuordnung passiert im
          Erfassungsformular unter „Strategie".
        </p>
      )}

      {s.notes && (
        <p className="mt-3 whitespace-pre-wrap border-t border-line/70 pt-3 text-xs text-ink-muted">
          {s.notes}
        </p>
      )}

      <form action={strategieLoeschen} className="mt-3">
        <input type="hidden" name="id" value={s.id} />
        <button type="submit"
          className="text-xs text-ink-faint transition hover:text-bad-bright">
          Strategie löschen
        </button>
      </form>
    </Card>
  );
}

export default async function StrategienSeite() {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  // Live-Trades aus der Kontokette: dieselben Zahlen wie überall sonst im
  // Journal, und keine alten Backtest-Zeilen in der Strategie-Statistik.
  const [strategien, { live: trades }] = await Promise.all([
    fetchStrategien(), ladeKontoKette(),
  ]);
  const ohneStrategie = trades.filter((t) => !t.strategyId);

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Neue Strategie</CardTitle>
        <form action={strategieSpeichern} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="st-name">Name</Label>
              <Input id="st-name" name="name" required placeholder="z.B. GVA + Daily BOS" />
            </div>
            <div>
              <Label htmlFor="st-direction">Richtung</Label>
              <Select id="st-direction" name="direction" defaultValue="both">
                <option value="both">beide</option>
                <option value="long">nur Long</option>
                <option value="short">nur Short</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="st-description">Regeln</Label>
            <textarea id="st-description" name="description" rows={4}
              placeholder={"Wann steige ich ein, wann nicht?\nWo liegt der Stop, wo das Ziel?\nWoran erkenne ich, dass das Setup ungültig ist?"}
              className={cx(
                "w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink",
                "placeholder:text-ink-faint outline-none transition",
                "hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20",
              )} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="st-pairs">Paare (mit Komma getrennt)</Label>
              <Input id="st-pairs" name="pairs" placeholder="EURUSD, GBPUSD, XAUUSD" />
            </div>
            <div>
              <Label htmlFor="st-sessions">Sessions (mit Komma getrennt)</Label>
              <Input id="st-sessions" name="sessions"
                placeholder={SESSIONS.slice(0, 2).join(", ")} />
            </div>
          </div>

          <div>
            <Label htmlFor="st-notes">Notiz</Label>
            <textarea id="st-notes" name="notes" rows={2}
              placeholder="Was ist beim letzten Anpassen aufgefallen?"
              className={cx(
                "w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink",
                "placeholder:text-ink-faint outline-none transition",
                "hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20",
              )} />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="isActive" defaultChecked className="accent-[#E7A96B]" />
            aktiv — wird gerade gehandelt
          </label>

          <Button type="submit">Strategie speichern</Button>
        </form>
      </Card>

      {strategien.length === 0 ? (
        <Card>
          <Empty>
            Noch keine Strategie hinterlegt. Das ist kein Formfehler — aber
            ohne aufgeschriebene Regel lässt sich hinterher nicht prüfen, ob du
            ihr gefolgt bist.
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {strategien.map((s) => <StrategieKarte key={s.id} s={s} trades={trades} />)}
        </div>
      )}

      {ohneStrategie.length > 0 && (
        <Card flat>
          <CardTitle>Ohne Zuordnung</CardTitle>
          <p className="text-sm text-ink-muted">
            {ohneStrategie.length} von {trades.length} Trades sind keiner Strategie
            zugeordnet. Solange das die Mehrheit ist, sagen die Kennzahlen oben
            wenig — sie messen dann nur einen Ausschnitt.
          </p>
        </Card>
      )}
    </div>
  );
}
