-- =====================================================================
--  Essen komplett zurücksetzen
--  Projekt: kvpexrorkqmxnzqvexga ("Gymapp Cursor")
--  Im Supabase SQL Editor ausführen.
--
--  LÖSCHT:  alle Rezepte samt Zutaten, alle Prep-Zyklen mit Töpfen und
--           Boxen, den kompletten Menüplan und die Ereignis-Regeln.
--  BLEIBT:  Lebensmittel (foods), Lebensmittel-Kategorien,
--           Vorlagen-Kategorien, Einstellungen, Einkaufsliste, Tages-Marker.
--
--  Danach ist der Essen-Bereich leer und du fängst sauber neu an.
-- =====================================================================

-- --- Schritt 1: anschauen, was gelöscht wird -------------------------
-- Dieser Block löscht noch nichts. Erst ausführen, Zahlen prüfen,
-- dann Schritt 2 markieren und ausführen.

select 'recipes'          as tabelle, count(*) as zeilen from recipes
union all select 'recipe_items',      count(*) from recipe_items
union all select 'event_meal_rules',  count(*) from event_meal_rules
union all select 'batch_portions',    count(*) from batch_portions
union all select 'prep_batches',      count(*) from prep_batches
union all select 'prep_cycles',       count(*) from prep_cycles
union all select 'meal_items',        count(*) from meal_items
union all select 'meals',             count(*) from meals
union all select 'meal_plans',        count(*) from meal_plans
order by 1;


-- --- Schritt 2: löschen ----------------------------------------------
-- Alles in einer Transaktion: geht ein Schritt schief, wird nichts
-- gelöscht. Reihenfolge folgt den Fremdschlüsseln von innen nach aussen.

begin;

  -- Regeln, die auf Rezepte zeigen (z.B. "an Trainingstagen dieses Rezept")
  delete from event_meal_rules;

  -- Meal Prep: Boxen -> Töpfe -> Zyklen
  delete from batch_portions;
  delete from prep_batches;
  delete from prep_cycles;

  -- Menüplan: Positionen -> Mahlzeiten -> Tage
  delete from meal_items;
  delete from meals;
  delete from meal_plans;

  -- Rezepte: Zutaten -> Rezepte
  delete from recipe_items;
  delete from recipes;

  -- Einstellungen, die auf gelöschte Rezepte zeigen, leeren statt löschen –
  -- die Schlüssel selbst bleiben, sonst fehlen sie der App.
  update settings
     set value = ''
   where key in ('default_breakfast_recipe_id', 'default_snack_recipe_id');

commit;


-- --- Schritt 3: Kontrolle --------------------------------------------
-- Alle Zahlen müssen 0 sein. foods bleibt bei seinen 112 Einträgen.

select 'recipes'          as tabelle, count(*) as zeilen from recipes
union all select 'recipe_items',      count(*) from recipe_items
union all select 'meal_plans',        count(*) from meal_plans
union all select 'meals',             count(*) from meals
union all select 'meal_items',        count(*) from meal_items
union all select 'prep_cycles',       count(*) from prep_cycles
union all select 'foods (soll bleiben)', count(*) from foods
order by 1;


-- --- Schritt 4 (OPTIONAL): auch die Lebensmittel löschen -------------
--
--  ACHTUNG, das ist die härtere Variante. Schritt 2 löscht bereits die
--  ZUTATEN DER REZEPTE (recipe_items, 196 Zeilen) – also welches
--  Lebensmittel in welcher Menge in welchem Rezept steckt.
--
--  Der Block hier löscht zusätzlich die LEBENSMITTEL-DATENBANK selbst:
--  alle 112 Einträge mit ihren Makronährwerten und Preisen pro 100 g.
--  Die musst du danach von Hand neu erfassen – das ist die Arbeit, die
--  am meisten weh tut. Nur ausführen, wenn du das wirklich willst.
--
--  Zum Ausführen: die vier Zeilen unten markieren und die Kommentar-
--  Striche am Zeilenanfang entfernen.

-- begin;
--   delete from foods;
--   delete from food_categories;
-- commit;


-- --- Optional: Einkaufsliste ebenfalls leeren ------------------------
-- Nur ausführen, wenn du auch die offenen Posten weghaben willst.
-- delete from shopping_list;


-- --- Optional: Vorlagen-Kategorien ebenfalls löschen ------------------
-- Die drei Kategorien, nach denen Rezepte gruppiert waren.
-- delete from template_categories;
