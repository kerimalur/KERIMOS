-- Alarm-Einstellungen für KerimOS
--
-- ACHTUNG: Diese Datei gehört NICHT in die KerimOS-Datenbank, sondern in die
-- Trading-Datenbank (Supabase-Projekt bpggwelpuvbkeudrqoiv), die sich KerimOS
-- mit dem GVA-Screener teilt. Dort liegen auch trading_watchlist, alarm_log
-- und push_subscriptions. Ausführen im SQL-Editor dieses Projekts.
--
-- Genau eine Zeile (id = 1). Kein user_id: die Nachbartabellen führen auch
-- keines, KerimOS ist eine Einbenutzer-App, und eine Spalte mit überall
-- demselben Wert ist keine Trennung, sondern nur eine Stelle mehr, an der man
-- sie vergessen kann.

create table if not exists alarm_einstellungen (
  id               int primary key default 1 check (id = 1),
  -- Kanäle
  push_an          boolean     not null default true,
  telegram_an      boolean     not null default false,
  -- Leer = TELEGRAM_CHAT_ID aus der Umgebung gilt
  telegram_chat_id text,
  -- Welche Alarmarten überhaupt: naehe | hit | zeit
  arten            text[]      not null default '{naehe,hit,zeit}',
  -- Leer = alle Paare
  paare            text[]      not null default '{}',
  -- Ruhezeit, darf über Mitternacht gehen (22:00 -> 07:00)
  ruhe_von         time,
  ruhe_bis         time,
  -- Treffer trotz Ruhezeit durchlassen
  ruhe_ausser_hit  boolean     not null default true,
  -- Obergrenze über alle Linien pro Tag; 0 = keine Grenze
  max_pro_tag      int         not null default 40,
  -- Alles stumm bis einschliesslich diesem Tag
  stumm_bis        date,
  updated_at       timestamptz not null default now()
);

insert into alarm_einstellungen (id) values (1) on conflict (id) do nothing;

-- Zur Erinnerung, falls der Dublettenschutz mal fehlt: alarm_log braucht
-- diesen Index, sonst feuern überlappende Cron-Läufe dieselbe Meldung mehrfach.
create unique index if not exists alarm_log_einmal_pro_tag
  on alarm_log (watchlist_id, art, tag);
