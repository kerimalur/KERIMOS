-- ============================================================================
-- 35_mt5_kalender.sql        29.09.2026
--
-- Projekt „Kompass", Schema trading. Der Wirtschaftskalender des MetaTrader 5
-- — Ist, Prognose und Vorwert, ab 2024. Geschrieben vom MQL5-Dienst
-- KerimosKalender.mq5 in eine Datei, hochgeladen von der MT5-Brücke
-- (GVA-Screener/mt5-bruecke/kalender.py), gelesen vom Lauf
-- /api/makro-sync?job=releases (lib/makro/releases-sync.ts).
--
-- Werte roh wie in MT5; die Umrechnung auf die Grösse von Forex Factory
-- (162000 → 162K) passiert beim Zuordnen. Nur der Service-Role-Schlüssel
-- liest und schreibt: RLS an, keine Policy. Idempotent.
-- ============================================================================
create table if not exists trading.mt5_kalender (
  value_id    bigint primary key,       -- MqlCalendarValue.id
  event_id    bigint not null,          -- MqlCalendarEvent.id, gleich für die ganze Reihe
  ccy         text not null,
  name        text not null,
  importance  text,                     -- CALENDAR_IMPORTANCE_HIGH / _MODERATE / _LOW / _NONE
  event_time  timestamptz not null,     -- UTC
  actual      numeric,
  forecast    numeric,                  -- Prognose von MetaQuotes, nicht der Forex-Factory-Konsens
  previous    numeric,
  revised     numeric,
  multiplier  text,
  unit        text,
  geholt_am   timestamptz not null default now()
);

create index if not exists idx_mt5_kalender_zeit on trading.mt5_kalender (ccy, event_time desc);
create index if not exists idx_mt5_kalender_event on trading.mt5_kalender (event_id, event_time desc);

alter table trading.mt5_kalender enable row level security;

-- Im Schema trading bekommen neue Tabellen die Rechte nicht von selbst —
-- ohne diese Zeile meldet die Brücke „permission denied".
grant select, insert, update, delete on trading.mt5_kalender to service_role;
