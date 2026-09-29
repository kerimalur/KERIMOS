-- ============================================================================
-- 34_makro_releases.sql        29.09.2026
--
-- Projekt „Kompass". Veröffentlichungen mit Erwartung und Ist — die Grundlage
-- des Makro-Terminals (lib/makro/releases.ts). Gefüllt von
-- /api/makro-sync?job=releases aus trading.calendar_events (Forex Factory)
-- und, wenn JBLANKED_API_KEY gesetzt ist, aus der JBlanked News API.
--
-- Wie makro_reihen: kein user_id, öffentliche Wirtschaftsdaten, Lesen für
-- jeden angemeldeten Benutzer, Schreiben nur mit dem Service-Role-Schlüssel.
-- Idempotent.
-- ============================================================================
create table if not exists public.makro_releases (
  id                text primary key,          -- = calendar_events.id, bei JBlanked-Historie "jb:<sha1>"
  ccy               text not null,
  titel             text not null,
  serie             text not null,             -- Titel ohne Flash/Final/Prelim/Revised
  kategorie         text not null check (kategorie in
                      ('wachstum','inflation','arbeit','notenbank','stimmung','sonstiges')),
  event_time        timestamptz not null,
  impact            text,
  einheit           text not null default '',  -- '%','K','M','B',''
  erwartung         numeric,
  ist               numeric,
  vorwert           numeric,
  ist_quelle        text check (ist_quelle in ('jblanked','mt5','rekonstruiert')),
  abweichung        numeric,                   -- ist - erwartung
  z                 numeric,                   -- normiert, + = stützt die Währung
  geholt_am         timestamptz not null default now()
);

create index if not exists idx_makro_releases_serie
  on public.makro_releases (ccy, serie, event_time desc);
create index if not exists idx_makro_releases_zeit
  on public.makro_releases (ccy, event_time desc);

alter table public.makro_releases enable row level security;
drop policy if exists lesen_makro_releases on public.makro_releases;
create policy lesen_makro_releases on public.makro_releases
  for select using (auth.role() = 'authenticated');
