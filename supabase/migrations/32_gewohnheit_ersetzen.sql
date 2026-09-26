-- ============================================================================
-- 32_gewohnheit_ersetzen.sql        26.09.2026
--
-- Projekt „Kompass". Schlechte Gewohnheiten nicht verbieten, sondern ersetzen:
--   gewohnheit_ersatz   Wenn <Auslöser> … dann <Ersatz> statt <Gewohnheit>,
--                       dazu, was die alte Gewohnheit einem gibt (Bedeutung) —
--                       der Ersatz muss dasselbe Bedürfnis bedienen.
--   gewohnheit_ersetzt  jedes Mal, wenn der Ersatz geklappt hat. Gezählt
--                       werden NUR Erfolge, nie Rückfälle — bewusst.
-- ============================================================================
create table if not exists gewohnheit_ersatz (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gewohnheit  text not null,
  ausloeser   text not null default '',
  bedeutung   text not null default '',
  ersatz      text not null,
  aktiv       boolean not null default true,
  reihenfolge integer not null default 0,
  erstellt    timestamptz not null default now()
);
alter table gewohnheit_ersatz enable row level security;
drop policy if exists own_gewohnheit_ersatz on gewohnheit_ersatz;
create policy own_gewohnheit_ersatz on gewohnheit_ersatz for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists gewohnheit_ersetzt (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ersatz_id  uuid not null references gewohnheit_ersatz(id) on delete cascade,
  datum      date not null,
  erstellt   timestamptz not null default now()
);
create index if not exists gewohnheit_ersetzt_ersatz on gewohnheit_ersetzt(ersatz_id, datum);
alter table gewohnheit_ersetzt enable row level security;
drop policy if exists own_gewohnheit_ersetzt on gewohnheit_ersetzt;
create policy own_gewohnheit_ersetzt on gewohnheit_ersetzt for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
