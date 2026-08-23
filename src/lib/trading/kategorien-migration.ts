/**
 * Migration: Kategorien für die aktiven Trades.
 *
 * Zwei Dinge — eine neue Tabelle und eine Spalte auf `trading_watchlist`.
 * Beides mit `if not exists`, damit ein zweiter Lauf nichts kaputt macht.
 *
 * **`on delete set null`** ist die wichtige Zeile: Wer eine Kategorie löscht,
 * will die Kategorie loswerden, nicht seine Trades. Ohne diese Angabe würde
 * Postgres das Löschen entweder verweigern oder — bei `cascade` — die Zeilen
 * mitnehmen. Beides wäre eine Überraschung an der falschen Stelle.
 *
 * **RLS an, keine Policy.** KerimOS liest diese Tabelle ausschliesslich
 * serverseitig mit dem Service-Key, und der umgeht RLS ohnehin. Eingeschaltet
 * bleibt sie trotzdem: Sollte je ein Browser-Client mit dem Anon-Key an die
 * Datenbank kommen, sieht er nichts, statt alles.
 */
export const KATEGORIEN_MIGRATION_SQL = `-- Kategorien fuer die aktiven Trades.
create table if not exists trading_kategorien (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  farbe       text not null default 'neutral',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table trading_kategorien enable row level security;

-- Zwei Kategorien duerfen nicht gleich heissen: sonst stehen auf der
-- Uebersicht zwei Ueberschriften mit demselben Text und man raet, welche
-- gemeint ist.
create unique index if not exists trading_kategorien_name_idx
  on trading_kategorien (lower(name));

-- Die Zuordnung. "set null": eine geloeschte Kategorie darf keine Trades
-- mitnehmen, die Zeilen rutschen nur unter "ohne Kategorie".
alter table trading_watchlist
  add column if not exists kategorie_id uuid
  references trading_kategorien(id) on delete set null;

create index if not exists trading_watchlist_kategorie_idx
  on trading_watchlist (kategorie_id);`;
