-- =====================================================================
--  Tagesvorlagen für den Essen-Bereich
--  Projekt: kvpexrorkqmxnzqvexga ("Gymapp Cursor")
--
--  Eine Vorlage ist ein fertig zusammengestellter Tag aus Rezepten -
--  wahlweise nur Mittag und Abend oder zusätzlich mit Snacks. Im Plan
--  lädt man sie mit einem Klick auf einen Tag.
--
--  Rezepte selbst bleiben unverändert: eine Vorlage verweist nur auf sie.
-- =====================================================================

create table if not exists day_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- Merkt sich, wie die Vorlage gedacht war. Rein informativ; welche
  -- Slots tatsächlich belegt sind, steht in day_template_items.
  with_snacks  boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists day_template_items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references day_templates(id) on delete cascade,
  -- Der Slot, in den dieses Rezept am Tag gehört.
  meal_type    text not null
               check (meal_type in ('fruehstueck','mittagessen','abendessen','snack')),
  -- Verschwindet das Rezept, verschwindet auch die Zeile in der Vorlage.
  recipe_id    uuid not null references recipes(id) on delete cascade,
  sort_order   int not null default 0
);

create index if not exists day_template_items_template_idx
  on day_template_items (template_id, sort_order);

-- Gleiche Sichtbarkeit wie die übrigen Menü-Tabellen: der Zugriff läuft
-- ausschliesslich über den Service-Key des Servers, nicht aus dem Browser.
alter table day_templates       enable row level security;
alter table day_template_items  enable row level security;

-- Kontrolle
select 'day_templates' as tabelle, count(*) from day_templates
union all select 'day_template_items', count(*) from day_template_items;
