-- ============================================================================
-- 19_habits.sql
--
-- Gewohnheiten: eine Zeile je Gewohnheit, eine Zeile je erledigtem Tag.
-- Gehoert in die KerimOS-Hauptdatenbank (fhgrjqvunxbfhujoxmcn).
--
-- Warum ein eigener Tracker und nicht die Trainingseinheiten zaehlen?
-- Die Gym-Auswertung (Muskelbalance, Fortschritt je Uebung, Wochenziele nach
-- Kraft und Ausdauer) ist am 09.09.2026 entfallen. Uebrig bleibt genau eine
-- Frage: war ich da, wie oft. Die beantwortet ein Haken pro Tag besser als
-- eine Session mit Saetzen — und derselbe Haken taugt fuer alles andere, was
-- man regelmaessig tun will, deshalb ist der Tracker allgemein.
--
-- `bereich` haelt die Verbindung zu einem Modus: Gewohnheiten mit 'gym'
-- stehen im Gym-Bereich, alle anderen unter /gewohnheiten. Kein Fremdschlüssel
-- auf die Modi — die entstehen frei ueber die Kachel-Gruppen und wuerden hier
-- nur eine Pflege erzwingen, die niemand macht.
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

/* --------------------------------------------------------- Gewohnheiten */

CREATE TABLE IF NOT EXISTS habits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  -- Ein Zeichen fuer die Kachel. Leer ist erlaubt, dann steht der Anfangs-
  -- buchstabe da.
  icon       TEXT,
  color      TEXT NOT NULL DEFAULT '#9A8C74',
  -- Wie oft pro Woche angepeilt. 0 = kein Ziel, dann wird nur gezaehlt.
  ziel_pro_woche SMALLINT NOT NULL DEFAULT 0
    CHECK (ziel_pro_woche BETWEEN 0 AND 7),
  -- 'gym' erscheint im Gym-Bereich, alles andere unter /gewohnheiten.
  bereich    TEXT NOT NULL DEFAULT 'allgemein',
  sort_order INT NOT NULL DEFAULT 0,
  -- Archiviert statt geloescht: der Verlauf bleibt lesbar.
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT habits_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_habits_aktiv
  ON habits(user_id, bereich, sort_order) WHERE archived = false;

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_habits ON habits;
CREATE POLICY own_habits ON habits
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

/* ------------------------------------------------------------- Eintraege */
-- Eine Zeile heisst "an diesem Tag getan". Kein `done`-Flag: der fehlende
-- Eintrag IST das Nein. Sonst haette jeder Tag seit Beginn eine Zeile, und
-- die Zaehlung muesste zwischen "nicht getan" und "nie gefragt" unterscheiden.

CREATE TABLE IF NOT EXISTS habit_entries (
  habit_id   UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  -- Optionale Randnotiz zum Tag, z.B. „nur 20 Minuten".
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (habit_id, entry_date)
);

-- Der haeufigste Zugriff: alle Tage einer Gewohnheit ab einem Datum.
CREATE INDEX IF NOT EXISTS idx_habit_entries_datum
  ON habit_entries(habit_id, entry_date DESC);

ALTER TABLE habit_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_habit_entries ON habit_entries;
CREATE POLICY own_habit_entries ON habit_entries
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

/* ------------------------------------------------------- Die erste Zeile */
-- Gym ist der Grund, warum es den Tracker gibt — die Gewohnheit soll da sein,
-- bevor Kerim das erste Mal darauf drueckt. ON CONFLICT: wer sie schon hat,
-- bekommt keine zweite.

INSERT INTO habits (user_id, name, icon, color, ziel_pro_woche, bereich, sort_order)
SELECT u.id, 'Gym', '🏋', '#C68D6B', 4, 'gym', 1
FROM auth.users u
ON CONFLICT (user_id, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT name, bereich, ziel_pro_woche FROM habits ORDER BY sort_order;
--   -- erwartet: Gym | gym | 4
--   SELECT tablename, policyname FROM pg_policies
--    WHERE tablename IN ('habits', 'habit_entries');
-- ---------------------------------------------------------------------------
