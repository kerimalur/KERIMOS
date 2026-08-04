-- =====================================================================
--  Tagesvorlagen: Tag-Typ und eigene Tagesziele
--  Projekt: kvpexrorkqmxnzqvexga ("Gymapp Cursor")
--
--  Bisher war eine Vorlage nur eine Liste von Rezepten. Jetzt weiss sie
--  auch, wofür sie gedacht ist: Trainingstag oder trainingsfreier Tag -
--  und bringt eigene Tagesziele mit.
--
--  Der Punkt dahinter: an freien Tagen fällt das Training weg, das
--  Porridge auch, und damit rund 300 kcal. Das Protein-Ziel bleibt aber
--  gleich. Nur die Kalorien werden reduziert, nie das Eiweiss.
-- =====================================================================

alter table day_templates
  add column if not exists is_training_day boolean not null default true,
  add column if not exists kcal_target     int     not null default 2100,
  add column if not exists protein_target  int     not null default 190;

-- Bestandsvorlagen: alle bisherigen waren als Trainingstag gedacht.
-- Ausdrücklich setzen statt auf den Default zu vertrauen, damit auch
-- Zeilen erfasst werden, die vor einem früheren Lauf entstanden sind.
update day_templates
   set is_training_day = true,
       kcal_target     = 2100,
       protein_target  = 190
 where kcal_target is null
    or kcal_target = 0;

-- Vorlagen mit "frei"/"Wochenende" im Namen sind erfahrungsgemäss
-- trainingsfrei gemeint. Nur ein Startwert - in der Oberfläche jederzeit
-- änderbar.
update day_templates
   set is_training_day = false,
       kcal_target     = 1800
 where name ilike '%frei%'
    or name ilike '%wochenende%';

comment on column day_templates.is_training_day is
  'Trainingstag ja/nein. Steuert nur die Zielwerte, nicht die Rezepte.';
comment on column day_templates.kcal_target is
  'Kalorienziel dieses Tag-Typs. Trainingstag 2100, freier Tag 1800.';
comment on column day_templates.protein_target is
  'Proteinziel in g. Bleibt bei 190, egal ob Trainingstag oder nicht.';

-- Kontrolle
select name, is_training_day, kcal_target, protein_target
  from day_templates order by name;
