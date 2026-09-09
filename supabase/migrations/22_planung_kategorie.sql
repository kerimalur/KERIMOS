-- ============================================================================
-- 22_planung_kategorie.sql
--
-- Baut auf 21_planung.sql auf — das muss vorher gelaufen sein.
-- Gehoert in die KerimOS-Hauptdatenbank (fhgrjqvunxbfhujoxmcn).
--
-- Eine Spalte, eine Entscheidung: Gewohnheiten sind Aufgaben.
--
-- Das Notion-Dashboard, das hier nachgebaut wird, kennt keinen getrennten
-- Habit-Tracker. Es kennt Tasks, und eine davon ist zufaellig eine, die man
-- jede Woche wieder anlegt. `category` unterscheidet die beiden nur fuer die
-- Anzeige und das Filtern — dieselbe Tabelle, dieselbe Kalenderansicht,
-- dieselbe Checkbox.
--
-- Der Preis dieser Entscheidung soll hier stehen, damit ihn niemand spaeter
-- neu entdeckt: ein Habit als Task-Zeile kennt keine Serie, keine Wochenquote
-- und keine Varianten (Push/Pull/Ausdauer). Es ist ein Haken an einem Tag.
-- Wer zaehlen will, wie oft etwas passiert ist, zaehlt erledigte Zeilen mit
-- `category = 'Habit'` — mehr gibt das Modell nicht her, und mehr war auch
-- nicht verlangt.
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

ALTER TABLE planung_tasks
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Aufgabe';

-- Als Pruefregel und nicht als eigene Tabelle: zwei feste Werte, die sich
-- nicht vermehren sollen. Eine Nachschlagetabelle waere hier eine Einladung,
-- Kategorien zu erfinden — und genau das macht Listen unbrauchbar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planung_tasks_category_check'
  ) THEN
    ALTER TABLE planung_tasks
      ADD CONSTRAINT planung_tasks_category_check
      CHECK (category IN ('Aufgabe', 'Habit'));
  END IF;
END $$;

-- Die Startseite fragt offene Eintraege je Art ab.
CREATE INDEX IF NOT EXISTS idx_planung_tasks_kategorie
  ON planung_tasks(user_id, category) WHERE done = false;

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT category, count(*) FROM planung_tasks GROUP BY category;
--   -- Ein unerlaubter Wert muss abgewiesen werden:
--   --   UPDATE planung_tasks SET category = 'Quatsch';
--   --   -- erwartet: new row violates check constraint
-- ---------------------------------------------------------------------------
