import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Wochenziele — die zwei, drei grossen Dinge, die diese Woche passieren sollen.
 *
 * Der Unterschied zu einer Aufgabe ist der Zeithorizont, nicht die Grösse:
 * Eine Aufgabe hat eine Frist und verschwindet, wenn sie erledigt ist. Ein
 * Wochenziel steht die ganze Woche auf der Startseite, auch wenn schon der
 * halbe Haken dran ist — es soll einen anschauen. Genau deshalb liegt es in
 * einer eigenen Tabelle und nicht als `tasks`-Zeile mit Sonderflag: eine
 * Aufgabe unter fünfzig anderen ist kein Ziel mehr.
 */

export interface Wochenziel {
  id: string;
  weekStart: string;
  titel: string;
  erledigtAm: string | null;
  sortOrder: number;
}

export const WOCHENZIELE_SQL = `-- Wochenziele: die grossen Dinge einer Woche.
create table if not exists weekly_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  title      text not null,
  done_at    timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_weekly_goals_week
  on weekly_goals(user_id, week_start, sort_order);

alter table weekly_goals enable row level security;

drop policy if exists own_weekly_goals on weekly_goals;
create policy own_weekly_goals on weekly_goals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`;

export interface ZielListe {
  ziele: Wochenziel[];
  /** True, wenn die Tabelle noch fehlt — dann zeigt die Seite das SQL. */
  tabelleFehlt: boolean;
}

export async function ladeWochenziele(weekStart: string): Promise<ZielListe> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_goals")
    .select("id, week_start, title, done_at, sort_order")
    .eq("week_start", weekStart)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // 42P01 = Tabelle fehlt. Jeder andere Fehler wäre etwas anderes und soll
  // nicht als „noch nicht eingerichtet" durchgehen.
  if (error) return { ziele: [], tabelleFehlt: error.code === "42P01" };

  return {
    tabelleFehlt: false,
    ziele: ((data ?? []) as unknown as Record<string, unknown>[]).map((z) => ({
      id: String(z.id),
      weekStart: String(z.week_start),
      titel: String(z.title ?? ""),
      erledigtAm: z.done_at ? String(z.done_at) : null,
      sortOrder: Number(z.sort_order ?? 0),
    })),
  };
}
