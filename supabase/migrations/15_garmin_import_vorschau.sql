-- Datenbank: Gym ("Gymapp Cursor", kvpexrorkqmxnzqvexga)
--
-- Garmin-Import bekommt einen Zwischenschritt: der Sync schreibt nicht mehr
-- direkt nach workout_sessions, sondern erst in diese Vorschau-Tabellen.
-- Grund: die Uhr kennt das Gewicht an Maschinen oft nicht (0 kg) und wirft
-- ähnliche Übungen zusammen (Schräg- und Flachbankdrücken). Beides wird unter
-- /gym/garmin geprüft, bevor die Zahlen im Verlauf landen.

create table if not exists public.garmin_import_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  garmin_activity_id bigint not null unique,
  started_at timestamptz,
  completed_at timestamptz,
  erkannter_split text,
  garmin_uebersicht text,
  status text not null default 'offen',
  created_at timestamptz not null default now(),
  constraint garmin_import_sessions_status_check
    check (status in ('offen', 'uebernommen', 'verworfen'))
);

-- Bewusst ohne set_number: die Satznummer hängt an der Zielübung, und die
-- kann sich in der Vorschau noch ändern. Nummeriert wird erst beim Übernehmen.
create table if not exists public.garmin_import_saetze (
  id uuid primary key default gen_random_uuid(),
  import_session_id uuid not null
    references public.garmin_import_sessions(id) on delete cascade,
  position integer not null,
  garmin_key text not null,
  exercise_id uuid references public.exercises(id),
  weight_kg numeric not null default 0,
  reps integer not null default 0,
  completed_at timestamptz
);

create index if not exists garmin_import_saetze_session_idx
  on public.garmin_import_saetze (import_session_id, position);

create index if not exists garmin_import_sessions_status_idx
  on public.garmin_import_sessions (status, started_at desc);

alter table public.garmin_import_sessions enable row level security;
alter table public.garmin_import_saetze enable row level security;

drop policy if exists garmin_import_sessions_authenticated on public.garmin_import_sessions;
create policy garmin_import_sessions_authenticated
  on public.garmin_import_sessions for all to authenticated
  using (true) with check (true);

drop policy if exists garmin_import_saetze_authenticated on public.garmin_import_saetze;
create policy garmin_import_saetze_authenticated
  on public.garmin_import_saetze for all to authenticated
  using (true) with check (true);

-- Schräg- und Flachbankdrücken kamen über den Kategorie-Fallback BENCH_PRESS|*
-- beide als Flachbankdrücken an. Ab jetzt haben die Varianten eigene Einträge;
-- zusätzlich lässt der Sync Variantennamen (INCLINE, DECLINE, ...) gar nicht
-- mehr auf den Fallback abrutschen.
insert into public.garmin_exercise_map (garmin_category, garmin_name, exercise_id)
select v.kategorie, v.name, e.id
from (values
  ('BENCH_PRESS', 'DUMBBELL_BENCH_PRESS',         'Bankdrücken (Flachbank)'),
  ('BENCH_PRESS', 'BARBELL_BENCH_PRESS',          'Bankdrücken (Flachbank)'),
  ('BENCH_PRESS', 'INCLINE_DUMBBELL_BENCH_PRESS', 'Schrägbankdrücken (Kurzhantel)'),
  ('BENCH_PRESS', 'INCLINE_BENCH_PRESS',          'Schrägbankdrücken (Kurzhantel)'),
  ('WARM_UP',     'STRETCH_PECTORAL',             'Butterfly Machine')
) as v(kategorie, name, uebung)
join public.exercises e on e.name = v.uebung
on conflict (garmin_category, garmin_name)
  do update set exercise_id = excluded.exercise_id;
