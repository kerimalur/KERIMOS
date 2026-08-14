import {
  STANDARD_EINSTELLUNGEN, ALARMARTEN, normPaar,
  type AlarmEinstellungen, type Alarmart,
} from "./regeln";

/**
 * Die gespeicherte Form der Einstellungen: Tabellenname, Spalten, Migration
 * und die Übersetzung Datenbankzeile → Einstellungen.
 *
 * Getrennt von `einstellungen.ts`, weil dort der Supabase-Zugriff liegt
 * (`server-only`) und diese Umrechnung genau die Stelle ist, an der stille
 * Fehler entstehen — ein `null` in `arten`, ein `"22:00:00"` statt `"22:00"`.
 * Ohne Datenbank prüfbar, siehe `tools/checks/alarm-regeln.mts`.
 */

export const EINSTELLUNGEN_TABELLE = "alarm_einstellungen";

export const EINSTELLUNGEN_SPALTEN =
  "push_an, telegram_an, telegram_chat_id, arten, paare, ruhe_von, ruhe_bis, " +
  "ruhe_ausser_hit, max_pro_tag, stumm_bis";

/** Postgres: „relation does not exist" bzw. PostgREST: Schema-Cache-Miss. */
export function istTabelleFehlt(code: string | undefined, nachricht: string): boolean {
  return code === "42P01" || code === "PGRST205" || /does not exist/i.test(nachricht);
}

export interface EinstellungenZeile {
  push_an: boolean | null;
  telegram_an: boolean | null;
  telegram_chat_id: string | null;
  arten: string[] | null;
  paare: string[] | null;
  ruhe_von: string | null;
  ruhe_bis: string | null;
  ruhe_ausser_hit: boolean | null;
  max_pro_tag: number | null;
  stumm_bis: string | null;
}

/**
 * Datenbankzeile → Einstellungen, jedes Feld einzeln abgesichert.
 *
 * Die Zeile wird auch von Hand im Supabase-Editor angefasst; ein `null` in
 * `arten` darf nicht dazu führen, dass `pruefe()` über `undefined.includes`
 * stolpert und der Cron-Lauf mit 500 endet.
 */
export function ausZeile(zeile: EinstellungenZeile): AlarmEinstellungen {
  const arten = (zeile.arten ?? [])
    .map((a) => String(a).trim().toLowerCase())
    .filter((a): a is Alarmart => (ALARMARTEN as readonly string[]).includes(a));

  return {
    push_an: zeile.push_an ?? STANDARD_EINSTELLUNGEN.push_an,
    telegram_an: zeile.telegram_an ?? STANDARD_EINSTELLUNGEN.telegram_an,
    telegram_chat_id: zeile.telegram_chat_id?.trim() || null,
    // Null heisst „nie gesetzt" → Standard. Eine leere Liste dagegen ist eine
    // bewusste Entscheidung und bleibt leer.
    arten: zeile.arten === null ? [...STANDARD_EINSTELLUNGEN.arten] : arten,
    paare: (zeile.paare ?? []).map(normPaar).filter((p) => p.length >= 6),
    ruhe_von: zeile.ruhe_von?.slice(0, 5) || null,
    ruhe_bis: zeile.ruhe_bis?.slice(0, 5) || null,
    ruhe_ausser_hit: zeile.ruhe_ausser_hit ?? STANDARD_EINSTELLUNGEN.ruhe_ausser_hit,
    // NULL heisst „nie gesetzt" → Standard. Eine gespeicherte 0 dagegen ist
    // die bewusste Entscheidung „keine Grenze" und bleibt 0. Ohne die
    // Null-Prüfung wären beide dasselbe, weil Number(null) === 0 ist.
    max_pro_tag: zeile.max_pro_tag !== null && Number.isFinite(Number(zeile.max_pro_tag))
      ? Math.max(0, Number(zeile.max_pro_tag))
      : STANDARD_EINSTELLUNGEN.max_pro_tag,
    stumm_bis: zeile.stumm_bis?.slice(0, 10) || null,
  };
}

/** Einstellungen → Zeile. Leere Zeit-/Datumsfelder müssen als null gehen. */
export function zurZeile(werte: AlarmEinstellungen): EinstellungenZeile & { id: number } {
  return {
    id: 1,
    push_an: werte.push_an,
    telegram_an: werte.telegram_an,
    telegram_chat_id: werte.telegram_chat_id,
    arten: werte.arten,
    paare: werte.paare,
    // "" ist für Postgres kein `time` und kein `date` — das muss null sein.
    ruhe_von: werte.ruhe_von || null,
    ruhe_bis: werte.ruhe_bis || null,
    ruhe_ausser_hit: werte.ruhe_ausser_hit,
    max_pro_tag: werte.max_pro_tag,
    stumm_bis: werte.stumm_bis || null,
  };
}

/** SQL für die Migration — steht auf der Einstellungsseite zum Kopieren. */
export const MIGRATION_SQL = `create table if not exists alarm_einstellungen (
  id               int primary key default 1 check (id = 1),
  push_an          boolean     not null default true,
  telegram_an      boolean     not null default false,
  telegram_chat_id text,
  arten            text[]      not null default '{naehe,hit,zeit}',
  paare            text[]      not null default '{}',
  ruhe_von         time,
  ruhe_bis         time,
  ruhe_ausser_hit  boolean     not null default true,
  max_pro_tag      int         not null default 40,
  stumm_bis        date,
  updated_at       timestamptz not null default now()
);

insert into alarm_einstellungen (id) values (1) on conflict (id) do nothing;`;
