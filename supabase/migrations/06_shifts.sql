-- ============================================================================
-- 06_shifts.sql
--
-- Schichten: einmal definieren, dann pro Arbeitstag mit zwei Klicks als
-- Zeiteinträge materialisieren (siehe /schichten und applyShift in actions.ts).
--
--   blocks          jsonb-Array [{ "start": 600, "minutes": 240 }, ...]
--                   start = Minuten seit Mitternacht. Zwei Einträge bedeuten
--                   eine Schicht mit Zimmerstunde.
--   weg_minutes     Arbeitsweg je Richtung, optional. Wird vor dem ersten und
--                   nach dem letzten Block als eigener Eintrag gebucht.
--   weg_activity_id Aktivität, auf die der Weg zählt (z.B. "Pflicht/Weg").
--
-- Die Schicht selbst erzeugt keine Summen: applyShift schreibt gewöhnliche
-- time_entries, die danach wie jeder andere Eintrag änder- und löschbar sind.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  activity_id     UUID REFERENCES activities(id) ON DELETE SET NULL,
  blocks          JSONB NOT NULL DEFAULT '[]'::jsonb,
  weg_minutes     INT  NOT NULL DEFAULT 0 CHECK (weg_minutes BETWEEN 0 AND 180),
  weg_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);

-- Row Level Security: jede Zeile gehört genau einem Konto, wie überall sonst.
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_shifts ON shifts;
CREATE POLICY own_shifts ON shifts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Verifikation
--
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'shifts';
--   -- erwartet: shifts | t
--
--   SELECT policyname FROM pg_policies WHERE tablename = 'shifts';
--   -- erwartet: own_shifts
-- ---------------------------------------------------------------------------
