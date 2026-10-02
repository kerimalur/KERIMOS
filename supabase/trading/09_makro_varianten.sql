-- ============================================================================
-- 09_makro_varianten.sql        02.10.2026
--
-- Projekt „Kompass", Schema trading. Varianten-Vergleich des Makro-Modells
-- ab 2024 (lib/makro/varianten.ts): je Variante, Montag und Idee die
-- Bewegung nach 1, 2, 4, 8 Wochen in Prozent (in Richtung der Idee).
-- Wird bei jedem Lauf komplett neu geschrieben. Nur Service-Role. Idempotent.
-- ============================================================================
create table if not exists trading.makro_varianten (
  variante      text not null,
  woche         date not null,
  paar          text not null,
  seite         text not null check (seite in ('long','short')),
  extrem        boolean not null default false,
  p1            numeric,
  p2            numeric,
  p4            numeric,
  p8            numeric,
  gerechnet_am  timestamptz not null default now(),
  primary key (variante, woche, paar)
);

alter table trading.makro_varianten enable row level security;
grant select, insert, update, delete on trading.makro_varianten to service_role;
