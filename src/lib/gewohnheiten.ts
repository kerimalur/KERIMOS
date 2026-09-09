import "server-only";
import { createClient } from "@/lib/supabase/server";
import { heuteISO, addDays, weekStart as toWeekStart } from "@/lib/time";
import {
  streakBis, baueRaster, zaehleZeitraum, type RasterTag,
} from "@/lib/gewohnheiten-zaehlung";

/**
 * Gewohnheiten — ein Haken pro Tag, und die Zählung dazu.
 *
 * Ersetzt seit dem 09.09.2026 die Trainingserfassung im Gym-Bereich. Dort
 * wurden Sätze, Gewichte und Muskelgruppen erfasst, um am Ende eine Frage zu
 * beantworten: war ich diese Woche oft genug da. Der Aufwand stand in keinem
 * Verhältnis, und was nicht erfasst wird, zählt auch nicht.
 *
 * Der Tracker kennt deshalb nur zwei Dinge: eine Gewohnheit und die Tage, an
 * denen sie getan wurde. Alles, was hier steht — Streak, Wochenzahl, Quote —
 * ist aus diesen Tagen gerechnet und nirgends gespeichert; es gibt keinen
 * zweiten Stand, der veralten könnte.
 */

export interface Gewohnheit {
  id: string;
  name: string;
  icon: string | null;
  farbe: string;
  /** Angepeilte Tage pro Woche. 0 = kein Ziel, dann wird nur gezählt. */
  zielProWoche: number;
  /** "gym" steht im Gym-Bereich, alles andere unter /gewohnheiten. */
  bereich: string;
  sortOrder: number;
}

export interface GewohnheitStand extends Gewohnheit {
  /** Ist die Gewohnheit heute schon abgehakt? */
  heuteGetan: boolean;
  /** Tage seit Wochenbeginn (Montag). */
  dieseWoche: number;
  /** Tage in den letzten 30 Tagen. */
  dreissigTage: number;
  /** Tage insgesamt, seit es die Gewohnheit gibt. */
  gesamt: number;
  /** Aufeinanderfolgende Tage bis heute (oder bis gestern, wenn heute offen). */
  streak: number;
  /**
   * Vier Kalenderwochen, Montag bis Sonntag, diese Woche zuletzt.
   * `zukunft` sind die Tage der laufenden Woche, die noch nicht da sind —
   * sie stehen leer da, statt wie ein Versäumnis auszusehen.
   */
  raster: RasterTag[];
}

export const GEWOHNHEITEN_SQL = `-- Gewohnheiten: ein Haken pro Tag.
create table if not exists habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  icon       text,
  color      text not null default '#9A8C74',
  ziel_pro_woche smallint not null default 0
    check (ziel_pro_woche between 0 and 7),
  bereich    text not null default 'allgemein',
  sort_order int not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  constraint habits_name_unique unique (user_id, name)
);

create index if not exists idx_habits_aktiv
  on habits(user_id, bereich, sort_order) where archived = false;

alter table habits enable row level security;

drop policy if exists own_habits on habits;
create policy own_habits on habits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists habit_entries (
  habit_id   uuid not null references habits(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  note       text,
  created_at timestamptz not null default now(),
  primary key (habit_id, entry_date)
);

create index if not exists idx_habit_entries_datum
  on habit_entries(habit_id, entry_date desc);

alter table habit_entries enable row level security;

drop policy if exists own_habit_entries on habit_entries;
create policy own_habit_entries on habit_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`;

export interface GewohnheitenStand {
  gewohnheiten: GewohnheitStand[];
  /** True, wenn die Tabellen noch fehlen — dann zeigt die Seite das SQL. */
  tabelleFehlt: boolean;
}

/**
 * Alle aktiven Gewohnheiten mit ihrer Zählung.
 *
 * @param bereich Nur Gewohnheiten dieses Bereichs, oder alle bei `null`.
 *
 * Zwei Abfragen statt einem Join: die Einträge kommen für alle Gewohnheiten
 * auf einmal und werden hier zugeordnet. Ein Join lieferte eine Zeile je Tag
 * und Gewohnheit, und die Gewohnheit ohne einen einzigen Eintrag fiele
 * entweder raus oder bräuchte ein LEFT JOIN mit lauter NULL-Spalten.
 */
export async function ladeGewohnheiten(
  bereich: string | null = null,
): Promise<GewohnheitenStand> {
  const supabase = await createClient();

  let frage = supabase
    .from("habits")
    .select("id, name, icon, color, ziel_pro_woche, bereich, sort_order")
    .eq("archived", false);
  if (bereich !== null) frage = frage.eq("bereich", bereich);

  const { data: rows, error } = await frage
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // 42P01 = Tabelle fehlt. Jeder andere Fehler wäre etwas anderes und soll
  // nicht als „noch nicht eingerichtet" durchgehen.
  if (error) return { gewohnheiten: [], tabelleFehlt: error.code === "42P01" };

  const gewohnheiten = ((rows ?? []) as unknown as Record<string, unknown>[]).map(
    (h): Gewohnheit => ({
      id: String(h.id),
      name: String(h.name ?? ""),
      icon: h.icon ? String(h.icon) : null,
      farbe: String(h.color ?? "#9A8C74"),
      zielProWoche: Number(h.ziel_pro_woche ?? 0),
      bereich: String(h.bereich ?? "allgemein"),
      sortOrder: Number(h.sort_order ?? 0),
    }),
  );

  if (gewohnheiten.length === 0) return { gewohnheiten: [], tabelleFehlt: false };

  const { data: eintraege } = await supabase
    .from("habit_entries")
    .select("habit_id, entry_date")
    .in("habit_id", gewohnheiten.map((h) => h.id));

  const tage = new Map<string, Set<string>>();
  for (const e of ((eintraege ?? []) as unknown as Record<string, unknown>[])) {
    const id = String(e.habit_id);
    const set = tage.get(id) ?? new Set<string>();
    set.add(String(e.entry_date));
    tage.set(id, set);
  }

  const heute = heuteISO();
  const wochenstart = toWeekStart(heute);
  const vorDreissig = addDays(heute, -29);

  return {
    tabelleFehlt: false,
    gewohnheiten: gewohnheiten.map((h) => {
      const getan = tage.get(h.id) ?? new Set<string>();

      return {
        ...h,
        heuteGetan: getan.has(heute),
        dieseWoche: zaehleZeitraum(getan, wochenstart, heute),
        dreissigTage: zaehleZeitraum(getan, vorDreissig, heute),
        gesamt: getan.size,
        streak: streakBis(getan, heute),
        raster: baueRaster(getan, heute, wochenstart),
      };
    }),
  };
}
