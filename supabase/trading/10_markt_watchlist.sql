-- Markt-Tab (11.10.2026): Linien mit Warum, Priorität, Fokus, Drei-Punkte-Check,
-- Archiv-Grund und die Pflicht-Entscheidung Trade/Skip.
-- Bereits per Supabase-Migration „trading_markt_watchlist" angewendet; idempotent.

alter table trading.trading_watchlist
  add column if not exists warum text,
  add column if not exists bias_eigen text check (bias_eigen in ('long','short','neutral')),
  add column if not exists prioritaet smallint not null default 2 check (prioritaet between 1 and 3),
  add column if not exists fokus boolean not null default false,
  add column if not exists chart_url text,
  add column if not exists check_abgeholt boolean,
  add column if not exists check_bos boolean,
  add column if not exists check_confluence boolean,
  add column if not exists archiv_grund text,
  add column if not exists archiviert_am timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists trading.trading_entscheidungen (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid references trading.trading_watchlist(id) on delete set null,
  pair text not null,
  seite text check (seite in ('long','short')),
  level numeric,
  entscheidung text not null check (entscheidung in ('trade','skip')),
  grund text,
  check_abgeholt boolean,
  check_bos boolean,
  check_confluence boolean,
  bias text,
  erstellt_am timestamptz not null default now()
);
create index if not exists trading_entscheidungen_erstellt_idx on trading.trading_entscheidungen (erstellt_am desc);
create index if not exists trading_entscheidungen_watchlist_idx on trading.trading_entscheidungen (watchlist_id);
alter table trading.trading_entscheidungen enable row level security;
grant all on trading.trading_entscheidungen to service_role;
