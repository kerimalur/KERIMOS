-- Fundamentaler Beobachter (11.10.2026): misst nach jeder Veröffentlichung, wie sich das Messpaar
-- der Währung bewegt hat, und fasst das in Auswertungen zusammen. Bereits per Migration
-- „trading_beobachter" angewendet; idempotent.
create table if not exists trading.beobachter_ereignisse (
  release_id text primary key,
  ccy text not null,
  kategorie text not null,
  serie text,
  titel text,
  impact text,
  event_time timestamptz not null,
  z numeric not null,
  paar text not null,
  basis_datum date,
  bewegung_1 numeric,
  bewegung_3 numeric,
  bewegung_5 numeric,
  gemessen_am timestamptz not null default now()
);
create index if not exists beobachter_ereignisse_zeit_idx on trading.beobachter_ereignisse (event_time desc);
create index if not exists beobachter_ereignisse_gruppe_idx on trading.beobachter_ereignisse (kategorie, ccy);
create table if not exists trading.beobachter_status (
  id smallint primary key default 1 check (id = 1),
  gelaufen timestamptz,
  ereignisse integer,
  voll_gemessen integer,
  offen integer,
  neu_gemessen integer,
  preise_bis date,
  fehler text
);
alter table trading.beobachter_ereignisse enable row level security;
alter table trading.beobachter_status enable row level security;
grant all on trading.beobachter_ereignisse, trading.beobachter_status to service_role;

-- Erweiterung (11.10.2026): Stunden-Reaktion, Tagesschwankung zur Normierung, Vorlauf, Marker für den Intraday-Lauf.
alter table trading.beobachter_ereignisse
  add column if not exists bewegung_1h numeric,
  add column if not exists bewegung_4h numeric,
  add column if not exists vola numeric,
  add column if not exists vorlauf_5 numeric,
  add column if not exists intraday_am timestamptz;
