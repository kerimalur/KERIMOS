-- Tagesrueckblick: drei Zeilen je Tag.
-- Gehoert in die KerimOS-Hauptdatenbank.

create table if not exists day_review (
  date       date primary key,
  achieved   text,
  unfinished text,
  tomorrow   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
