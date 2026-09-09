import "server-only";
import { createClient } from "@/lib/supabase/server";
import { heuteISO, addDays, weekStart as toWeekStart } from "@/lib/time";
import {
  streakBis, zaehleZeitraum, zaehleVarianten, tageAus, baueMonatsRaster,
  monatsStart, wochenKaestchen, type Eintrag, type RasterTag, type Wochenstand,
} from "@/lib/gewohnheiten-zaehlung";

/**
 * Gewohnheiten — was getan wurde, und wie oft.
 *
 * Ersetzt seit dem 09.09.2026 die Trainingserfassung im Gym-Bereich. Dort
 * wurden Sätze, Gewichte und Muskelgruppen erfasst, um am Ende eine Frage zu
 * beantworten: war ich diese Woche oft genug da. Der Aufwand stand in keinem
 * Verhältnis, und was nicht erfasst wird, zählt auch nicht.
 *
 * Der Tracker kennt deshalb nur zwei Dinge: eine Gewohnheit und die Tage, an
 * denen sie getan wurde. Alles, was hier steht — Serie, Wochenzahl, Aufteilung
 * nach Variante — ist daraus gerechnet und nirgends gespeichert; es gibt keinen
 * zweiten Stand, der veralten könnte.
 *
 * Zwei Ausbaustufen (Migration 20):
 *   **Varianten** — beim Gym Push, Pull, Ausdauer. Eine Gewohnheit statt drei,
 *   damit die Zählung zusammenbleibt und die Aufteilung trotzdem sichtbar ist.
 *   **mitDatum** — solche Gewohnheiten fragen beim Eintragen nach dem Tag,
 *   statt still heute zu nehmen. Ein Training trägt man nach, nicht während.
 */

export interface Gewohnheit {
  id: string;
  name: string;
  icon: string | null;
  farbe: string;
  /** Angepeilte Einheiten pro Woche. 0 = kein Ziel, dann wird nur gezählt. */
  zielProWoche: number;
  /** "gym" steht im Gym-Bereich, alles andere auf der Startseite. */
  bereich: string;
  /**
   * Unterteilungen wie Push / Pull / Ausdauer. Leer heisst: keine, der
   * Haken steht für sich.
   */
  varianten: string[];
  /**
   * Fragt beim Eintragen nach Tag (und Variante), statt heute zu nehmen.
   * Für alles, was man nachträgt statt im Moment abzuhaken.
   */
  mitDatum: boolean;
  sortOrder: number;
}

export interface GewohnheitStand extends Gewohnheit {
  /** Steht heute schon etwas? */
  heuteGetan: boolean;
  /** Was heute schon steht — damit der Dialog es wieder wegnehmen kann. */
  heuteEintraege: Eintrag[];
  /** Einheiten seit Wochenbeginn (Montag). */
  dieseWoche: number;
  /** Aufteilung der Woche nach Variante, häufigste zuerst. */
  wocheNachVariante: { variante: string; anzahl: number }[];
  /** Einheiten in den letzten 30 Tagen. */
  dreissigTage: number;
  /** Einheiten insgesamt. */
  gesamt: number;
  /** Aufeinanderfolgende TAGE bis heute (oder bis gestern, wenn heute offen). */
  streak: number;
  /** Alle Einträge — Grundlage für Raster und Dialog. */
  eintraege: Eintrag[];
  /** Die Kästchenreihe in der Karte: so viele, wie das Wochenziel vorgibt. */
  woche: Wochenstand;
}

/**
 * Ein einzelner eingetragener Tag, angereichert um die Gewohnheit dahinter.
 *
 * Damit erscheinen die Gewohnheiten im Planungskalender neben den Aufgaben:
 * ein Kalender für alles, was an einem Tag passiert ist. Ohne das gäbe es
 * zwei Monatsansichten nebeneinander, die beide behaupten, den Tag zu zeigen.
 */
export interface GewohnheitsMarke {
  habitId: string;
  datum: string;
  name: string;
  farbe: string;
  icon: string | null;
  variante: string | null;
}

/** Eine Gewohnheit samt dem Monat, der gerade im Raster steht. */
export interface GewohnheitMitRaster extends GewohnheitStand {
  /** Erster Tag des angezeigten Monats. */
  monat: string;
  raster: RasterTag[];
}

export const GEWOHNHEITEN_SQL = `-- Gewohnheiten: was getan wurde, und wie oft.
create table if not exists habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  icon       text,
  color      text not null default '#9A8C74',
  ziel_pro_woche smallint not null default 0
    check (ziel_pro_woche between 0 and 7),
  bereich    text not null default 'allgemein',
  varianten  text[] not null default '{}',
  mit_datum  boolean not null default false,
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
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid not null references habits(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  variante   text,
  note       text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_habit_entries_eindeutig
  on habit_entries (habit_id, entry_date, coalesce(variante, ''));

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
    .select("id, name, icon, color, ziel_pro_woche, bereich, varianten, mit_datum, sort_order")
    .eq("archived", false);
  if (bereich !== null) frage = frage.eq("bereich", bereich);

  const { data: rows, error } = await frage
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // 42P01 = Tabelle fehlt, 42703 = Spalte fehlt (Migration 20 noch nicht
  // gelaufen). Beides heisst „noch nicht eingerichtet"; jeder andere Fehler
  // wäre etwas anderes und soll nicht als solcher durchgehen.
  if (error) {
    return { gewohnheiten: [], tabelleFehlt: ["42P01", "42703"].includes(error.code) };
  }

  const gewohnheiten = ((rows ?? []) as unknown as Record<string, unknown>[]).map(
    (h): Gewohnheit => ({
      id: String(h.id),
      name: String(h.name ?? ""),
      icon: h.icon ? String(h.icon) : null,
      farbe: String(h.color ?? "#9A8C74"),
      zielProWoche: Number(h.ziel_pro_woche ?? 0),
      bereich: String(h.bereich ?? "allgemein"),
      varianten: Array.isArray(h.varianten) ? h.varianten.map(String) : [],
      mitDatum: h.mit_datum === true,
      sortOrder: Number(h.sort_order ?? 0),
    }),
  );

  if (gewohnheiten.length === 0) return { gewohnheiten: [], tabelleFehlt: false };

  const { data: rohe } = await supabase
    .from("habit_entries")
    .select("habit_id, entry_date, variante")
    .in("habit_id", gewohnheiten.map((h) => h.id));

  const proGewohnheit = new Map<string, Eintrag[]>();
  for (const e of ((rohe ?? []) as unknown as Record<string, unknown>[])) {
    const id = String(e.habit_id);
    const liste = proGewohnheit.get(id) ?? [];
    liste.push({
      datum: String(e.entry_date),
      variante: e.variante ? String(e.variante) : null,
    });
    proGewohnheit.set(id, liste);
  }

  const heute = heuteISO();
  const wochenstart = toWeekStart(heute);
  const vorDreissig = addDays(heute, -29);

  return {
    tabelleFehlt: false,
    gewohnheiten: gewohnheiten.map((h) =>
      stand(h, proGewohnheit.get(h.id) ?? [], heute, wochenstart, vorDreissig)),
  };
}

function stand(
  h: Gewohnheit, eintraege: Eintrag[],
  heute: string, wochenstart: string, vorDreissig: string,
): GewohnheitStand {
  const nachVariante = zaehleVarianten(eintraege, wochenstart, heute);

  return {
    ...h,
    eintraege,
    heuteGetan: eintraege.some((e) => e.datum === heute),
    heuteEintraege: eintraege.filter((e) => e.datum === heute),
    dieseWoche: zaehleZeitraum(eintraege, wochenstart, heute),
    wocheNachVariante: [...nachVariante.entries()]
      .filter(([v]) => v !== "")
      .map(([variante, anzahl]) => ({ variante, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl || a.variante.localeCompare(b.variante)),
    dreissigTage: zaehleZeitraum(eintraege, vorDreissig, heute),
    gesamt: eintraege.length,
    streak: streakBis(tageAus(eintraege), heute),
    woche: wochenKaestchen(
      zaehleZeitraum(eintraege, wochenstart, heute), h.zielProWoche),
  };
}

/**
 * Dieselben Gewohnheiten, dazu das Raster eines bestimmten Monats.
 *
 * @param monat Irgendein Tag des Monats. Fehlt er, gilt der laufende.
 */
export async function ladeGewohnheitenMitRaster(monat?: string): Promise<{
  gewohnheiten: GewohnheitMitRaster[];
  tabelleFehlt: boolean;
  monat: string;
}> {
  const { gewohnheiten, tabelleFehlt } = await ladeGewohnheiten();
  const heute = heuteISO();
  const gewaehlt = monatsStart(
    monat && /^\d{4}-\d{2}/.test(monat) ? monat : heute,
  );

  return {
    tabelleFehlt,
    monat: gewaehlt,
    gewohnheiten: gewohnheiten.map((h) => ({
      ...h,
      monat: gewaehlt,
      raster: baueMonatsRaster(h.eintraege, gewaehlt, heute),
    })),
  };
}

/**
 * Alle eingetragenen Tage als flache Liste — für den Planungskalender.
 *
 * Bewusst eine eigene, schmale Form statt der ganzen `GewohnheitStand`:
 * der Kalender braucht Name, Farbe und Tag, nicht Serie und Wochenquote.
 * Was er nicht bekommt, kann er auch nicht versehentlich anzeigen.
 */
export async function ladeGewohnheitsMarken(): Promise<GewohnheitsMarke[]> {
  const { gewohnheiten } = await ladeGewohnheiten();

  return gewohnheiten.flatMap((h) =>
    h.eintraege.map((e): GewohnheitsMarke => ({
      habitId: h.id,
      datum: e.datum,
      name: h.name,
      farbe: h.farbe,
      icon: h.icon,
      variante: e.variante,
    })));
}
