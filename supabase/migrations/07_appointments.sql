-- ============================================================================
-- 07_appointments.sql
--
-- Termine: am Computer eintragen, unterwegs sehen.
--
-- Bewusst schlank gehalten - Titel, Datum, optionale Uhrzeit, optionaler Ort
-- und eine Notiz. Ganztägige Termine haben schlicht keine Startzeit.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  starts_on    DATE NOT NULL,
  -- Minuten seit Mitternacht. NULL = ganztägig.
  start_minute INT CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute   INT CHECK (end_minute BETWEEN 0 AND 1440),
  location     TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT appointments_range_check
    CHECK (end_minute IS NULL OR start_minute IS NULL OR end_minute > start_minute)
);

CREATE INDEX IF NOT EXISTS idx_appointments_user_date
  ON appointments(user_id, starts_on);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_appointments ON appointments;
CREATE POLICY own_appointments ON appointments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT policyname FROM pg_policies WHERE tablename = 'appointments';
--   -- erwartet: own_appointments
-- ---------------------------------------------------------------------------
