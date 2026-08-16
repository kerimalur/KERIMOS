-- Aktivitaetsbonus aufs Kalorienbudget.
-- ACHTUNG: gehoert in die MENUE-Datenbank (dort steht kcal_ziel in settings),
-- nicht in die KerimOS-Hauptdatenbank.

create table if not exists activity_bonus (
  id         uuid primary key default gen_random_uuid(),
  date       date        not null,
  -- lauf | gym | sonstiges
  kind       text        not null default 'sonstiges',
  -- Verbrannte Kalorien laut Uhr. NULL = Pauschale der Aktivität gilt.
  burned     int,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists activity_bonus_datum on activity_bonus (date);

-- Anrechnung in Prozent. 75 heisst: von 800 verbrannten zaehlen 600.
insert into settings (key, value) values ('bonus_faktor', '75')
  on conflict (key) do nothing;
