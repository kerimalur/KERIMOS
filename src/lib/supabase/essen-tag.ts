import "server-only";
import { createMenuClient } from "@/lib/supabase/menu";

/**
 * Einen Tag im Wochenplan umräumen: löschen, verschieben, kopieren.
 *
 * Zwei Eigenheiten der Datenbank bestimmen den Aufbau:
 *
 * 1. Pro Datum können **mehrere** `meal_plans`-Zeilen existieren (siehe
 *    fetchEssenTag). Beim Verschieben und Kopieren wird deshalb ein Zielplan
 *    gesucht und nur angelegt, wenn es keinen gibt — sonst wachsen die
 *    Karteileichen mit jedem Verschieben.
 *
 * 2. Die Spalten von `meal_items` sind hier nicht vollständig bekannt und
 *    können sich ändern. Kopiert wird deshalb **spaltenagnostisch**: die
 *    Quellzeile wird mit `select("*")` geholt, Schlüssel und Zeitstempel
 *    werden entfernt, der Rest geht unverändert in die neue Zeile. Eine
 *    handgeschriebene Spaltenliste würde beim nächsten Schema-Zusatz still
 *    Daten verlieren.
 */

/** Felder, die beim Kopieren NICHT übernommen werden dürfen. */
const NICHT_KOPIEREN = new Set(["id", "created_at", "updated_at", "plan_id", "meal_id"]);

function ohneSchluessel(zeile: Record<string, unknown>): Record<string, unknown> {
  const kopie: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(zeile)) {
    if (!NICHT_KOPIEREN.has(k)) kopie[k] = v;
  }
  return kopie;
}

export interface TagMahlzeit {
  id: string;
  meal_type: string;
  name: string;
  kcal: number;
}

/** Die Mahlzeiten eines Tages — Grundlage für die Auswahl im Menü. */
export async function ladeTagMahlzeiten(datum: string): Promise<TagMahlzeit[]> {
  const db = createMenuClient();
  if (!db) return [];

  const { data: plans } = await db.from("meal_plans").select("id").eq("date", datum);
  const planIds = (plans ?? []).map((p) => p.id as string);
  if (planIds.length === 0) return [];

  const { data } = await db.from("meals")
    .select("id, meal_type, name, kcal_total").in("plan_id", planIds);

  return ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    meal_type: String(m.meal_type ?? ""),
    name: String(m.name ?? ""),
    kcal: Number(m.kcal_total ?? 0),
  }));
}

/** Plan-ID für ein Datum. Legt einen an, wenn keiner existiert. */
async function zielPlan(
  db: NonNullable<ReturnType<typeof createMenuClient>>, datum: string,
): Promise<string | null> {
  const { data: vorhanden } = await db.from("meal_plans")
    .select("id").eq("date", datum).limit(1);
  if (vorhanden && vorhanden.length > 0) return String(vorhanden[0].id);

  const { data, error } = await db.from("meal_plans")
    .insert({ date: datum }).select("id").single();
  return error || !data ? null : String(data.id);
}

/**
 * Die Summen eines Plans neu rechnen.
 *
 * Muss nach jedem Eingriff laufen: `meal_plans.kcal_total` ist eine
 * gespeicherte Summe, keine berechnete Spalte. Ohne diesen Schritt zeigte
 * die Wochenansicht nach dem Verschieben weiter die alten Zahlen — und man
 * würde es erst Tage später merken.
 */
async function summenNeu(
  db: NonNullable<ReturnType<typeof createMenuClient>>, planId: string,
): Promise<void> {
  const { data } = await db.from("meals")
    .select("kcal_total, protein_total").eq("plan_id", planId);

  const kcal = (data ?? []).reduce((s, m) => s + Number(m.kcal_total ?? 0), 0);
  const protein = (data ?? []).reduce((s, m) => s + Number(m.protein_total ?? 0), 0);

  await db.from("meal_plans")
    .update({ kcal_total: Math.round(kcal), protein_total: Math.round(protein) })
    .eq("id", planId);
}

/** Pläne, zu denen die Mahlzeiten gehören — für das Nachrechnen der Summen. */
async function plaeneVon(
  db: NonNullable<ReturnType<typeof createMenuClient>>, mealIds: string[],
): Promise<string[]> {
  if (mealIds.length === 0) return [];
  const { data } = await db.from("meals").select("plan_id").in("id", mealIds);
  return [...new Set((data ?? []).map((m) => String(m.plan_id)))];
}

/* ------------------------------------------------------------- Löschen */

export async function loescheMahlzeiten(mealIds: string[]): Promise<string | null> {
  const db = createMenuClient();
  if (!db) return "Menü-Datenbank nicht verbunden.";
  if (mealIds.length === 0) return "Nichts ausgewählt.";

  const betroffen = await plaeneVon(db, mealIds);

  // Zutaten zuerst: ohne Fremdschlüssel mit ON DELETE CASCADE bleiben sonst
  // verwaiste meal_items liegen, die niemand mehr findet.
  await db.from("meal_items").delete().in("meal_id", mealIds);
  const { error } = await db.from("meals").delete().in("id", mealIds);
  if (error) return `Löschen fehlgeschlagen: ${error.message}`;

  for (const p of betroffen) await summenNeu(db, p);
  return null;
}

/* ------------------------------------------------------------- Verschieben */

export async function verschiebeMahlzeiten(
  mealIds: string[], zielDatum: string,
): Promise<string | null> {
  const db = createMenuClient();
  if (!db) return "Menü-Datenbank nicht verbunden.";
  if (mealIds.length === 0) return "Nichts ausgewählt.";

  const herkunft = await plaeneVon(db, mealIds);
  const ziel = await zielPlan(db, zielDatum);
  if (!ziel) return "Zieltag konnte nicht angelegt werden.";

  // Verschieben ist nur ein Wechsel des Elternplans - die Zutaten hängen an
  // der Mahlzeit und wandern von selbst mit.
  const { error } = await db.from("meals").update({ plan_id: ziel }).in("id", mealIds);
  if (error) return `Verschieben fehlgeschlagen: ${error.message}`;

  for (const p of [...new Set([...herkunft, ziel])]) await summenNeu(db, p);
  return null;
}

/* ------------------------------------------------------------- Kopieren */

export async function kopiereMahlzeiten(
  mealIds: string[], zielDatum: string,
): Promise<string | null> {
  const db = createMenuClient();
  if (!db) return "Menü-Datenbank nicht verbunden.";
  if (mealIds.length === 0) return "Nichts ausgewählt.";

  const ziel = await zielPlan(db, zielDatum);
  if (!ziel) return "Zieltag konnte nicht angelegt werden.";

  const { data: quellen, error: leseFehler } = await db.from("meals")
    .select("*").in("id", mealIds);
  if (leseFehler) return `Kopieren fehlgeschlagen: ${leseFehler.message}`;

  for (const quelle of (quellen ?? []) as Record<string, unknown>[]) {
    const { data: neu, error } = await db.from("meals")
      .insert({ ...ohneSchluessel(quelle), plan_id: ziel })
      .select("id").single();
    if (error || !neu) return `Kopieren fehlgeschlagen: ${error?.message ?? "unbekannt"}`;

    const { data: zutaten } = await db.from("meal_items")
      .select("*").eq("meal_id", String(quelle.id));

    const neueZutaten = ((zutaten ?? []) as Record<string, unknown>[])
      .map((z) => ({ ...ohneSchluessel(z), meal_id: String(neu.id) }));

    if (neueZutaten.length > 0) {
      const { error: zutatFehler } = await db.from("meal_items").insert(neueZutaten);
      if (zutatFehler) {
        // Die Mahlzeit steht schon, die Zutaten fehlen - das ist ein halber
        // Zustand, den man kennen muss statt ihn zu verschweigen.
        return `Mahlzeit kopiert, Zutaten nicht: ${zutatFehler.message}`;
      }
    }
  }

  await summenNeu(db, ziel);
  return null;
}
