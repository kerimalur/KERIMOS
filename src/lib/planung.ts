import "server-only";
import { createClient } from "@/lib/supabase/server";
import { heuteISO } from "@/lib/time";
import {
  baueMonat, monatsStart, dringlichkeit,
  type KalenderTag, type Dringlichkeit,
} from "@/lib/planung-kalender";

/**
 * Planung — Projekte und Aufgaben.
 *
 * Bildet nach, was Kerim bisher in Notion geführt hat: zwei verknüpfte
 * Datenbanken, mehr nicht. Ein Projekt hat einen Namen. Eine Aufgabe hat
 * einen Namen, einen Haken, optional ein Datum und optional ein Projekt.
 *
 * Die Schmalheit ist der Punkt. Der Vorgänger im Zeit-Bereich hatte
 * Priorität, Lebensbereich, Unteraufgaben und Sortierung — und wurde genau
 * deshalb nicht gepflegt: jede Aufgabe kostete sechs Entscheidungen, von
 * denen fünf niemanden interessierten. Was hier fehlt, fehlt mit Absicht.
 */

export interface Projekt {
  id: string;
  name: string;
  farbe: string;
  sortOrder: number;
  /** Wie viele Aufgaben offen sind — die einzige Zahl auf der Kachel. */
  offen: number;
  gesamt: number;
}

/**
 * "Aufgabe" oder "Habit" — der einzige Unterschied zwischen beiden.
 *
 * Strukturell sind sie dasselbe: eine Zeile mit Namen, Haken und optionalem
 * Tag. Die Kategorie steuert nur, wie sie angezeigt und gefiltert werden.
 * Ein eigenes Modell für Gewohnheiten hätte einen zweiten Kalender, eine
 * zweite Checkbox-Logik und eine zweite Liste bedeutet — für einen
 * Unterschied, der in Wahrheit ein Etikett ist.
 */
export type Kategorie = "Aufgabe" | "Habit";

export const KATEGORIEN: Kategorie[] = ["Aufgabe", "Habit"];

export interface Aufgabe {
  id: string;
  name: string;
  erledigt: boolean;
  /** ISO-Datum oder null. Nur Aufgaben mit Datum stehen im Kalender. */
  faellig: string | null;
  kategorie: Kategorie;
  projektId: string | null;
  projektName: string | null;
  projektFarbe: string | null;
  dringend: Dringlichkeit;
}

export interface PlanungStand {
  projekte: Projekt[];
  aufgaben: Aufgabe[];
  /** True, wenn die Tabellen noch fehlen — dann zeigt die Seite das SQL. */
  tabelleFehlt: boolean;
}

export const PLANUNG_SQL = `-- Projekte und Aufgaben.
create table if not exists planung_projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#9A8C74',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint planung_projects_name_unique unique (user_id, name)
);

alter table planung_projects enable row level security;

drop policy if exists own_planung_projects on planung_projects;
create policy own_planung_projects on planung_projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists planung_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  done       boolean not null default false,
  due_date   date,
  category   text not null default 'Aufgabe'
    check (category in ('Aufgabe', 'Habit')),
  -- set null, nicht cascade: ein geloeschtes Projekt reisst keine Arbeit mit.
  project_id uuid references planung_projects(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);

create index if not exists idx_planung_tasks_offen
  on planung_tasks(user_id, due_date nulls last) where done = false;
create index if not exists idx_planung_tasks_datum
  on planung_tasks(user_id, due_date) where due_date is not null;
create index if not exists idx_planung_tasks_projekt
  on planung_tasks(project_id);
create index if not exists idx_planung_tasks_kategorie
  on planung_tasks(user_id, category) where done = false;

alter table planung_tasks enable row level security;

drop policy if exists own_planung_tasks on planung_tasks;
create policy own_planung_tasks on planung_tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`;

/**
 * Projekte und Aufgaben in einem Zug.
 *
 * Zwei Abfragen statt eines Joins über PostgREST: die Zuordnung von Projekt
 * zu Aufgabe ist eine Zeile Code, und ein eingebettetes `select` lieferte
 * verschachtelte Objekte, die überall im Code wieder ausgepackt werden
 * müssten.
 */
export async function ladePlanung(): Promise<PlanungStand> {
  const supabase = await createClient();
  const heute = heuteISO();

  const [{ data: projektRows, error }, { data: taskRows }] = await Promise.all([
    supabase.from("planung_projects")
      .select("id, name, color, sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("planung_tasks")
      .select("id, name, done, due_date, project_id, category")
      // Offene zuerst, darin die mit dem nächsten Datum. Aufgaben ohne Datum
      // ganz unten: sie drängen nicht, sollen aber nicht verschwinden.
      .order("done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  // 42P01 = Tabelle fehlt, 42703 = Spalte fehlt (Migration 22 noch nicht
  // gelaufen). Beides heisst „noch nicht eingerichtet"; jeder andere Fehler
  // wäre etwas anderes und soll nicht als solcher durchgehen.
  if (error) {
    return {
      projekte: [], aufgaben: [],
      tabelleFehlt: ["42P01", "42703"].includes(error.code),
    };
  }

  const rohProjekte = ((projektRows ?? []) as unknown as Record<string, unknown>[])
    .map((p) => ({
      id: String(p.id),
      name: String(p.name ?? ""),
      farbe: String(p.color ?? "#9A8C74"),
      sortOrder: Number(p.sort_order ?? 0),
    }));

  const nachId = new Map(rohProjekte.map((p) => [p.id, p]));

  const aufgaben = ((taskRows ?? []) as unknown as Record<string, unknown>[])
    .map((t): Aufgabe => {
      const projektId = t.project_id ? String(t.project_id) : null;
      const projekt = projektId ? nachId.get(projektId) : undefined;
      const faellig = t.due_date ? String(t.due_date) : null;
      return {
        id: String(t.id),
        name: String(t.name ?? ""),
        erledigt: t.done === true,
        faellig,
        kategorie: t.category === "Habit" ? "Habit" : "Aufgabe",
        projektId,
        projektName: projekt?.name ?? null,
        projektFarbe: projekt?.farbe ?? null,
        dringend: t.done === true ? "ohne" : dringlichkeit(faellig, heute),
      };
    });

  const projekte = rohProjekte.map((p): Projekt => {
    const eigene = aufgaben.filter((a) => a.projektId === p.id);
    return {
      ...p,
      offen: eigene.filter((a) => !a.erledigt).length,
      gesamt: eigene.length,
    };
  });

  return { projekte, aufgaben, tabelleFehlt: false };
}

export interface KalenderStand {
  monat: string;
  tage: KalenderTag[];
  /** Aufgaben je Tag, ISO-Datum als Schlüssel. */
  proTag: Record<string, Aufgabe[]>;
}

/**
 * Das Kalenderraster eines Monats, mit den Aufgaben an ihren Tagen.
 *
 * Zeigt bewusst ALLE Aufgaben mit Datum, auch die erledigten: der Kalender
 * beantwortet „was war und was kommt", nicht „was ist offen". Die Liste
 * darüber beantwortet das andere.
 */
export function baueKalender(
  aufgaben: Aufgabe[], monat: string | undefined, heute: string,
): KalenderStand {
  const gewaehlt = monatsStart(
    monat && /^\d{4}-\d{2}/.test(monat) ? monat : heute,
  );
  const tage = baueMonat(gewaehlt, heute);

  const proTag: Record<string, Aufgabe[]> = {};
  for (const a of aufgaben) {
    if (!a.faellig) continue;
    (proTag[a.faellig] ??= []).push(a);
  }

  return { monat: gewaehlt, tage, proTag };
}
