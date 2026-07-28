import Link from "next/link";
import { addBodyWeight } from "@/lib/actions";
import { createGymClient, gymConfigured, type BodyWeightEntry } from "@/lib/supabase/gym";
import { fetchTodayMenu, menuConfigured, MEAL_LABEL } from "@/lib/supabase/menu";
import { Button, Card, Input } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { weekStart } from "@/lib/time";

const heute = () => new Date().toISOString().slice(0, 10);

/** Wochenziel laut Plan: 4x Kraft, 1-2x Ausdauer. */
const KRAFT_ZIEL = 4;
const AUSDAUER_ZIEL = "1–2";

/**
 * "Heute"-Karte fürs Cockpit: heutiges Menü, Körpergewicht (mit Eintrag),
 * Training des Tages. Die Daten, die man mehrmals täglich sehen will —
 * ohne in einen Modus zu wechseln.
 */
export async function TodayCard() {
  const gym = gymConfigured() ? createGymClient() : null;

  const [menu, weight, training, woche] = await Promise.all([
    menuConfigured() ? fetchTodayMenu() : Promise.resolve(null),
    (async () => {
      if (!gym) return null;
      const { data } = await gym.from("body_weight_entries")
        .select("entry_date, weight_kg")
        .order("entry_date", { ascending: false }).limit(1);
      return (data?.[0] as BodyWeightEntry | undefined) ?? null;
    })(),
    (async () => {
      if (!gym) return null;
      const { data } = await gym.from("v_exercise_progress")
        .select("day, split").order("day", { ascending: false }).limit(1);
      return (data?.[0] as { day: string; split: string | null } | undefined) ?? null;
    })(),
    // Wochenstand: Krafttage + Ausdauertage seit Montag
    (async () => {
      if (!gym) return null;
      const wk = weekStart(new Date());
      const [{ data: kraft }, { data: cardio }] = await Promise.all([
        gym.from("v_exercise_progress").select("day").gte("day", wk),
        gym.from("cardio_logs").select("completed_at")
          .gte("completed_at", `${wk}T00:00:00`),
      ]);
      return {
        kraft: new Set((kraft ?? []).map((r) => String(r.day))).size,
        ausdauer: new Set(
          (cardio ?? []).map((r) => String(r.completed_at).slice(0, 10))
        ).size,
      };
    })(),
  ]);

  return (
    <Card className="p-5">
      <div className="grid gap-5 sm:grid-cols-3">
        {/* Menü heute */}
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Essen heute
          </div>
          {!menuConfigured() ? (
            <p className="mt-2 text-xs text-ink-muted">
              Menü-DB nicht verbunden (läuft über den Gym-Zugang).
            </p>
          ) : !menu || menu.meals.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Nichts geplant.</p>
          ) : (
            <>
              <ul className="mt-2 space-y-1">
                {menu.meals.map((m, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-sm">
                    <span className="w-16 shrink-0 text-xs text-ink-muted">
                      {MEAL_LABEL[m.meal_type] ?? m.meal_type}
                    </span>
                    <span className="truncate text-ink">{m.name}</span>
                  </li>
                ))}
              </ul>
              <p className="tabular mt-2 text-xs text-ink-muted">
                {Math.round(menu.kcal)} kcal · {Math.round(menu.protein)} g Protein
              </p>
            </>
          )}
        </div>

        {/* Gewicht */}
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Gewicht
          </div>
          {!gym ? (
            <p className="mt-2 text-xs text-ink-muted">Gym-DB nicht verbunden.</p>
          ) : (
            <>
              <p className="tabular mt-2 text-sm text-ink">
                {weight ? `${Number(weight.weight_kg).toFixed(1)} kg` : "—"}
                {weight && (
                  <span className="ml-1.5 text-xs text-ink-muted">
                    {weight.entry_date === heute() ? "heute" : dateLabel(weight.entry_date)}
                  </span>
                )}
              </p>
              {weight?.entry_date !== heute() && (
                <form action={addBodyWeight} className="mt-2 flex items-center gap-2">
                  <Input name="weight_kg" type="number" inputMode="decimal"
                    step="0.1" min="30" max="250" required
                    placeholder="kg" className="w-24" aria-label="Gewicht heute" />
                  <Button type="submit" variant="ghost" className="px-3 py-1.5 text-xs">
                    Eintragen
                  </Button>
                </form>
              )}
            </>
          )}
        </div>

        {/* Training */}
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Training
          </div>
          {!gym ? (
            <p className="mt-2 text-xs text-ink-muted">Gym-DB nicht verbunden.</p>
          ) : (
            <>
              {woche && (
                <p className="tabular mt-2 text-sm">
                  <span className={woche.kraft >= KRAFT_ZIEL ? "text-good" : "text-ink"}>
                    Kraft {woche.kraft}/{KRAFT_ZIEL}
                  </span>
                  <span className="text-ink-muted"> · </span>
                  <span className={woche.ausdauer >= 1 ? "text-good" : "text-ink"}>
                    Ausdauer {woche.ausdauer}/{AUSDAUER_ZIEL}
                  </span>
                </p>
              )}
              {training ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {training.day === heute() ? (
                    <>{training.split ?? "Einheit"} <span className="text-good">✓ heute</span></>
                  ) : (
                    <>Zuletzt {training.split ?? "Einheit"} am {dateLabel(training.day)}</>
                  )}
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink-muted">Noch keine Einheit erfasst.</p>
              )}
            </>
          )}
          <Link href="/m/Gym" className="mt-1.5 inline-block text-xs text-accent-soft hover:underline">
            Zum Gym-Modus →
          </Link>
        </div>
      </div>
    </Card>
  );
}
