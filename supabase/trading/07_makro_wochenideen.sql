-- ============================================================================
-- 07_makro_wochenideen.sql        29.09.2026
--
-- Projekt „Kompass", Schema trading. Die Wochenaussicht: jeden Montag die
-- Paar-Ideen „stark gegen schwach" aus dem Makro-Terminal, festgehalten mit
-- Urteil und Begründung — und nach 1, 2 und 3 Wochen, wie das Paar
-- tatsächlich gelaufen ist. Dazu Kerims eigene Einschätzung, damit sich
-- zeigt, ob sein Bauchgefühl oder das Urteil besser liegt.
--
-- Geschrieben vom Lauf /api/makro-sync (Job „wochenideen") und von der Seite
-- /trading/fundamentals/wochenideen. Nur Service-Role: RLS an, keine Policy.
-- Idempotent.
-- ============================================================================
create table if not exists trading.makro_wochenideen (
  id              uuid primary key default gen_random_uuid(),
  woche           date not null,              -- Montag der Woche
  paar            text not null,              -- z.B. NZDCAD
  seite           text not null check (seite in ('long','short')),
  klasse          text not null check (klasse in ('A','B')),  -- A stark/schwach, B stark/neutral
  stark           text not null,
  schwach         text not null,
  score_stark     numeric,
  score_schwach   numeric,
  abstand         numeric,
  urteil          jsonb,                      -- Urteil beider Währungen mit Gründen
  einstieg        numeric,                    -- Eröffnung der Montagskerze
  kurs_1w         numeric,                    -- Schluss Freitag Woche 1
  kurs_2w         numeric,
  kurs_3w         numeric,
  prozent_1w      numeric,                    -- in Richtung der Idee, + = aufgegangen
  prozent_2w      numeric,
  prozent_3w      numeric,
  pips_1w         numeric,
  pips_2w         numeric,
  pips_3w         numeric,
  einschaetzung   text check (einschaetzung in ('zustimmen','zweifel','dagegen')),
  notiz           text,
  erstellt_am     timestamptz not null default now(),
  unique (woche, paar)
);

create index if not exists idx_makro_wochenideen_woche on trading.makro_wochenideen (woche desc);

alter table trading.makro_wochenideen enable row level security;
grant select, insert, update, delete on trading.makro_wochenideen to service_role;
