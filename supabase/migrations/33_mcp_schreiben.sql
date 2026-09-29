-- 33 · MCP Stufe 2: Schreibzugriff für Claude (29.09.2026)
--
-- lernnotiz: Ergebnis einer Lernkontrolle zu einem Wochenziel (z.B.
--   „Quiz 4/5, Kernidee verstanden"). Claude setzt sie, bevor ein Lern-Ziel
--   auf fertig geht.
-- mcp_log: jeder Schreibaufruf von Claude, damit nachvollziehbar bleibt,
--   was geändert wurde. Nur lesen/einfügen, eigene Zeilen.

alter table public.wochenziele add column if not exists lernnotiz text;

create table if not exists public.mcp_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  zeit       timestamptz not null default now(),
  werkzeug   text not null,
  eingabe    jsonb not null default '{}'::jsonb,
  ergebnis   text,
  client_id  text
);
create index if not exists mcp_log_user_zeit on public.mcp_log (user_id, zeit desc);

alter table public.mcp_log enable row level security;
drop policy if exists "mcp_log eigene lesen" on public.mcp_log;
create policy "mcp_log eigene lesen" on public.mcp_log
  for select using (auth.uid() = user_id);
drop policy if exists "mcp_log eigene schreiben" on public.mcp_log;
create policy "mcp_log eigene schreiben" on public.mcp_log
  for insert with check (auth.uid() = user_id);
