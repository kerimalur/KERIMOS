-- =====================================================================
--  Korrektur zu Migration 13
--  Projekt: kvpexrorkqmxnzqvexga ("Gymapp Cursor")
--
--  Migration 13 hat den Tag-Typ an die Vorlage gehängt. Das war falsch
--  gedacht: es gibt nicht "Trainingsvorlagen" und "freie Vorlagen" -
--  es gibt jede Vorlage in beiden Ausführungen. Ob trainiert wird,
--  entscheidet sich erst beim Einfügen auf einen konkreten Tag.
--
--  Ausserdem hat 13 alles mit "frei" im Namen als trainingsfrei
--  eingestuft. "Freier Trainingstag (Training 08:30)" ist aber genau
--  das Gegenteil: freier Tag MIT Training, also 2100 kcal inklusive
--  Porridge.
--
--  Neu stattdessen: einzelne Zeilen einer Vorlage können als "nur mit
--  Training" markiert werden. Wird die Vorlage ohne Training eingefügt,
--  tauchen diese Zeilen gar nicht erst in der Auswahl auf.
--
--  Idempotent - kann auch laufen, wenn Migration 13 nie ausgeführt wurde.
-- =====================================================================

-- 1) Fehlgriff aus Migration 13 zurückbauen.
alter table day_templates
  drop column if exists is_training_day,
  drop column if exists kcal_target,
  drop column if exists protein_target;

-- 2) Neu: Zeilen, die es nur an Trainingstagen gibt.
alter table day_template_items
  add column if not exists training_only boolean not null default false;

comment on column day_template_items.training_only is
  'Nur an Trainingstagen einfügen. Für Mahlzeiten, die den Trainingstag '
  'ausgleichen - typisch das Porridge. Ohne Training wird die Zeile im '
  'Einfüge-Dialog gar nicht angeboten.';

-- 3) Startwert: Porridge ist die Mahlzeit, die ohne Training wegfällt.
--    Nur ein Vorschlag - in der Vorlagen-Verwaltung jederzeit änderbar.
update day_template_items i
   set training_only = true
  from recipes r
 where r.id = i.recipe_id
   and r.name ilike '%porridge%';

-- Kontrolle: welche Zeile hängt am Training?
select t.name              as vorlage,
       i.meal_type,
       r.name              as rezept,
       i.training_only
  from day_template_items i
  join day_templates t on t.id = i.template_id
  join recipes       r on r.id = i.recipe_id
 order by t.name, i.sort_order;
