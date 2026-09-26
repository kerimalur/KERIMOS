-- ============================================================================
-- 31_routinen_pro_woche.sql        26.09.2026
--
-- Projekt „Kompass". Routinen können jetzt auf zwei Arten geplant werden:
--   feste Tage     tage = {1,3,5}, pro_woche = null  (z.B. Meal Prep am Sonntag)
--   x-mal / Woche  pro_woche = 3, Tag egal           (z.B. Gym)
-- Dazu das Abhaken: je Handlung und Tag eine Zeile. Daraus weiss KerimOS,
-- wie viele von „3× pro Woche" noch offen sind — Startseite und Push
-- erinnern nur, solange etwas offen ist.
-- ============================================================================
alter table routine_handlungen add column if not exists pro_woche smallint
  check (pro_woche is null or pro_woche between 1 and 14);

create table if not exists routine_erledigt (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  handlung_id uuid not null references routine_handlungen(id) on delete cascade,
  datum       date not null,
  erstellt    timestamptz not null default now(),
  unique (handlung_id, datum)
);
create index if not exists routine_erledigt_datum on routine_erledigt(user_id, datum);
alter table routine_erledigt enable row level security;
drop policy if exists own_routine_erledigt on routine_erledigt;
create policy own_routine_erledigt on routine_erledigt for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
