/**
 * Migration: mehrere Linien je Pair erlauben.
 *
 * `trading_watchlist` hatte eine eindeutige Spalte `pair` — eine Zeile je
 * Paar. Das war beim Anlegen gedacht als „ein Paar steht einmal auf der
 * Liste"; tatsächlich braucht ein Paar aber mehrere Linien: Widerstand,
 * Unterstützung, ein Ziel. Mit dem Unique-Index hat jede zweite Linie die
 * erste stillschweigend überschrieben — kein Fehler, keine Meldung, die alte
 * Linie einfach weg.
 *
 * Das SQL sucht die Bedingung über den Katalog statt über ihren Namen: der
 * heisst je nachdem, wie die Tabelle entstanden ist, `trading_watchlist_pair_key`
 * oder anders. Ein fest verdrahteter Name würde hier stillschweigend nichts tun.
 *
 * Nur Unique-Bedingungen auf GENAU der einen Spalte `pair` werden entfernt.
 * Der Primärschlüssel (`id`) und jede mehrspaltige Bedingung bleiben.
 */
export const WATCHLIST_MIGRATION_SQL = `-- Mehrere Linien je Pair erlauben.
-- Entfernt jede Unique-Bedingung, die allein auf "pair" liegt.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'trading_watchlist'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text)
        from pg_attribute att
        where att.attrelid = con.conrelid and att.attnum = any(con.conkey)
      ) = array['pair']
  loop
    execute format('alter table trading_watchlist drop constraint %I', c.conname);
    raise notice 'Bedingung % entfernt', c.conname;
  end loop;
end $$;

-- Dasselbe fuer einen Unique-INDEX ohne Bedingung (kommt vor, wenn die
-- Spalte per "create unique index" eindeutig gemacht wurde).
do $$
declare i record;
begin
  for i in
    select idx.indexrelid::regclass::text as name
    from pg_index idx
    where idx.indrelid = 'trading_watchlist'::regclass
      and idx.indisunique
      and not idx.indisprimary
      and idx.indnatts = 1
      and (
        select att.attname
        from pg_attribute att
        where att.attrelid = idx.indrelid and att.attnum = idx.indkey[0]
      ) = 'pair'
      and not exists (
        select 1 from pg_constraint con where con.conindid = idx.indexrelid
      )
  loop
    execute format('drop index %s', i.name);
    raise notice 'Index % entfernt', i.name;
  end loop;
end $$;

-- Suchen bleibt schnell, nur eben ohne Eindeutigkeit.
create index if not exists trading_watchlist_pair_idx on trading_watchlist (pair);`;
