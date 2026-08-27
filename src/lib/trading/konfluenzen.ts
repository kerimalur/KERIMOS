/**
 * Die Konfluenzen — was Kerim an einem Setup abhaken kann.
 *
 * Bis zum 27.08.2026 stand die Liste fest im Code der Trades-Seite. Damit war
 * sie unveränderlich für den, der sie benutzt, und das ist bei einer Liste
 * falsch, die sich mit dem Handelsstil mitentwickelt.
 *
 * Die **Setups** bleiben dagegen fest: sie sind fünf eigene Spalten in
 * `trades` (`setup_3day_gva` und Geschwister). Frei anlegbar hiesse dort
 * Spalten auf eine Liste umbauen und alle bestehenden Trades migrieren — und
 * Kerims fünf Setups sind seit Monaten dieselben. Konfluenzen liegen dagegen
 * schon als `text[]` in der Zeile; dort kostet es nichts.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit `tools/checks/konfluenzen.mts`.
 */

/**
 * Womit angefangen wird, solange nichts eigenes angelegt ist.
 *
 * Dieselben acht wie vorher im Code — sonst verlöre Kerim beim Umstellen
 * stillschweigend seine gewohnten Haken, und alte Trades trügen Namen, die
 * es nicht mehr gibt.
 */
export const STANDARD_KONFLUENZEN = [
  "Fundamental", "Technisch", "Saisonal", "COT", "Intermarket",
  "SMC", "Liquidität", "Imbalance",
] as const;

export interface Konfluenz {
  id: string;
  name: string;
  sortOrder: number;
}

/** Auf 40 Zeichen gekürzt und getrimmt. Leer heisst: nicht anlegen. */
export function saubereName(roh: unknown): string {
  return typeof roh === "string" ? roh.trim().slice(0, 40) : "";
}

/**
 * Die Liste, die im Formular steht.
 *
 * Eigene gehen vor. Ist noch keine angelegt, gelten die Standardwerte —
 * **nicht** eine leere Liste. Ein Formular ohne einen einzigen Haken wäre
 * kein leeres Blatt, sondern ein kaputtes.
 *
 * Namen, die in alten Trades vorkommen, aber nicht mehr in der Liste stehen,
 * werden hinten angehängt. Sonst verschwände beim Bearbeiten eines alten
 * Trades stillschweigend ein Haken, den er trägt — und beim Speichern wäre er
 * weg, ohne dass jemand darauf gedrückt hat.
 */
export function konfluenzListe(
  eigene: readonly Konfluenz[], benutzteNamen: readonly string[] = [],
): string[] {
  const basis = eigene.length > 0
    ? [...eigene].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((k) => k.name)
    : [...STANDARD_KONFLUENZEN];

  const bekannt = new Set(basis.map((n) => n.toLowerCase()));
  const nachzuegler = [...new Set(benutzteNamen)]
    .filter((n) => n && !bekannt.has(n.toLowerCase()))
    .sort();

  return [...basis, ...nachzuegler];
}

/** SQL für die Tabelle — steht auf der Einstellungsseite zum Kopieren. */
export const KONFLUENZEN_MIGRATION_SQL = `-- Eigene Konfluenzen, Trading-Datenbank.
create table if not exists trading_konfluenzen (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_konfluenz_name
  on trading_konfluenzen (user_id, lower(name));

alter table trading_konfluenzen enable row level security;

drop policy if exists own_konfluenzen on trading_konfluenzen;
create policy own_konfluenzen on trading_konfluenzen
  for all using (true) with check (true);`;
