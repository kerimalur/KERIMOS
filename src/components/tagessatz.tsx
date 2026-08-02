import { createClient } from "@/lib/supabase/server";
import { createGymClient, gymConfigured } from "@/lib/supabase/gym";
import { fetchTodayMenu, menuConfigured } from "@/lib/supabase/menu";
import { fetchWeather } from "@/lib/weather";
import { WeatherIcon } from "@/components/weather-icon";
import { heuteISO, ZONE } from "@/lib/time";

/**
 * Der eine Satz zum Tag.
 *
 * Ersetzt das Zusammensuchen aus fünf Karten: Ist heute Arbeitstag? Welcher
 * Split ist dran? Ist das Essen geplant? Statt Kacheln zu lesen und selbst
 * zu kombinieren, steht die Antwort da.
 *
 * Das Wetter gehört bewusst hierher und nicht in einen Modus - es entscheidet
 * mit, ob man mit dem Motorrad zur Schicht fährt.
 */
export async function Tagessatz() {
  const supabase = await createClient();
  const heute = heuteISO();
  const gym = gymConfigured() ? createGymClient() : null;

  const [{ data: schichten }, menu, wetter, letzteEinheit] = await Promise.all([
    supabase.from("shifts").select("id, name").limit(5),
    menuConfigured() ? fetchTodayMenu() : Promise.resolve(null),
    fetchWeather(),
    (async () => {
      if (!gym) return null;
      const { data } = await gym.from("v_exercise_progress")
        .select("day, split").order("day", { ascending: false }).limit(1);
      return (data?.[0] as { day: string; split: string | null } | undefined) ?? null;
    })(),
  ]);

  const stunde = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, hour: "numeric", hour12: false,
  }).format(new Date()));

  const wochentag = new Date().toLocaleDateString("de-CH", {
    weekday: "long", timeZone: ZONE,
  });

  // Bausteine sammeln, am Ende zu einem Satz fügen. Was fehlt, fällt weg -
  // lieber ein kurzer wahrer Satz als ein langer mit Platzhaltern.
  const teile: string[] = [];

  // Training: Push und Pull wechseln sich ab
  const dran =
    letzteEinheit?.split?.toLowerCase() === "pull" ? "Push"
      : letzteEinheit?.split?.toLowerCase() === "push" ? "Pull"
        : null;
  const heuteSchonTrainiert = letzteEinheit?.day === heute;

  if (heuteSchonTrainiert) {
    teile.push(`${letzteEinheit?.split ?? "Training"} ist erledigt`);
  } else if (dran) {
    teile.push(`${dran} wäre dran`);
  }

  if (menu && menu.meals.length > 0) {
    const offen = menu.meals.filter((m) => !m.eaten).length;
    teile.push(offen === 0 ? "Essen ist durch" : `noch ${offen} Mahlzeiten offen`);
  } else if (menuConfigured()) {
    teile.push("für heute ist nichts geplant");
  }

  const satz = teile.length > 0
    ? teile.join(", ").replace(/^./, (c) => c.toUpperCase()) + "."
    : "Nichts Dringendes.";

  const gruss =
    stunde < 5 ? "Noch wach"
      : stunde < 11 ? "Morgen"
        : stunde < 14 ? "Mittag"
          : stunde < 18 ? "Nachmittag"
            : stunde < 22 ? "Abend" : "Späte Runde";

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-bold leading-tight text-ink">
          {gruss}, Kerim
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          <span className="capitalize">{wochentag}</span>
          {schichten && schichten.length > 0 ? " · " : " · "}
          {satz}
        </p>
      </div>

      {wetter && (
        <div className="flex shrink-0 items-center gap-2">
          <WeatherIcon name={wetter.icon} className="h-9 w-9" />
          <div className="text-right">
            <p className="tabular text-sm text-ink">
              {wetter.jetzt}°
              <span className="ml-1 text-xs text-ink-muted">
                {wetter.min}–{wetter.max}°
              </span>
            </p>
            <p className="text-[11px] text-ink-muted">
              {wetter.regenChance >= 30 ? `Regen ${wetter.regenChance} %` : wetter.text}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
