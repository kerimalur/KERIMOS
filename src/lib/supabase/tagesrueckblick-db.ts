import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LEER, type Rueckblick } from "@/lib/tagesrueckblick";

/**
 * Der Tagesrückblick in der KerimOS-Hauptdatenbank.
 *
 * Eine Zeile je Tag, `date` als Primärschlüssel — damit ist ein zweiter
 * Rückblick am selben Abend automatisch ein Update statt einer Dublette.
 */

export const TABELLE = "day_review";

function istTabelleFehlt(code: string | undefined, nachricht: string): boolean {
  return code === "42P01" || code === "PGRST205" || /does not exist/i.test(nachricht);
}

export interface Geladen {
  rueckblick: Rueckblick | null;
  tabelleFehlt: boolean;
}

export async function ladeRueckblick(datum: string): Promise<Geladen> {
  const db = await createClient();
  const { data, error } = await db.from(TABELLE)
    .select("date, achieved, unfinished, tomorrow").eq("date", datum).maybeSingle();

  if (error) return { rueckblick: null, tabelleFehlt: istTabelleFehlt(error.code, error.message) };
  if (!data) return { rueckblick: null, tabelleFehlt: false };

  const z = data as unknown as {
    date: string; achieved: string | null;
    unfinished: string | null; tomorrow: string | null;
  };
  return {
    rueckblick: {
      datum: z.date.slice(0, 10),
      erreicht: z.achieved ?? "",
      liegengeblieben: z.unfinished ?? "",
      morgen: z.tomorrow ?? "",
    },
    tabelleFehlt: false,
  };
}

/** Die letzten `tage` Tage mit Rückblick — für die Serie. */
export async function ladeTageMitRueckblick(seit: string): Promise<string[]> {
  const db = await createClient();
  const { data, error } = await db.from(TABELLE)
    .select("date").gte("date", seit).order("date", { ascending: false });
  if (error) return [];
  return ((data ?? []) as { date: string }[]).map((z) => z.date.slice(0, 10));
}

/** Die letzten Rückblicke im Volltext — für den Wochenrückblick. */
export async function ladeRueckblicke(von: string, bis: string): Promise<Rueckblick[]> {
  const db = await createClient();
  const { data, error } = await db.from(TABELLE)
    .select("date, achieved, unfinished, tomorrow")
    .gte("date", von).lte("date", bis).order("date", { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as {
    date: string; achieved: string | null;
    unfinished: string | null; tomorrow: string | null;
  }[]).map((z) => ({
    datum: z.date.slice(0, 10),
    erreicht: z.achieved ?? "",
    liegengeblieben: z.unfinished ?? "",
    morgen: z.tomorrow ?? "",
  }));
}

export async function speichereRueckblick(
  datum: string, werte: Omit<Rueckblick, "datum">,
): Promise<string | null> {
  const db = await createClient();
  const { error } = await db.from(TABELLE).upsert({
    date: datum,
    achieved: werte.erreicht || null,
    unfinished: werte.liegengeblieben || null,
    tomorrow: werte.morgen || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "date" });

  if (!error) return null;
  if (istTabelleFehlt(error.code, error.message)) {
    return "Die Tabelle day_review fehlt noch — die SQL steht auf dieser Seite.";
  }
  return `Speichern fehlgeschlagen: ${error.message}`;
}

export async function loescheRueckblick(datum: string): Promise<void> {
  const db = await createClient();
  await db.from(TABELLE).delete().eq("date", datum);
}

export { LEER };

export const RUECKBLICK_SQL = `create table if not exists day_review (
  date       date primary key,
  achieved   text,
  unfinished text,
  tomorrow   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);`;
