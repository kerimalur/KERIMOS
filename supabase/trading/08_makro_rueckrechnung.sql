-- ============================================================================
-- 08_makro_rueckrechnung.sql        29.09.2026
--
-- Projekt „Kompass", Schema trading. Die Rückrechnung der Wochenaussicht ab
-- 2024: für jeden Montag die Paar-Ideen, wie sie das (vereinfachte) Urteil
-- an diesem Tag geliefert hätte, und wie die Paare danach 1, 2, 3 Wochen
-- liefen. Wird bei jedem Lauf komplett neu geschrieben
-- (lib/makro/rueckrechnung.ts). Nur Service-Role. Idempotent.
-- ============================================================================
create table if not exists trading.makro_rueckrechnung (
  woche          date not null,
  paar           text not null,
  seite          text not null check (seite in ('long','short')),
  klasse         text not null check (klasse in ('A','B')),
  stark          text not null,
  schwach        text not null,
  score_stark    numeric,
  score_schwach  numeric,
  abstand        numeric,
  einstieg       numeric,
  prozent_1w     numeric,
  prozent_2w     numeric,
  prozent_3w     numeric,
  pips_1w        numeric,
  pips_2w        numeric,
  pips_3w        numeric,
  erwartung      text not null check (erwartung in ('metaquotes','konsens')),
  gerechnet_am   timestamptz not null default now(),
  primary key (woche, paar)
);

alter table trading.makro_rueckrechnung enable row level security;
grant select, insert, update, delete on trading.makro_rueckrechnung to service_role;
