-- ============================================================================
--
-- HINWEIS: Der Bereich „Woche" wurde am 22.09.2026 wieder entfernt (Kerim
-- fuehrt das jetzt physisch am Whiteboard). Die Tabellen bleiben bestehen.
-- Backup des Codes: ../_backup/kerimos-woche-2026-09-21 bzw. Commit 81b7726.
-- 25_woche.sql — Bereich „Woche" (21.09.2026)
--
-- Ersetzt Gym und Zeit in der Oberfläche. Gehört in die KerimOS-Hauptdatenbank
-- (Projekt „Kompass"). Idempotent.
--
--   habit_log    Push, Pull, Ausdauer — ein Tipp je Einheit
--   essen_check  Plan eingehalten ja/nein und was das Problem war
--   vorhaben     Woran arbeite ich in der freien Zeit (max. 3 aktiv)
-- ============================================================================

create table if not exists habit_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum      date not null,
  art        text not null check (art in ('push','pull','ausdauer')),
  created_at timestamptz not null default now()
);
create index if not exists idx_habit_log_datum on habit_log(user_id, datum);
alter table habit_log enable row level security;
drop policy if exists own_habit_log on habit_log;
create policy own_habit_log on habit_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists essen_check (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum       date not null,
  eingehalten boolean not null,
  problem     text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, datum)
);
alter table essen_check enable row level security;
drop policy if exists own_essen_check on essen_check;
create policy own_essen_check on essen_check for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists vorhaben (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titel       text not null,
  naechster_schritt text,
  status      text not null default 'idee' check (status in ('aktiv','idee','erledigt')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  erledigt_am timestamptz
);
create index if not exists idx_vorhaben_status on vorhaben(user_id, status, sort_order);
alter table vorhaben enable row level security;
drop policy if exists own_vorhaben on vorhaben;
create policy own_vorhaben on vorhaben for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
