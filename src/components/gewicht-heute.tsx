import { addBodyWeight } from "@/lib/actions";
import { gymConfigured, createGymClient } from "@/lib/supabase/gym";
import { heuteISO } from "@/lib/time";
import { Button, Input } from "@/components/ui";

/**
 * Das Körpergewicht, einmal am Tag, dort wo man ohnehin hinschaut.
 *
 * Die Karte erscheint auf Handy und Desktop, sobald ein neuer Tag begonnen
 * hat und noch kein Gewicht steht - und verschwindet in dem Moment, in dem
 * es eingetragen ist. Ein Feld, das immer da ist, wird übersehen; eines,
 * das nur bei offener Frage auftaucht, wird beantwortet.
 */
export async function GewichtHeute() {
  if (!gymConfigured()) return null;

  const gym = createGymClient();
  if (!gym) return null;

  const heute = heuteISO();

  const [{ data: heutige }, { data: letzte }] = await Promise.all([
    gym.from("body_weight_entries")
      .select("id").eq("entry_date", heute).limit(1),
    gym.from("body_weight_entries")
      .select("entry_date, weight_kg")
      .not("weight_kg", "is", null)
      .order("entry_date", { ascending: false }).limit(1),
  ]);

  // Heute schon gewogen: nichts zu fragen.
  if ((heutige?.length ?? 0) > 0) return null;

  const vorher = letzte?.[0] as { entry_date: string; weight_kg: number } | undefined;
  const tageHer = vorher
    ? Math.floor(
        (new Date(heute + "T12:00:00").getTime() -
          new Date(vorher.entry_date + "T12:00:00").getTime()) / 86400000)
    : null;

  return (
    <div className="rounded-2xl border border-line/70 bg-card px-5 py-4">
      <form action={addBodyWeight} className="flex items-center gap-3">
        <span className="shrink-0 text-sm text-ink-soft">Gewicht heute</span>
        <Input name="weight_kg" type="number" inputMode="decimal"
          step="0.1" min="30" max="250" required
          aria-label="Körpergewicht in Kilogramm"
          placeholder={vorher ? Number(vorher.weight_kg).toFixed(1) : "z.B. 92.0"}
          className="flex-1" />
        <Button type="submit" className="shrink-0">kg</Button>
      </form>
      {vorher && (
        <p className="mt-2 text-xs text-ink-muted">
          Zuletzt {Number(vorher.weight_kg).toFixed(1)} kg
          {tageHer === 1 ? " gestern" : tageHer !== null && tageHer > 1
            ? ` vor ${tageHer} Tagen` : ""}
        </p>
      )}
    </div>
  );
}
