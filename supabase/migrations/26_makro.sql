-- ============================================================================
-- 26_makro.sql        26.09.2026
--
-- Gehört in die KerimOS-Hauptdatenbank (Projekt „Kompass").
--
-- Die fundamentale Lage je Währung hat zwei Hälften:
--
--   automatisch   Leitzins, Inflation, Realzins, 2-Jahres-Rendite, COT,
--                 Risiko-Regime. Das steht alles in der Trading-Datenbank
--                 (fred_series, price_daily, cot_reports) und wird gerechnet.
--
--   von Hand      PMI, BIP, Arbeitslosenquote, Handelsbilanz, 10-Jahres-
--                 Rendite und die Nachfrage danach. Für diese Zahlen gibt es
--                 keine kostenlose Schnittstelle; sie stehen bei Trading
--                 Economics und werden hier eingetragen. Einmal im Monat
--                 dauert das ein paar Minuten und ist ehrlicher als eine
--                 Zahl, die keiner pflegt.
--
-- Dazu die Ereignisse für Ebene 3 (Sentiment): was gerade läuft und welche
-- Währungen es trifft.
--
-- Idempotent.
-- ============================================================================

create table if not exists makro_werte (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ccy        text not null,
  feld       text not null,
  wert       numeric,
  /** Der Wert davor — daraus wird der Trendpfeil. */
  vorwert    numeric,
  stand      date,
  quelle     text,
  updated_at timestamptz not null default now(),
  primary key (user_id, ccy, feld)
);

alter table makro_werte drop constraint if exists makro_werte_feld_check;
alter table makro_werte add constraint makro_werte_feld_check check (feld in (
  'pmi_industrie','pmi_dienste','bip_yoy','arbeitslos',
  'handelsbilanz','rendite_10j','anleihe_nachfrage','staatsschulden'
));

alter table makro_werte enable row level security;
drop policy if exists own_makro_werte on makro_werte;
create policy own_makro_werte on makro_werte for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Zinszyklus je Zentralbank: ableiten liesse er sich aus der Zinsrichtung,
-- aber die Phase „Pause oben" und „Pause unten" unterscheidet nur, wer die
-- Statements liest. Deshalb von Hand, mit Platz für eine Notiz.
create table if not exists makro_lage (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ccy        text not null,
  zyklus     text check (zyklus in ('straffung','pause_oben','lockerung','pause_unten')),
  notiz      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, ccy)
);
alter table makro_lage enable row level security;
drop policy if exists own_makro_lage on makro_lage;
create policy own_makro_lage on makro_lage for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists makro_ereignisse (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titel      text not null,
  datum      date not null default current_date,
  bis        date,
  profitiert text[] not null default '{}',
  leidet     text[] not null default '{}',
  notiz      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_makro_ereignisse_datum on makro_ereignisse(user_id, datum desc);
alter table makro_ereignisse enable row level security;
drop policy if exists own_makro_ereignisse on makro_ereignisse;
create policy own_makro_ereignisse on makro_ereignisse for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
