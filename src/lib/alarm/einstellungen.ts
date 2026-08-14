import "server-only";
import { createTradingClient } from "@/lib/supabase/trading";
import { STANDARD_EINSTELLUNGEN, type AlarmEinstellungen } from "./regeln";
import {
  EINSTELLUNGEN_TABELLE, EINSTELLUNGEN_SPALTEN, ausZeile, zurZeile,
  istTabelleFehlt, type EinstellungenZeile,
} from "./speicher";

/**
 * Laden und Speichern der Alarm-Einstellungen.
 *
 * Eine einzige Zeile in der Trading-Datenbank (`alarm_einstellungen`, id = 1).
 * Kein `user_id`: die Nachbartabellen `trading_watchlist`, `alarm_log` und
 * `push_subscriptions` führen auch keinen — KerimOS ist eine Einbenutzer-App,
 * und eine Spalte, die überall denselben Wert trägt, ist keine Trennung,
 * sondern nur eine Stelle mehr, an der man sie vergessen kann.
 *
 * Fehlt die Tabelle noch, fällt alles auf die Standardwerte zurück und die
 * Oberfläche zeigt die nötige SQL. Ein Alarmsystem, das ohne Migration gar
 * nicht mehr läuft, wäre die schlechtere Variante.
 */

export { MIGRATION_SQL, EINSTELLUNGEN_TABELLE } from "./speicher";

export interface Geladen {
  werte: AlarmEinstellungen;
  quelle: "db" | "standard";
  /** Klartext, wenn etwas fehlt — sonst null. */
  hinweis: string | null;
  /** Tabelle existiert nicht (Migration steht aus). */
  tabelleFehlt: boolean;
}

export async function ladeEinstellungen(): Promise<Geladen> {
  const standard: Geladen = {
    werte: { ...STANDARD_EINSTELLUNGEN, arten: [...STANDARD_EINSTELLUNGEN.arten], paare: [] },
    quelle: "standard",
    hinweis: null,
    tabelleFehlt: false,
  };

  const supabase = createTradingClient();
  if (!supabase) {
    return { ...standard, hinweis: "Trading-Datenbank nicht verbunden — es gelten die Standardwerte." };
  }

  const { data, error } = await supabase
    .from(EINSTELLUNGEN_TABELLE)
    .select(EINSTELLUNGEN_SPALTEN)
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (istTabelleFehlt(error.code, error.message)) {
      return {
        ...standard,
        tabelleFehlt: true,
        hinweis: "Die Tabelle alarm_einstellungen fehlt noch. Bis sie angelegt ist, gelten die Standardwerte.",
      };
    }
    return { ...standard, hinweis: `Einstellungen nicht lesbar: ${error.message}` };
  }

  if (!data) {
    return { ...standard, hinweis: "Noch nichts gespeichert — es gelten die Standardwerte." };
  }

  return {
    werte: ausZeile(data as unknown as EinstellungenZeile),
    quelle: "db",
    hinweis: null,
    tabelleFehlt: false,
  };
}

/** Speichert. Rückgabe: null bei Erfolg, sonst der Fehlertext. */
export async function speichereEinstellungen(
  werte: AlarmEinstellungen,
): Promise<string | null> {
  const supabase = createTradingClient();
  if (!supabase) return "Trading-Datenbank nicht verbunden.";

  const { error } = await supabase
    .from(EINSTELLUNGEN_TABELLE)
    .upsert({ ...zurZeile(werte), updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (!error) return null;
  if (istTabelleFehlt(error.code, error.message)) {
    return "Die Tabelle alarm_einstellungen fehlt noch — die SQL steht unten auf dieser Seite.";
  }
  return `Speichern fehlgeschlagen: ${error.message}`;
}

/**
 * Wie viele Alarme heute schon rausgingen — für die Tagesgrenze.
 *
 * Gezählt wird `alarm_log`, weil dort pro Linie/Art/Tag genau eine Zeile
 * steht: dieselbe Sperre, die Dauerfeuer verhindert, ist damit auch der
 * Zähler. Bei Problemen wird 0 geliefert; die Grenze ist ein Schutz vor
 * Lärm, kein Grund, den Versand ganz einzustellen.
 */
export async function heuteGesendet(heute: string): Promise<number> {
  const supabase = createTradingClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("alarm_log")
    .select("*", { count: "exact", head: true })
    .eq("tag", heute);

  return error ? 0 : (count ?? 0);
}
