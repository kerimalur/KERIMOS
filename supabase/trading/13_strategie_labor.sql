-- Strategie-Labor (11.10.2026): Durchläufe des objektiven GVA-Backtests und
-- jedes gemessene Ereignis (Treffer, BOS, Einstieg, Ausgang). Bereits per
-- Migration „trading_strategie_labor" angewendet; idempotent.
create table if not exists trading.strategie_laeufe (
  id uuid primary key default gen_random_uuid(),
  erstellt_am timestamptz not null default now(),
  name text,
  einstellungen jsonb not null,
  kennzahlen jsonb,
  zaehler jsonb,
  fenster jsonb,
  fehler text,
  dauer_s numeric,
  quelle text
);
create table if not exists trading.strategie_ereignisse (
  id bigint generated always as identity primary key,
  lauf_id uuid not null references trading.strategie_laeufe(id) on delete cascade,
  paar text not null,
  seite text not null check (seite in ('long','short')),
  level numeric not null,
  b_start date,
  status text not null,
  treffer_t timestamptz not null,
  struktur_t timestamptz, struktur numeric,
  bos_t timestamptz,
  hoch_t timestamptz, hoch numeric,
  tief_t timestamptz, tief numeric,
  einstieg_t timestamptz, einstieg numeric, sl numeric, tp numeric,
  ausstieg_t timestamptz,
  r_brutto numeric, r_netto numeric, risiko_pips numeric,
  neue_hochs integer
);
create index if not exists strategie_ereignisse_lauf_idx on trading.strategie_ereignisse (lauf_id, treffer_t);
alter table trading.strategie_laeufe enable row level security;
alter table trading.strategie_ereignisse enable row level security;
grant all on trading.strategie_laeufe, trading.strategie_ereignisse to service_role;

-- Erweiterung (11.10.2026): Zeitrahmen der GVA und letzter Tag der bildenden Kerze.
alter table trading.strategie_ereignisse add column if not exists gva_tf text, add column if not exists b_ende date;
