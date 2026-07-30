-- ============================================================================
-- 10_tasks.sql
--
-- Aufgaben mit Deadline, Lebensbereich, Details und Unteraufgaben.
--
-- Warum eine eigene Tabelle life_areas und nicht der bestehende Zeit-Bucket?
-- Der Bucket ist ein fester Typ, an dem die ganze Zeitauswertung hängt
-- (v_daily_time hat eine Spalte pro Bucket). Aufgaben sollen dagegen frei
-- erweiterbar sein. life_areas startet deshalb mit genau denselben sieben
-- Bereichen, lässt sich aber jederzeit ergänzen - ohne das Zeit-Modul zu
-- berühren. Die Spalte bucket hält die Verbindung, wo es eine gibt.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos.
-- ============================================================================

/* ------------------------------------------------------------ Lebensbereiche */

CREATE TABLE IF NOT EXISTS life_areas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  -- Verbindung zum Zeit-Bucket, wo es eine gibt. NULL = eigener Bereich.
  bucket     TEXT CHECK (bucket IN ('ziel', 'arbeit', 'pflicht', 'regeneration',
                                    'sozial', 'spass', 'leerlauf')),
  color      TEXT NOT NULL DEFAULT '#8A8478',
  sort_order INT  NOT NULL DEFAULT 0,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT life_areas_name_unique UNIQUE (user_id, name)
);

ALTER TABLE life_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_life_areas ON life_areas;
CREATE POLICY own_life_areas ON life_areas
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

/* -------------------------------------------------------------- Aufgaben */

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  details      TEXT,
  -- Bereich löschen lässt die Aufgabe stehen, nur ohne Zuordnung
  life_area_id UUID REFERENCES life_areas(id) ON DELETE SET NULL,
  due_on       DATE,
  -- 0 = normal, 1 = wichtig. Bewusst zwei Stufen: mehr wird nie gepflegt.
  priority     SMALLINT NOT NULL DEFAULT 0 CHECK (priority IN (0, 1)),
  -- Gesetzt heisst erledigt. Der Zeitpunkt erlaubt "heute abgehakt".
  done_at      TIMESTAMPTZ,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Der häufigste Zugriff: offene Aufgaben nach Deadline. Teilindex, weil
-- erledigte Aufgaben in dieser Abfrage nie vorkommen.
CREATE INDEX IF NOT EXISTS idx_tasks_open
  ON tasks(user_id, due_on NULLS LAST) WHERE done_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks(life_area_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_tasks ON tasks;
CREATE POLICY own_tasks ON tasks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

/* --------------------------------------------------------- Unteraufgaben */

CREATE TABLE IF NOT EXISTS subtasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  done_at    TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id, sort_order);

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_subtasks ON subtasks;
CREATE POLICY own_subtasks ON subtasks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

/* -------------------------------------------------- Die sieben Bereiche */
-- Dieselben Namen und Farben wie die Zeit-Buckets, damit Aufgaben und
-- erfasste Zeit dieselbe Sprache sprechen. ON CONFLICT: wer schon Bereiche
-- hat, bekommt keine Dubletten.

INSERT INTO life_areas (user_id, name, bucket, color, sort_order)
SELECT u.id, v.name, v.bucket, v.color, v.ord
FROM auth.users u
CROSS JOIN (VALUES
  ('Ziele',        'ziel',         '#5B8C7B', 1),
  ('Arbeit',       'arbeit',       '#C4A882', 2),
  ('Pflicht',      'pflicht',      '#A8A093', 3),
  ('Regeneration', 'regeneration', '#8FA6B8', 4),
  ('Soziales',     'sozial',       '#D2A05F', 5),
  ('Spass',        'spass',        '#BE8DA4', 6),
  ('Leerlauf',     'leerlauf',     '#B9847A', 7)
) AS v(name, bucket, color, ord)
ON CONFLICT (user_id, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT name, bucket FROM life_areas ORDER BY sort_order;
--   -- erwartet: Ziele, Arbeit, Pflicht, Regeneration, Soziales, Spass, Leerlauf
--   SELECT tablename, policyname FROM pg_policies
--    WHERE tablename IN ('life_areas', 'tasks', 'subtasks');
-- ---------------------------------------------------------------------------
