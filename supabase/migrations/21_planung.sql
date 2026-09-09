-- ============================================================================
-- 21_planung.sql
--
-- Projekte, Aufgaben und die Oberflächen-Einstellungen.
-- Gehoert in die KerimOS-Hauptdatenbank (fhgrjqvunxbfhujoxmcn).
--
-- Bildet das Notion-Dashboard nach, das Kerim bisher parallel gefuehrt hat:
-- zwei verknuepfte Datenbanken, Projects und Tasks. Bewusst so schmal wie
-- das Original — ein Projekt hat einen Namen und sonst nichts, eine Aufgabe
-- einen Namen, einen Haken, optional ein Datum und optional ein Projekt.
--
-- Warum nicht die alte `tasks`-Tabelle aus 10_tasks.sql? Die gehoerte zum
-- Zeit-Bereich, der am 09.09.2026 entfallen ist, und trug dessen Ballast:
-- Prioritaet, Lebensbereich, Unteraufgaben, Sortierung. Sie steht unberuehrt
-- in der Datenbank. Die neue heisst `planung_tasks`, damit beide
-- nebeneinander existieren koennen und kein Altbestand still mitgeschleppt
-- wird.
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

/* ---------------------------------------------------------------- Projekte */

CREATE TABLE IF NOT EXISTS planung_projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  -- Nur fuer die Kachelansicht, damit sich Projekte auf einen Blick
  -- unterscheiden. Kein Pflichtfeld, kein Verhalten daran.
  color      TEXT NOT NULL DEFAULT '#9A8C74',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT planung_projects_name_unique UNIQUE (user_id, name)
);

ALTER TABLE planung_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_planung_projects ON planung_projects;
CREATE POLICY own_planung_projects ON planung_projects
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

/* ---------------------------------------------------------------- Aufgaben */

CREATE TABLE IF NOT EXISTS planung_tasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  -- Optional: eine Aufgabe ohne Datum ist eine Absicht, keine Verabredung.
  -- Nur Aufgaben MIT Datum stehen im Kalender.
  due_date   DATE,
  -- ON DELETE SET NULL statt CASCADE: ein geloeschtes Projekt darf keine
  -- Arbeit mitreissen. Die Aufgaben bleiben stehen, nur ohne Zuordnung —
  -- alles andere waere ein Datenverlust, den ein Klick ausloest.
  project_id UUID REFERENCES planung_projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at    TIMESTAMPTZ
);

-- Der haeufigste Zugriff: offene Aufgaben nach Datum. Teilindex, weil
-- erledigte in dieser Abfrage nie vorkommen.
CREATE INDEX IF NOT EXISTS idx_planung_tasks_offen
  ON planung_tasks(user_id, due_date NULLS LAST) WHERE done = false;

-- Der Kalender fragt einen Monat am Stueck ab.
CREATE INDEX IF NOT EXISTS idx_planung_tasks_datum
  ON planung_tasks(user_id, due_date) WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_planung_tasks_projekt
  ON planung_tasks(project_id);

ALTER TABLE planung_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_planung_tasks ON planung_tasks;
CREATE POLICY own_planung_tasks ON planung_tasks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

/* ------------------------------------------------------ Oberflaeche */
-- Eine Zeile je Nutzer. Bewusst KEINE Tabelle mit beliebigen
-- Schluessel-Wert-Paaren: benannte Spalten sind typisiert, tauchen in den
-- generierten Typen auf und man sieht beim Lesen des Schemas, was es gibt.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Die Hausfarbe. Faerbt Knoepfe, aktive Reiter und den Schein darunter.
  akzent     TEXT NOT NULL DEFAULT '#E7A96B',
  -- Der driftende Farbnebel hinter der Oberflaeche. Schoen, aber auf einem
  -- schwachen Geraet kostet er Bildrate — deshalb abschaltbar.
  ambient    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_user_settings ON user_settings;
CREATE POLICY own_user_settings ON user_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT tablename, policyname FROM pg_policies
--    WHERE tablename IN ('planung_projects', 'planung_tasks', 'user_settings');
--   -- Aufgabe ueberlebt das Loeschen ihres Projekts:
--   --   INSERT INTO planung_projects (user_id, name) VALUES (auth.uid(), 'Test')
--   --     RETURNING id;
--   --   INSERT INTO planung_tasks (user_id, name, project_id)
--   --     VALUES (auth.uid(), 'Testaufgabe', '<id>');
--   --   DELETE FROM planung_projects WHERE name = 'Test';
--   --   SELECT name, project_id FROM planung_tasks WHERE name = 'Testaufgabe';
--   --   -- erwartet: Testaufgabe | NULL
-- ---------------------------------------------------------------------------
