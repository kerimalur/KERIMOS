import "server-only";
import { createClient } from "@supabase/supabase-js";
import { addDays, heuteISO, heuteWochentag, weekStart } from "@/lib/time";
import { kalenderwoche, sortiere, type Wochenziel, type ZielStatus } from "@/lib/wochenziele/typen";
import { erledigtAnhaengen, handlungAus, HANDLUNG_SPALTEN } from "@/lib/routinen/laden";
import { istHeute, sollProWoche, zusatz, type RoutineZiel } from "@/lib/routinen/typen";

/**
 * Lesezugriff auf das Kompass-Projekt für den MCP-Server (28.09.2026).
 *
 * Warum nicht die bestehenden Loader (lib/wochenziele/laden.ts usw.)? Die
 * lesen mit der Cookie-Session des Browsers. Ein MCP-Aufruf von Claude hat
 * keine Session — deshalb hier der Service-Key, und jede Abfrage filtert
 * selbst auf KERIMOS_USER_ID. Vergisst man den Filter, sähe Claude die Zeilen
 * JEDES Benutzers; heute gibt es nur einen, aber darauf verlässt sich der
 * Code nicht.
 *
 * Bewusst NUR lesen: auch die automatische Übernahme offener Wochenziele
 * (die `ladeWochenziele` beim Laden ausführt) passiert hier nicht. Stattdessen
 * werden unfertige Ziele früherer Wochen mitgeliefert und als `ausVorwoche`
 * markiert — dieselbe Sicht, ohne etwas zu verschieben.
 */

export function kompassDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function kerimosUserId(): string | null {
  return process.env.KERIMOS_USER_ID?.trim() || null;
}

/** Client + Benutzer zusammen; wirft mit klarer Meldung, wenn etwas fehlt. */
function zugang() {
  const db = kompassDb();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY oder NEXT_PUBLIC_SUPABASE_URL fehlt (Projekt Kompass).");
  const userId = kerimosUserId();
  if (!userId) throw new Error("KERIMOS_USER_ID fehlt in den Umgebungsvariablen.");
  return { db, userId };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- Wochenziele

export interface WochenzielMcp extends Wochenziel {
  /** Stammt aus einer früheren Woche und ist noch nicht fertig. */
  ausVorwoche: boolean;
  /** Ergebnis der Lernkontrolle, gesetzt über wochenziel_aendern (seit 29.09.2026). */
  lernnotiz: string | null;
}

export async function mcpWochenziele(datum?: string): Promise<{
  woche: string; kw: number; ziele: WochenzielMcp[];
}> {
  const { db, userId } = zugang();
  const aktuell = weekStart(heuteISO());
  const woche = datum && ISO.test(datum) ? weekStart(datum) : aktuell;

  let q = db.from("wochenziele")
    .select("id, woche, titel, details, status, dringend, seit, reihenfolge, erstellt, lernnotiz")
    .eq("user_id", userId);
  q = woche === aktuell
    ? q.or(`woche.eq.${woche},and(woche.lt.${woche},status.neq.fertig)`)
    : q.eq("woche", woche);

  const { data, error } = await q;
  if (error) throw new Error(`wochenziele: ${error.message}`);

  const zeilen = (data ?? []) as Record<string, unknown>[];
  const lern = new Map(zeilen.map((r) => [String(r.id), (r.lernnotiz as string | null) ?? null]));
  const ziele = sortiere(zeilen.map((r) => ({
    id: String(r.id),
    woche: String(r.woche),
    titel: String(r.titel ?? ""),
    details: String(r.details ?? ""),
    status: (r.status as ZielStatus) ?? "offen",
    dringend: Boolean(r.dringend),
    seit: (r.seit as string | null) ?? null,
    reihenfolge: Number(r.reihenfolge ?? 0),
    erstellt: String(r.erstellt ?? ""),
  }))).map((z) => ({ ...z, ausVorwoche: z.woche < woche, lernnotiz: lern.get(z.id) ?? null }));

  return { woche, kw: kalenderwoche(woche), ziele };
}

// ------------------------------------------------------------------- Routinen

export interface RoutineMcp {
  ziel: string;
  notiz: string;
  handlungen: {
    id: string;
    titel: string;
    plan: string;
    uhrzeit: string | null;
    heuteFaellig: boolean;
    heuteErledigt: boolean;
    dieseWoche: string;
  }[];
}

const TAG_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export async function mcpRoutinen(): Promise<{ heute: string; ziele: RoutineMcp[] }> {
  const { db, userId } = zugang();
  const heute = heuteISO();
  const wochentag = heuteWochentag();
  const montag = weekStart(heute);

  const [z, h, e] = await Promise.all([
    db.from("routine_ziele").select("id, titel, notiz, reihenfolge")
      .eq("user_id", userId).order("reihenfolge").order("erstellt"),
    db.from("routine_handlungen").select(HANDLUNG_SPALTEN)
      .eq("user_id", userId).order("reihenfolge").order("erstellt"),
    db.from("routine_erledigt").select("handlung_id, datum")
      .eq("user_id", userId).gte("datum", montag).lte("datum", addDays(montag, 6)),
  ]);
  const fehler = z.error ?? h.error ?? e.error;
  if (fehler) throw new Error(`routinen: ${fehler.message}`);

  const handlungen = erledigtAnhaengen(
    ((h.data ?? []) as Record<string, unknown>[]).map(handlungAus),
    (e.data ?? []) as { handlung_id: string; datum: string }[]);

  const ziele: RoutineZiel[] = ((z.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    titel: String(r.titel ?? ""),
    notiz: String(r.notiz ?? ""),
    reihenfolge: Number(r.reihenfolge ?? 0),
    handlungen: handlungen.filter((x) => x.ziel_id === String(r.id)),
  }));

  return {
    heute,
    ziele: ziele.map((ziel) => ({
      ziel: ziel.titel,
      notiz: ziel.notiz,
      handlungen: ziel.handlungen.map((x) => ({
        id: x.id,
        titel: x.titel,
        plan: x.pro_woche ? `${x.pro_woche}× pro Woche`
          : x.tage.map((t) => TAG_KURZ[t]).join(", ") || "ohne Tage",
        uhrzeit: x.uhrzeit,
        heuteFaellig: istHeute(x, wochentag, heute),
        heuteErledigt: x.erledigt.includes(heute),
        dieseWoche: zusatz(x) ?? `${x.erledigt.length}/${sollProWoche(x)}`,
      })),
    })),
  };
}

// --------------------------------------------------------------- Essen-Notizen

export async function mcpEssenNotizen(von?: string, bis?: string): Promise<{
  von: string; bis: string; notizen: { datum: string; text: string }[];
}> {
  const { db, userId } = zugang();
  const heute = heuteISO();
  const start = von && ISO.test(von) ? von : `${heute.slice(0, 7)}-01`;
  let ende = bis && ISO.test(bis) ? bis : addDays(`${addDays(start, 32).slice(0, 7)}-01`, -1);
  // Obergrenze gegen versehentliche Riesen-Abfragen: gut drei Monate.
  if (ende > addDays(start, 92)) ende = addDays(start, 92);

  const { data, error } = await db.from("essen_notizen")
    .select("datum, text").eq("user_id", userId)
    .gte("datum", start).lte("datum", ende).order("datum");
  if (error) throw new Error(`essen_notizen: ${error.message}`);

  return {
    von: start,
    bis: ende,
    notizen: ((data ?? []) as { datum: string; text: string }[])
      .map((r) => ({ datum: String(r.datum).slice(0, 10), text: String(r.text ?? "") })),
  };
}
