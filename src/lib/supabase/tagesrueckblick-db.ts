import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LEER, type Rueckblick } from "@/lib/tagesrueckblick";
import { haengeAn } from "@/lib/abgleich";

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


/* --------------------------------------------------------- Abhaken */

/**
 * Welche Zeilen aus „Was ist morgen das Wichtigste?" schon erledigt sind.
 *
 * Gespeichert wird der **Text der Zeile**, nicht ihre Nummer. Nummern wären
 * kürzer und falsch: schreibt Kerim abends eine Zeile dazwischen, verschieben
 * sich alle Haken. Der Text ändert sich nicht mehr, sobald der Abend vorbei
 * ist — und ändert er sich doch, ist der Haken zu Recht weg.
 */
export async function ladeErledigt(datum: string): Promise<string[]> {
  const db = await createClient();
  const { data, error } = await db.from(TABELLE)
    .select("tomorrow_done").eq("date", datum).maybeSingle();
  if (error || !data) return [];
  const w = (data as { tomorrow_done: string[] | null }).tomorrow_done;
  return Array.isArray(w) ? w : [];
}

/**
 * Einen Haken setzen oder wegnehmen.
 *
 * Bewusst ein Umschalter und kein „setze auf true": ein Klick auf eine bereits
 * erledigte Zeile soll sie wieder öffnen. Ein Haken, den man nicht zurück-
 * nehmen kann, wird aus Vorsicht nicht gesetzt.
 */
export async function schalteErledigt(
  datum: string, zeile: string,
): Promise<string | null> {
  const vorher = await ladeErledigt(datum);
  const nachher = vorher.includes(zeile)
    ? vorher.filter((x) => x !== zeile)
    : [...vorher, zeile];

  const db = await createClient();
  const { error } = await db.from(TABELLE).upsert({
    date: datum, tomorrow_done: nachher, updated_at: new Date().toISOString(),
  }, { onConflict: "date" });

  if (!error) return null;
  if (istTabelleFehlt(error.code, error.message)) {
    return "Die Spalte tomorrow_done fehlt noch — die SQL steht auf der Startseite.";
  }
  return `Abhaken fehlgeschlagen: ${error.message}`;
}

/** SQL für die Spalte — steht zum Kopieren auf der Startseite. */
export const ERLEDIGT_SQL = `alter table day_review
  add column if not exists tomorrow_done text[] not null default '{}';`;


/* ------------------------------------------------- Gründe und Verschieben */

/**
 * Warum eine Zeile NICHT erledigt wurde — Zeilentext → Grund.
 *
 * Gleiche Überlegung wie bei `tomorrow_done`: der Schlüssel ist der Text der
 * Zeile, nicht ihre Nummer. Schiebt Kerim abends eine Zeile dazwischen,
 * verrutschen Nummern und die Gründe hingen an den falschen Vorsätzen.
 */
export interface Gruende {
  gruende: Record<string, string>;
  /** True, wenn die Spalte `tomorrow_reasons` noch fehlt. */
  spalteFehlt: boolean;
}

export async function ladeGruende(datum: string): Promise<Gruende> {
  const db = await createClient();
  const { data, error } = await db.from(TABELLE)
    .select("tomorrow_reasons").eq("date", datum).maybeSingle();

  // Fehlende Spalte von „nichts eingetragen" unterscheiden: sonst sieht ein
  // vergessener Migrationsschritt aus wie ein leerer Abend, und der Abgleich
  // vergisst lautlos jeden Grund, den Kerim eintippt.
  if (error) {
    const fehlt = error.code === "42703" || error.code === "PGRST204"
      || /column .* does not exist/i.test(error.message);
    return { gruende: {}, spalteFehlt: fehlt };
  }
  if (!data) return { gruende: {}, spalteFehlt: false };

  const w = (data as { tomorrow_reasons: Record<string, string> | null }).tomorrow_reasons;
  return { gruende: w && typeof w === "object" ? w : {}, spalteFehlt: false };
}

/** Grund setzen. Leerer Grund heisst: Eintrag weg, die Zeile ist wieder offen. */
export async function setzeGrund(
  datum: string, zeile: string, grund: string,
): Promise<string | null> {
  const { gruende: vorher } = await ladeGruende(datum);
  const nachher = { ...vorher };
  if (grund.trim()) nachher[zeile] = grund.slice(0, 200);
  else delete nachher[zeile];

  const db = await createClient();
  const { error } = await db.from(TABELLE).upsert({
    date: datum, tomorrow_reasons: nachher, updated_at: new Date().toISOString(),
  }, { onConflict: "date" });

  if (!error) return null;
  if (istTabelleFehlt(error.code, error.message)) {
    return "Die Spalte tomorrow_reasons fehlt noch — die SQL steht auf der Rückblick-Seite.";
  }
  return `Speichern fehlgeschlagen: ${error.message}`;
}

/**
 * Eine Zeile in den Vorsatz eines anderen Tages schreiben.
 *
 * „Auf morgen schieben" heisst wörtlich das: die Zeile landet im Feld
 * „Was ist morgen das Wichtigste?" von HEUTE und steht damit morgen früh
 * wieder auf der Startseite. Ein Verschieben, das nur einen Status setzt,
 * würde die Absicht aus dem Blick nehmen — genau das soll es nicht.
 */
export async function schiebeInVorsatz(
  zielDatum: string, zeile: string,
): Promise<string | null> {
  const { rueckblick } = await ladeRueckblick(zielDatum);
  const neu = haengeAn(rueckblick?.morgen ?? "", zeile);
  if (neu === (rueckblick?.morgen ?? "")) return null;

  return speichereRueckblick(zielDatum, {
    erreicht: rueckblick?.erreicht ?? "",
    liegengeblieben: rueckblick?.liegengeblieben ?? "",
    morgen: neu,
  });
}

/** SQL für die Grund-Spalte — steht zum Kopieren auf der Rückblick-Seite. */
export const GRUENDE_SQL = `alter table day_review
  add column if not exists tomorrow_reasons jsonb not null default '{}'::jsonb;`;
