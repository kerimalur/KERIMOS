-- ============================================================================
-- 09_gym_settings.sql
--
-- ACHTUNG: Diese Migration gehört NICHT in das Kompass-Projekt, sondern in
-- das GYM-Supabase-Projekt (kvpexrorkqmxnzqvexga) - dort, wo training_days,
-- exercises und workout_sessions liegen.
--
-- Grund: Das Wochenziel lag bisher nur im localStorage der Gym-App. Damit
-- war es an ein Gerät und einen Browser gebunden - KerimOS konnte es weder
-- lesen noch setzen. Eine Zeile pro Nutzer in der Datenbank löst das.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gym_settings (
  user_id      UUID PRIMARY KEY,
  -- Angestrebte Trainings pro Woche. Kerims Ziel: 4x Kraft + 1-2x Ausdauer.
  weekly_goal  INT NOT NULL DEFAULT 4 CHECK (weekly_goal BETWEEN 1 AND 14),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gym_settings ENABLE ROW LEVEL SECURITY;

-- Gleiche Logik wie die übrigen Gym-Tabellen (siehe 003_user_rls.sql):
-- angemeldete Nutzer sehen und ändern ausschliesslich ihre eigene Zeile.
-- KerimOS greift serverseitig mit dem service_role-Schlüssel zu und umgeht
-- RLS ohnehin - diese Policy gilt für die Gym-App selbst.
DROP POLICY IF EXISTS user_own_gym_settings ON gym_settings;
CREATE POLICY user_own_gym_settings
  ON gym_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT policyname FROM pg_policies WHERE tablename = 'gym_settings';
--   -- erwartet: user_own_gym_settings
-- ---------------------------------------------------------------------------
