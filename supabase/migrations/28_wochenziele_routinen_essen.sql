-- ============================================================================
-- 28_wochenziele_routinen_essen.sql        26.09.2026
--
-- Gehört in die KerimOS-Hauptdatenbank (Projekt „Kompass").
--
--   wochenziele         Ziele einer Woche: Titel, Details, drei Stati.
--                       Unfertige wandern am Montag in die neue Woche und
--                       werden dabei als dringend markiert (`seit` behält die
--                       Woche, in der das Ziel ursprünglich stand).
--   routine_ziele       Was man erreichen will …
--   routine_handlungen  … und was man dafür tut: an welchen Wochentagen,
--                       optional zu welcher Uhrzeit (dann kommt eine Push-
--                       Meldung). `zuletzt_erinnert` verhindert doppelte
--                       Meldungen, egal wie oft der Cron-Job anklopft.
--   essen_notizen       Ein freies Notizfeld pro Tag: was gegessen wurde.
--
-- Idempotent. Nichts wird gelöscht.
-- ============================================================================

create table if not exists wochenziele (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  woche        date not null,
  titel        text not null,
  details      text not null default '',
  status       text not null default 'offen'
               check (status in ('offen','angefangen','fertig')),
  dringend     boolean not null default false,
  seit         date,
  reihenfolge  integer not null default 0,
  erstellt     timestamptz not null default now(),
  aktualisiert timestamptz not null default now()
);
create index if not exists wochenziele_user_woche on wochenziele(user_id, woche);
alter table wochenziele enable row level security;
drop policy if exists own_wochenziele on wochenziele;
create policy own_wochenziele on wochenziele for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists routine_ziele (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titel        text not null,
  notiz        text not null default '',
  reihenfolge  integer not null default 0,
  erstellt     timestamptz not null default now()
);
alter table routine_ziele enable row level security;
drop policy if exists own_routine_ziele on routine_ziele;
create policy own_routine_ziele on routine_ziele for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists routine_handlungen (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ziel_id          uuid not null references routine_ziele(id) on delete cascade,
  titel            text not null,
  -- Wochentage wie Date.getDay(): 0 = Sonntag … 6 = Samstag
  tage             smallint[] not null default '{0,1,2,3,4,5,6}',
  uhrzeit          time,
  zuletzt_erinnert date,
  reihenfolge      integer not null default 0,
  erstellt         timestamptz not null default now()
);
create index if not exists routine_handlungen_ziel on routine_handlungen(ziel_id);
alter table routine_handlungen enable row level security;
drop policy if exists own_routine_handlungen on routine_handlungen;
create policy own_routine_handlungen on routine_handlungen for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists essen_notizen (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum        date not null,
  text         text not null default '',
  aktualisiert timestamptz not null default now(),
  primary key (user_id, datum)
);
alter table essen_notizen enable row level security;
drop policy if exists own_essen_notizen on essen_notizen;
create policy own_essen_notizen on essen_notizen for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
