import "server-only";
import { createMenuClient } from "@/lib/supabase/menu";
import {
  STANDARD_FAKTOR, baueBudget,
  type Aktivitaet, type BonusEintrag, type Budget,
} from "@/lib/essen-bonus";

/**
 * Aktivitätsbonus in der Menü-Datenbank.
 *
 * Liegt bewusst dort und nicht bei Gym: verrechnet wird er gegen `kcal_ziel`,
 * und das steht in der `settings`-Tabelle der Menü-Datenbank. Ein Bonus in
 * einer anderen Datenbank als das Ziel, gegen das er läuft, wäre bei jedem
 * Seitenaufruf ein zweiter Verbindungsaufbau für eine einzige Zahl.
 */

export const BONUS_TABELLE = "activity_bonus";

interface Zeile {
  id: string;
  date: string;
  kind: string | null;
  burned: number | null;
  note: string | null;
}

const ARTEN: Aktivitaet[] = ["lauf", "gym", "sonstiges"];

function alsArt(wert: string | null): Aktivitaet {
  const k = (wert ?? "").trim().toLowerCase();
  return (ARTEN as string[]).includes(k) ? (k as Aktivitaet) : "sonstiges";
}

export interface BonusStand {
  budget: Budget;
  /** Anrechnung in Prozent, wie eingestellt. */
  faktor: number;
  /** Zeilen-IDs, damit die Oberfläche einzelne Einträge löschen kann. */
  ids: Map<string, string>;
  /** Tabelle fehlt noch — dann gilt nur das Grundziel. */
  tabelleFehlt: boolean;
}

function istTabelleFehlt(code: string | undefined, nachricht: string): boolean {
  return code === "42P01" || code === "PGRST205" || /does not exist/i.test(nachricht);
}

/** Budget eines Tages: Grundziel plus die Aktivitäten dieses Tages. */
export async function ladeBudget(datum: string): Promise<BonusStand> {
  const leer: BonusStand = {
    budget: baueBudget(2000, []), faktor: STANDARD_FAKTOR,
    ids: new Map(), tabelleFehlt: false,
  };

  const db = createMenuClient();
  if (!db) return leer;

  const [{ data: settings }, { data, error }] = await Promise.all([
    db.from("settings").select("key, value").in("key", ["kcal_ziel", "bonus_faktor"]),
    db.from(BONUS_TABELLE).select("id, date, kind, burned, note").eq("date", datum),
  ]);

  const s = new Map((settings ?? []).map((r) => [r.key as string, r.value as string]));
  const grund = parseInt(s.get("kcal_ziel") ?? "") || 2000;
  const faktor = parseInt(s.get("bonus_faktor") ?? "") || STANDARD_FAKTOR;

  if (error) {
    return {
      budget: baueBudget(grund, []), faktor, ids: new Map(),
      tabelleFehlt: istTabelleFehlt(error.code, error.message),
    };
  }

  const zeilen = (data ?? []) as unknown as Zeile[];
  const eintraege: BonusEintrag[] = zeilen.map((z) => ({
    datum: z.date.slice(0, 10),
    art: alsArt(z.kind),
    // 0 und null sind verschieden: 0 heisst „nichts verbrannt", null heisst
    // „nicht eingetragen" und lässt die Pauschale greifen.
    verbrannt: z.burned === null ? null : Number(z.burned),
    notiz: z.note,
  }));

  const ids = new Map<string, string>();
  zeilen.forEach((z, i) => ids.set(`${i}`, z.id));

  return { budget: baueBudget(grund, eintraege, faktor), faktor, ids, tabelleFehlt: false };
}

/** Trägt eine Aktivität ein. Rückgabe: null bei Erfolg, sonst der Fehlertext. */
export async function speichereBonus(
  datum: string, art: Aktivitaet, verbrannt: number | null, notiz: string | null,
): Promise<string | null> {
  const db = createMenuClient();
  if (!db) return "Menü-Datenbank nicht verbunden.";

  const { error } = await db.from(BONUS_TABELLE)
    .insert({ date: datum, kind: art, burned: verbrannt, note: notiz });

  if (!error) return null;
  if (istTabelleFehlt(error.code, error.message)) {
    return "Die Tabelle activity_bonus fehlt noch — die SQL steht auf der Seite.";
  }
  return `Speichern fehlgeschlagen: ${error.message}`;
}

export async function loescheBonus(id: string): Promise<string | null> {
  const db = createMenuClient();
  if (!db) return "Menü-Datenbank nicht verbunden.";
  const { error } = await db.from(BONUS_TABELLE).delete().eq("id", id);
  return error ? `Löschen fehlgeschlagen: ${error.message}` : null;
}

/** Alle Einträge eines Tages mit ihren IDs — für die Liste zum Entfernen. */
export async function ladeEintraege(
  datum: string,
): Promise<{ id: string; art: Aktivitaet; verbrannt: number | null; notiz: string | null }[]> {
  const db = createMenuClient();
  if (!db) return [];
  const { data, error } = await db.from(BONUS_TABELLE)
    .select("id, date, kind, burned, note").eq("date", datum)
    .order("created_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as Zeile[]).map((z) => ({
    id: z.id,
    art: alsArt(z.kind),
    verbrannt: z.burned === null ? null : Number(z.burned),
    notiz: z.note,
  }));
}

export const BONUS_SQL = `create table if not exists activity_bonus (
  id         uuid primary key default gen_random_uuid(),
  date       date        not null,
  -- lauf | gym | sonstiges
  kind       text        not null default 'sonstiges',
  -- Verbrannte Kalorien laut Uhr. NULL = Pauschale der Aktivität gilt.
  burned     int,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists activity_bonus_datum on activity_bonus (date);

-- Anrechnung in Prozent. 75 heisst: von 800 verbrannten zaehlen 600.
insert into settings (key, value) values ('bonus_faktor', '75')
  on conflict (key) do nothing;`;
