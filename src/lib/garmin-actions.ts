"use server";
import { revalidatePath } from "next/cache";
import { createGymClient } from "@/lib/supabase/gym";

/**
 * Server Actions für den Garmin-Bereich.
 *
 * Bewusst eine eigene Datei statt in actions.ts: der Garmin-Import ist ein
 * abgeschlossenes Thema und soll die gewachsene Sammlung dort nicht weiter
 * aufblähen.
 */

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Die Uhr misst keinen RIR. Übernommene Sätze bekommen diesen Wert, statt den
 * DB-Default 2 zu erben - so bleiben sie vom manuellen Tracking unterscheidbar.
 */
const IMPORT_RIR = 1;

const PULL_MUSKELN = new Set(["rücken", "ruecken", "bizeps"]);
const PUSH_MUSKELN = new Set(["brust", "schultern", "trizeps"]);

type Client = NonNullable<ReturnType<typeof createGymClient>>;

/** exercise_id -> Name der primären Muskelgruppe, klein geschrieben. */
async function ladeMuskelzuordnung(supabase: Client): Promise<Map<string, string>> {
  const [{ data: gruppen }, { data: uebungen }] = await Promise.all([
    supabase.from("muscle_groups").select("id, name"),
    supabase.from("exercises").select("id, primary_muscle_id"),
  ]);

  const namen = new Map(
    (gruppen ?? []).map((g) => [
      g.id as string,
      String(g.name ?? "").trim().toLowerCase(),
    ]),
  );
  return new Map(
    (uebungen ?? []).map((e) => [
      e.id as string,
      namen.get(e.primary_muscle_id as string) ?? "",
    ]),
  );
}

/**
 * Push oder Pull anhand der trainierten Muskelgruppen.
 *
 * Zählt die Sätze je Lager statt die Übungen — vier Sätze Rudern und ein Satz
 * Seitheben sind eindeutig Pull. Bei Gleichstand bleibt es offen.
 */
function erkenneSplit(
  exerciseIds: string[], muskeln: Map<string, string>,
): "push" | "pull" | null {
  let push = 0;
  let pull = 0;
  for (const id of exerciseIds) {
    const muskel = muskeln.get(id) ?? "";
    if (PULL_MUSKELN.has(muskel)) pull += 1;
    if (PUSH_MUSKELN.has(muskel)) push += 1;
  }
  if (pull > push) return "pull";
  if (push > pull) return "push";
  return null;
}

/**
 * Trainingstag für die übernommene Einheit.
 *
 * `workout_sessions.training_day_id` ist NOT NULL. Passt der erkannte Split
 * auf einen bestehenden Trainingstag, wird der genommen — in der Datenbank
 * liegen "Push"/"Pull" doppelt, massgeblich ist der mit den meisten Sessions.
 * Sonst fällt es auf einen eigenen Tag "Garmin" zurück.
 */
async function ermittleTrainingDay(
  supabase: Client, userId: string, split: "push" | "pull" | null,
): Promise<string> {
  const { data: tage } = await supabase
    .from("training_days").select("id, name").eq("user_id", userId);

  if (split) {
    const { data: sessions } = await supabase
      .from("workout_sessions").select("training_day_id").eq("user_id", userId);

    const haeufigkeit = new Map<string, number>();
    for (const s of sessions ?? []) {
      const id = s.training_day_id as string | null;
      if (id) haeufigkeit.set(id, (haeufigkeit.get(id) ?? 0) + 1);
    }

    const kandidaten = (tage ?? []).filter(
      (t) => String(t.name ?? "").trim().toLowerCase() === split,
    );
    if (kandidaten.length > 0) {
      const beste = kandidaten.reduce((a, b) =>
        (haeufigkeit.get(b.id as string) ?? 0) > (haeufigkeit.get(a.id as string) ?? 0) ? b : a,
      );
      return beste.id as string;
    }
  }

  const garminTag = (tage ?? []).find((t) => String(t.name ?? "").trim() === "Garmin");
  if (garminTag) return garminTag.id as string;

  const { data: angelegt, error } = await supabase
    .from("training_days")
    .insert({
      user_id: userId,
      name: "Garmin",
      description: "Von der Uhr importierte Einheiten - kein geplanter Split",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Trainingstag anlegen: ${error.message}`);
  return angelegt.id as string;
}

/**
 * Ordnet eine Garmin-Übung einer Übung aus `exercises` zu.
 *
 * `garminKey` kommt als "KATEGORIE" oder "KATEGORIE/NAME". Ohne Namensteil
 * wird '*' gespeichert - das gilt dann als Fallback für die ganze Kategorie.
 */
export async function saveGarminMapping(fd: FormData) {
  const garminKey = text(fd, "garminKey");
  const exerciseId = text(fd, "exerciseId");
  if (!garminKey || !exerciseId) return;

  const [kategorie, name] = garminKey.split("/");

  const supabase = createGymClient();
  if (!supabase) throw new Error("Gym-Datenbank nicht verbunden");

  const { error } = await supabase.from("garmin_exercise_map").upsert(
    {
      garmin_category: kategorie,
      garmin_name: name || "*",
      exercise_id: exerciseId,
    },
    { onConflict: "garmin_category,garmin_name" },
  );
  if (error) throw new Error(`Zuordnung speichern: ${error.message}`);

  revalidatePath("/gym/garmin");
}

export async function deleteGarminMapping(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createGymClient();
  if (!supabase) throw new Error("Gym-Datenbank nicht verbunden");

  const { error } = await supabase.from("garmin_exercise_map").delete().eq("id", id);
  if (error) throw new Error(`Zuordnung löschen: ${error.message}`);

  revalidatePath("/gym/garmin");
}

/**
 * Übernimmt ein geprüftes Training aus der Vorschau in den Verlauf.
 *
 * Erwartet aus dem Formular:
 *   importId                      - die Vorschau-Session
 *   uebung__<garminKey>           - Ziel-Übung; leer = diese Gruppe auslassen
 *   merken__<garminKey>           - "on", wenn die Zuordnung dauerhaft gelten soll
 *   gewicht__<satzId>, reps__<satzId> - die korrigierten Werte je Satz
 *
 * Die Satznummer entsteht erst hier: sie hängt an der Zielübung, und die kann
 * sich in der Vorschau noch ändern.
 */
export async function uebernehmeGarminImport(fd: FormData) {
  const importId = text(fd, "importId");
  if (!importId) return;

  const supabase = createGymClient();
  if (!supabase) throw new Error("Gym-Datenbank nicht verbunden");

  const { data: kopf, error: kopfFehler } = await supabase
    .from("garmin_import_sessions")
    .select("id, user_id, garmin_activity_id, started_at, completed_at, status")
    .eq("id", importId)
    .single();
  if (kopfFehler || !kopf) throw new Error("Vorschau nicht gefunden");
  if (kopf.status !== "offen") return; // schon übernommen oder verworfen

  const { data: saetze } = await supabase
    .from("garmin_import_saetze")
    .select("id, position, garmin_key, weight_kg, reps, completed_at")
    .eq("import_session_id", importId)
    .order("position");

  if (!saetze?.length) throw new Error("Vorschau enthält keine Sätze");

  // --- Zuordnung aus dem Formular, je Garmin-Bezeichnung -------------------
  const zuordnung = new Map<string, string>();
  const merken = new Set<string>();
  for (const key of new Set(saetze.map((z) => z.garmin_key as string))) {
    const gewaehlt = text(fd, `uebung__${key}`);
    if (gewaehlt) zuordnung.set(key, gewaehlt);
    if (fd.get(`merken__${key}`)) merken.add(key);
  }

  // --- Logzeilen bauen ----------------------------------------------------
  const zaehler = new Map<string, number>();
  const uebersprungen = new Map<string, number>();
  const logzeilen: Record<string, unknown>[] = [];

  for (const z of saetze) {
    const key = z.garmin_key as string;
    const exerciseId = zuordnung.get(key);
    if (!exerciseId) {
      uebersprungen.set(key, (uebersprungen.get(key) ?? 0) + 1);
      continue;
    }

    const nummer = (zaehler.get(exerciseId) ?? 0) + 1;
    zaehler.set(exerciseId, nummer);

    // Formularwert schlägt den Garmin-Wert. Leeres Feld = Garmin-Wert behalten.
    const rohGewicht = text(fd, `gewicht__${z.id as string}`);
    const rohReps = text(fd, `reps__${z.id as string}`);
    const gewicht = rohGewicht === "" ? Number(z.weight_kg ?? 0) : Number(rohGewicht);
    const reps = rohReps === "" ? Number(z.reps ?? 0) : Number(rohReps);

    logzeilen.push({
      exercise_id: exerciseId,
      set_number: nummer,
      weight_kg: Number.isFinite(gewicht) ? gewicht : 0,
      reps: Number.isFinite(reps) ? Math.round(reps) : 0,
      rir: IMPORT_RIR,
      completed_at: z.completed_at,
    });
  }

  if (logzeilen.length === 0) {
    throw new Error("Kein einziger Satz zugeordnet — so entsteht kein Training.");
  }

  // --- Zielübungen dauerhaft merken --------------------------------------
  // Bewusst vor dem Anlegen der Session: schlägt es hier fehl, ist noch
  // nichts im Verlauf gelandet und der Durchgang lässt sich wiederholen.
  for (const key of merken) {
    const exerciseId = zuordnung.get(key);
    if (!exerciseId) continue;
    const [kategorie, name] = key.split("/");
    const { error } = await supabase.from("garmin_exercise_map").upsert(
      { garmin_category: kategorie, garmin_name: name || "*", exercise_id: exerciseId },
      { onConflict: "garmin_category,garmin_name" },
    );
    if (error) throw new Error(`Zuordnung speichern: ${error.message}`);
  }

  // --- Session anlegen ----------------------------------------------------
  const userId = kopf.user_id as string;
  const muskeln = await ladeMuskelzuordnung(supabase);
  const split = erkenneSplit(
    logzeilen.map((z) => z.exercise_id as string), muskeln,
  );
  const trainingDayId = await ermittleTrainingDay(supabase, userId, split);

  const notizteile = [`Garmin-Import (Aktivität ${kopf.garmin_activity_id})`];
  if (split) notizteile.push(`Erkannt als ${split[0].toUpperCase()}${split.slice(1)}`);
  for (const [key, anzahl] of [...uebersprungen].sort()) {
    notizteile.push(`Ausgelassen: ${key} (${anzahl} Sätze)`);
  }

  const { data: session, error: sessionFehler } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: userId,
      training_day_id: trainingDayId,
      started_at: kopf.started_at,
      completed_at: kopf.completed_at,
      notes: notizteile.join(" | "),
      log_source: "garmin",
      garmin_activity_id: kopf.garmin_activity_id,
    })
    .select("id")
    .single();
  if (sessionFehler || !session) {
    throw new Error(`Session anlegen: ${sessionFehler?.message ?? "unbekannt"}`);
  }

  const sessionId = session.id as string;

  const { error: logFehler } = await supabase.from("exercise_logs").insert(
    logzeilen.map((z) => ({ ...z, workout_session_id: sessionId })),
  );
  if (logFehler) {
    // Ohne Sätze ist die Session wertlos - und sie würde wegen der eindeutigen
    // garmin_activity_id jeden weiteren Versuch blockieren. Supabase kennt
    // keine Transaktion über zwei Aufrufe, also hier von Hand zurücknehmen.
    await supabase.from("workout_sessions").delete().eq("id", sessionId);
    throw new Error(`Sätze schreiben: ${logFehler.message}`);
  }

  await supabase
    .from("garmin_import_sessions")
    .update({ status: "uebernommen" })
    .eq("id", importId);

  revalidatePath("/gym/garmin");
  revalidatePath("/gym/verlauf");
  revalidatePath("/gym");
}

/** Verwirft ein Training aus der Vorschau. Es kommt beim Sync nicht wieder. */
export async function verwerfeGarminImport(fd: FormData) {
  const importId = text(fd, "importId");
  if (!importId) return;

  const supabase = createGymClient();
  if (!supabase) throw new Error("Gym-Datenbank nicht verbunden");

  const { error } = await supabase
    .from("garmin_import_sessions")
    .update({ status: "verworfen" })
    .eq("id", importId);
  if (error) throw new Error(`Verwerfen: ${error.message}`);

  revalidatePath("/gym/garmin");
}

/**
 * Gibt ein verworfenes Training wieder frei und synchronisiert sofort neu.
 *
 * "Verwerfen" markiert nur den Status - die garmin_activity_id bleibt in
 * garmin_import_sessions stehen und blockiert damit jeden künftigen Sync
 * (siehe Docstring dort: "auch verworfene sollen nicht wieder auftauchen").
 * Das ist im Normalfall richtig (kein Alert-Sturm auf längst Verworfenes),
 * aber falsch, wenn Kerim das Training auf der Uhr/App danach noch
 * korrigiert hat und es einfach nochmal haben will. Hier wird der Eintrag
 * komplett gelöscht (Sätze zuerst, dann die Session), damit der nächste
 * Sync die Aktivität wie neu behandelt - und der Sync läuft direkt mit an,
 * damit man nicht bis zum nächtlichen Cron warten muss.
 */
export async function reaktiviereGarminImport(fd: FormData): Promise<string> {
  const importId = text(fd, "importId");
  if (!importId) return "Keine ID übergeben.";

  const supabase = createGymClient();
  if (!supabase) throw new Error("Gym-Datenbank nicht verbunden");

  const { data: kopf } = await supabase
    .from("garmin_import_sessions")
    .select("id, status")
    .eq("id", importId)
    .maybeSingle();
  if (!kopf) return "Eintrag nicht mehr vorhanden - vermutlich schon freigegeben.";
  if (kopf.status !== "verworfen") {
    return "Nur verworfene Trainings lassen sich so erneut versuchen.";
  }

  await supabase.from("garmin_import_saetze").delete().eq("import_session_id", importId);
  const { error } = await supabase
    .from("garmin_import_sessions")
    .delete()
    .eq("id", importId);
  if (error) throw new Error(`Freigeben: ${error.message}`);

  revalidatePath("/gym/garmin");

  return `Freigegeben. ${await triggerGarminSync()}`;
}

/**
 * Stösst den Sync von Hand an.
 *
 * Der Endpoint ist eine Python-Function und lebt ausserhalb von Next.js,
 * deshalb der Umweg über fetch. Das CRON_SECRET bleibt serverseitig - der
 * Browser sieht es nie.
 */
export async function triggerGarminSync(): Promise<string> {
  const basis = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

  const geheimnis = process.env.CRON_SECRET;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  const headers: Record<string, string> = {};
  if (geheimnis) headers.Authorization = `Bearer ${geheimnis}`;
  // Das Projekt steht hinter Vercel Authentication. Ohne diesen Header
  // antwortet Vercel dem eigenen Server mit der Login-Seite statt mit der
  // Function. Der Cron braucht ihn nicht - der läuft intern.
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;

  try {
    const antwort = await fetch(`${basis}/api/garmin-sync`, {
      headers,
      cache: "no-store",
    });

    const typ = antwort.headers.get("content-type") ?? "";
    if (!typ.includes("application/json")) {
      return bypass
        ? `Unerwartete Antwort (${antwort.status}) von ${basis} — kein JSON.`
        : "Vercel hat die Login-Seite geliefert statt den Sync. " +
          "In den Projekt-Einstellungen unter Deployment Protection " +
          "\"Protection Bypass for Automation\" aktivieren und neu deployen.";
    }

    const ergebnis = await antwort.json();

    revalidatePath("/gym/garmin");
    revalidatePath("/gym/verlauf");

    if (!ergebnis.ok) return `Fehler: ${ergebnis.fehler ?? "unbekannt"}`;

    const kern =
      `${ergebnis.gefunden} Krafttrainings gefunden, ${ergebnis.vorgemerkt} zur Prüfung ` +
      `vorgemerkt, ${ergebnis.uebersprungen} schon vorhanden.`;

    // Ausdauer separat - lief bisher gar nicht in dieser Meldung mit, obwohl
    // der Sync es längst mitschickt. Ohne das sieht man nie, ob ein Lauf
    // gefunden, aber z.B. mangels passender Cardio-Übung nicht importiert wurde.
    const ausdauerGefunden = ergebnis.ausdauer_gefunden ?? 0;
    const ausdauerText = ausdauerGefunden === 0
      ? " Keine Ausdauereinheit gefunden."
      : ` ${ausdauerGefunden} Ausdauer gefunden, ${ergebnis.ausdauer_importiert ?? 0} ` +
        `importiert, ${ergebnis.ausdauer_uebersprungen ?? 0} schon vorhanden.`;

    // Ausdauer gefunden, aber nichts importiert und nichts übersprungen:
    // das ist der Fall, den Kerim gerade hat - Details statt nur einer Null.
    const ausdauerDetails =
      ausdauerGefunden > 0
      && (ergebnis.ausdauer_importiert ?? 0) === 0
      && (ergebnis.ausdauer_uebersprungen ?? 0) === 0
        ? ` Details: ${JSON.stringify(ergebnis.ausdauer_details)}`
        : "";

    // Bei null Treffern (weder Kraft noch Ausdauer) hilft nur die Liste
    // dessen, was Garmin tatsächlich geliefert hat.
    const typen: string[] = ergebnis.vorhandene_typen ?? [];
    if (ergebnis.gefunden === 0 && ausdauerGefunden === 0) {
      if (typen.length === 0) {
        return `${kern}${ausdauerText} Garmin hat für die letzten ` +
          `${ergebnis.zeitraum_tage} Tage überhaupt keine Aktivität geliefert.`;
      }
      return `${kern}${ausdauerText} Vorhanden waren nur: ${typen.join(", ")}.`;
    }

    // Krafttrainings da, aber keines vorgemerkt: die Rohmeldung durchreichen,
    // sonst sieht man nur eine Null und weiss nicht warum.
    if (ergebnis.gefunden > 0 && ergebnis.vorgemerkt === 0 && ergebnis.uebersprungen === 0) {
      return `${kern}${ausdauerText} Details: ${JSON.stringify(ergebnis.details)}`;
    }

    return `${kern}${ausdauerText}${ausdauerDetails}`;
  } catch (fehler) {
    return `Sync nicht erreichbar: ${fehler instanceof Error ? fehler.message : fehler}`;
  }
}
