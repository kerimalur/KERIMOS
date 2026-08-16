import { ladeBudget, ladeEintraege, BONUS_SQL } from "@/lib/supabase/essen-bonus-db";
import { aktivitaetEintragen, aktivitaetEntfernen } from "@/lib/essen-bonus-actions";
import { AKTIVITAET_LABEL, PAUSCHALE, angerechnet, bonusSatz } from "@/lib/essen-bonus";
import { Card, CardTitle, Input, Select, Label, Button, Badge } from "@/components/ui";

/**
 * Das Tagesbudget mit Aktivitätsbonus.
 *
 * Steht auf der Essen-Startseite, weil dort die Frage entsteht: „wie viel darf
 * ich heute noch essen?". Nach einem langen Lauf ist die Antwort eine andere
 * als sonst, und ohne diese Karte hätte man dafür im Kopf rechnen müssen.
 */
export async function BonusKarte({ datum }: { datum: string }) {
  const [{ budget, faktor, tabelleFehlt }, eintraege] = await Promise.all([
    ladeBudget(datum), ladeEintraege(datum),
  ]);
  const satz = bonusSatz(budget, faktor);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Heute essen</CardTitle>
        <span className="tabular text-sm text-ink-muted">
          {budget.bonus > 0 ? (
            <>
              <span className="text-ink-faint line-through">{budget.grund}</span>{" "}
              <span className="text-lg font-medium text-ink">{budget.gesamt}</span> kcal
            </>
          ) : (
            <><span className="text-lg font-medium text-ink">{budget.grund}</span> kcal</>
          )}
        </span>
      </div>

      {satz && (
        <p className="mb-3 rounded-xl bg-good-tint px-3 py-2 text-xs leading-relaxed text-good-bright">
          {satz}
        </p>
      )}

      {eintraege.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {eintraege.map((e) => {
            const drauf = angerechnet(
              { datum, art: e.art, verbrannt: e.verbrannt, notiz: e.notiz }, faktor);
            return (
              <li key={e.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-sand/60 px-3 py-2 text-sm">
                <span className="font-medium text-ink">{AKTIVITAET_LABEL[e.art]}</span>
                <span className="tabular text-xs text-ink-muted">
                  {e.verbrannt !== null
                    ? `${e.verbrannt} verbrannt`
                    : PAUSCHALE[e.art] !== null
                      ? `${PAUSCHALE[e.art]} pauschal`
                      : "ohne Zahl"}
                </span>
                {drauf > 0 && <Badge tone="good">+{drauf} kcal</Badge>}
                {e.notiz && <span className="text-xs text-ink-muted">{e.notiz}</span>}
                <form action={aktivitaetEntfernen} className="ml-auto">
                  <input type="hidden" name="id" value={e.id} />
                  <button className="text-xs text-ink-faint transition hover:text-bad">
                    entfernen
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <form action={aktivitaetEintragen} className="flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="datum" value={datum} />
        <div>
          <Label htmlFor="ab-art">Aktivität</Label>
          <Select id="ab-art" name="art" defaultValue="lauf" className="w-36">
            <option value="lauf">Laufen</option>
            <option value="gym">Krafttraining</option>
            <option value="sonstiges">Sonstiges</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="ab-kcal">Verbrannt (kcal)</Label>
          <Input id="ab-kcal" name="verbrannt" type="number" min="0" step="10"
            placeholder="z. B. 800" className="w-32" />
        </div>
        <div className="min-w-32 flex-1">
          <Label htmlFor="ab-notiz">Notiz</Label>
          <Input id="ab-notiz" name="notiz" placeholder="10 km" />
        </div>
        <Button type="submit" variant="ghost">Eintragen</Button>
      </form>

      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
        Angerechnet werden <strong>{faktor} %</strong> der verbrannten Kalorien —
        aus 800 werden also {Math.round(800 * faktor / 100 / 10) * 10}. Bewusst
        nicht alles: Uhren schätzen grosszügig, und ein Defizit soll ein Defizit
        bleiben. Beim Krafttraining reicht die Pauschale von {PAUSCHALE.gym} kcal,
        beim Laufen macht die Distanz den Unterschied — dort lohnt die Zahl von
        der Uhr. Ändern lässt sich der Prozentsatz über den Schlüssel{" "}
        <code className="rounded bg-sand px-1">bonus_faktor</code> in den
        Einstellungen.
      </p>

      {tabelleFehlt && (
        <div className="mt-3 rounded-xl bg-warn-tint px-3 py-2.5">
          <p className="text-xs text-ink-soft">
            Ein Schritt fehlt: Die Tabelle <code className="rounded bg-sand px-1">activity_bonus</code>{" "}
            gibt es in der Menü-Datenbank noch nicht. Bis dahin gilt nur das
            Grundziel. Einmal im Supabase-SQL-Editor ausführen:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-sand/70 p-2.5 text-[11px] leading-relaxed text-ink-soft">
            <code>{BONUS_SQL}</code>
          </pre>
        </div>
      )}
    </Card>
  );
}
