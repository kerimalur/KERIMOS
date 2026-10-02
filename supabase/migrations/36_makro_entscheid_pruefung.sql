-- ============================================================================
-- 36_makro_entscheid_pruefung.sql        01.10.2026
--
-- Projekt „Kompass". Kerims Prüfung eines Zinsentscheids (Makro-Lernen
-- Modul 0): bestätigtes Ist aus einer zweiten Quelle, Abstimmung und Ton.
--
-- Warum: Am 17.09.2026 stand im Terminal für die BoE „Ist 4,00 %". Die BoE
-- hat aber bei 3,75 % gehalten (wie erwartet), 6–3 Stimmen, drei Mitglieder
-- wollten auf 4,00 % — falkenhafter Ton. Ein falsch gelesener Zinsentscheid
-- verdreht das ganze Währungsurteil. Deshalb gilt ab jetzt
-- (lib/makro/einordnung.ts → mitPruefung):
--   - Ist ≠ Erwartung ohne Prüfung → „unbestätigt", wird nicht gewertet.
--   - Mit Prüfung → das hier eingetragene Ist gilt, dazu Stimmen und Ton.
--
-- makro_releases bleibt unverändert (der Sync überschreibt sie); die
-- Prüfung wird beim Laden darübergelegt. Idempotent.
-- ============================================================================
create table if not exists public.makro_entscheid_pruefung (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  release_id  text not null,                 -- = makro_releases.id
  ist         numeric,                       -- bestätigter Beschluss in %
  stimmen     text,                          -- z.B. "6–3 (3 für Erhöhung)"
  ton         text check (ton in ('falkenhaft','neutral','taubenhaft')),
  notiz       text,
  quelle      text,                          -- z.B. Link zur Notenbank-Mitteilung
  geprueft_am timestamptz not null default now(),
  primary key (user_id, release_id)
);

alter table public.makro_entscheid_pruefung enable row level security;
drop policy if exists own_makro_entscheid_pruefung on public.makro_entscheid_pruefung;
create policy own_makro_entscheid_pruefung on public.makro_entscheid_pruefung for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- BoE 17.09.2026 gleich richtigstellen (Quellen: OrbitRemit „Bank of
-- England September 2026", forexfundamentals.com BoE 17.09.2026).
insert into public.makro_entscheid_pruefung (user_id, release_id, ist, stimmen, ton, notiz, quelle)
select u.id, r.id, 3.75, '6–3 (Mann, Greene, Pill für +0,25 auf 4,00 %)', 'falkenhaft',
       'Halten wie erwartet. Bailey: je länger die Energiepreise hoch bleiben, desto eher ist eine Erhöhung nötig.',
       'https://blog.orbitremit.com/bank-of-england-september-2026/'
from public.makro_releases r
cross join (select id from auth.users order by created_at limit 1) u
where r.ccy = 'GBP' and r.kategorie = 'notenbank'
  and r.event_time >= '2026-09-17T00:00:00Z' and r.event_time < '2026-09-18T00:00:00Z'
on conflict (user_id, release_id) do nothing;
