import { fetchKochliste } from "@/lib/kochliste";
import { PrintButton } from "@/components/print-button";
import { Card, CardTitle, Empty, Badge } from "@/components/ui";
import { MEAL_LABEL } from "@/lib/supabase/menu";
import { heuteISO, addDays, weekStart } from "@/lib/time";

export const dynamic = "force-dynamic";

/** "1'200 g" · "2.5 kg" - grosse Grammzahlen lesen sich in Kilo besser. */
function mengeText(menge: number, unit: string): string {
  if (unit === "g" && menge >= 1000) {
    return `${(menge / 1000).toFixed(menge % 1000 === 0 ? 0 : 2)} kg`;
  }
  if (unit === "ml" && menge >= 1000) {
    return `${(menge / 1000).toFixed(1)} l`;
  }
  const gerundet = Math.round(menge * 10) / 10;
  return `${gerundet.toLocaleString("de-CH")} ${unit}`;
}

const kurzDatum = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("de-CH", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });

/**
 * Kochliste: was für einen Zeitraum insgesamt gekocht werden muss.
 *
 * Statt Tag für Tag nachzuschlagen steht hier pro Gericht, wie oft es
 * vorkommt und wie viel von jeder Zutat dafür nötig ist - und wie viel
 * davon in eine einzelne Box gehört.
 */
export default async function KochenPage({
  searchParams,
}: {
  searchParams: Promise<{ von?: string; bis?: string }>;
}) {
  const sp = await searchParams;
  const heute = heuteISO();
  // Standard ist die laufende Planwoche, nicht „heute plus sechs". Geplant
  // wird in Wochen, gekocht auch — ein Zeitraum, der mitten in der Woche
  // anfängt, zerschneidet genau die Wiederholungen, die hier zusammengehören.
  const wocheVon = weekStart(heute);
  const von = sp.von || wocheVon;
  const bis = sp.bis || addDays(wocheVon, 6);

  const gerichte = await fetchKochliste(von, bis);
  const tageImZeitraum =
    Math.round(
      (new Date(bis + "T12:00:00").getTime() -
        new Date(von + "T12:00:00").getTime()) / 86400000) + 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Kochen</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Wie oft der Herd angeht — nicht wie viele Mahlzeiten es gibt.
            Steht dasselbe Gericht dreimal in der Woche, ist das ein Topf mit
            drei Portionen. Je Gericht die Gesamtmenge und daneben, wie viel
            davon in eine Box gehört.
          </p>
          {/* Nur im Druck sichtbar: sonst weiss man auf dem Ausdruck nicht,
              für welchen Zeitraum die Mengen gelten. */}
          <p className="mt-1 hidden text-sm print:block">
            Zeitraum {kurzDatum(von)} bis {kurzDatum(bis)}
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Zeitraum. Bewusst ein einfaches GET-Formular: kein Client-State,
          und der Zeitraum bleibt in der Adresse teilbar. */}
      <Card className="no-print">
        <form className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="von" className="mb-1.5 block text-xs text-ink-muted">
              Von
            </label>
            <input id="von" name="von" type="date" defaultValue={von}
              className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink outline-none transition hover:border-line-strong focus:border-accent" />
          </div>
          <div>
            <label htmlFor="bis" className="mb-1.5 block text-xs text-ink-muted">
              Bis
            </label>
            <input id="bis" name="bis" type="date" defaultValue={bis}
              className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink outline-none transition hover:border-line-strong focus:border-accent" />
          </div>
          <button type="submit"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-ink-on transition hover:bg-accent-soft">
            Berechnen
          </button>
          <span className="ml-auto text-xs text-ink-muted">
            {tageImZeitraum} {tageImZeitraum === 1 ? "Tag" : "Tage"} ·{" "}
            {gerichte.reduce((s, g) => s + g.anzahl, 0)} Mahlzeiten
          </span>
        </form>
      </Card>

      {gerichte.length > 0 && (
        <Card>
          <p className="text-sm text-ink">
            <span className="font-display text-2xl font-bold text-accent-soft">
              {gerichte.length}
            </span>{" "}
            {gerichte.length === 1 ? "Topf" : "Töpfe"} für{" "}
            <span className="tabular font-medium">
              {gerichte.reduce((s, g) => s + g.anzahl, 0)}
            </span>{" "}
            Portionen
          </p>
          {gerichte.filter((g) => g.anzahl > 1).length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              Mehrfach geplant:{" "}
              {gerichte.filter((g) => g.anzahl > 1)
                .map((g) => `${g.name} (${g.anzahl})`).join(" · ")}
            </p>
          )}
        </Card>
      )}

      {gerichte.length === 0 ? (
        <Empty>
          Für diesen Zeitraum ist nichts geplant. Erst im Plan Mahlzeiten
          eintragen, dann steht hier die Kochliste.
        </Empty>
      ) : (
        gerichte.map((g) => (
          <Card key={g.name} className="print-block">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="mb-0">{g.name}</CardTitle>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {MEAL_LABEL[g.mealType] ?? g.mealType} ·{" "}
                  {g.kcalProPortion} kcal · {g.proteinProPortion} g Protein je Portion
                </p>
              </div>
              {/* „3× kochen" war falsch und hat genau die Frage nicht
                  beantwortet, für die es diese Seite gibt: Kerim kocht das
                  Gericht EINMAL und füllt drei Boxen ab. */}
              <Badge tone={g.anzahl > 1 ? "accent" : "neutral"}>
                {g.anzahl > 1
                  ? `1× kochen · ${g.anzahl} Portionen`
                  : "1 Portion"}
              </Badge>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="pb-2 font-medium">Zutat</th>
                  <th className="pb-2 text-right font-medium">Gesamt</th>
                  <th className="pb-2 text-right font-medium">je Box</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {g.zutaten.map((z) => (
                  <tr key={z.name}>
                    <td className="py-2 text-ink-soft">{z.name}</td>
                    <td className="tabular py-2 text-right font-medium text-ink">
                      {mengeText(z.menge, z.unit)}
                    </td>
                    <td className="tabular py-2 text-right text-ink-muted">
                      {mengeText(z.proPortion, z.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {g.tage.length > 0 && (
              <p className="mt-3 text-xs text-ink-faint">
                Geplant für {g.tage.sort().map(kurzDatum).join(", ")}
              </p>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
