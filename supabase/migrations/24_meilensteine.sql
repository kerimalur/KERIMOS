-- ============================================================================
-- 24_meilensteine.sql
--
-- Baut auf 21_planung.sql auf — das muss vorher gelaufen sein.
-- Gehoert in die KerimOS-Hauptdatenbank (fhgrjqvunxbfhujoxmcn).
--
-- Meilensteine machen den Fortschritt eines Projekts ueberhaupt erst messbar.
--
-- Der naheliegende Weg waere gewesen, "5 von 8 Aufgaben erledigt" als Balken
-- zu zeigen. Das ist aber keine Aussage ueber Fortschritt, sondern ueber
-- Betriebsamkeit: wer waehrend eines Umzugs zwanzig Kleinigkeiten eintraegt,
-- faellt im Balken zurueck, obwohl er vorangekommen ist. Und ein Projekt ohne
-- Ende ("Haushalt") haette einen Balken, der nie voll wird und deshalb nichts
-- sagt.
--
-- Meilensteine sind das, was Kerim selbst als Etappe benennt. Wer keine
-- setzt, bekommt keinen Balken — und das ist die richtige Vorgabe, nicht ein
-- fehlendes Feature.
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS planung_meilensteine (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- CASCADE, anders als bei den Aufgaben: ein Meilenstein gehoert seinem
  -- Projekt und ergibt ohne es keinen Sinn. Eine Aufgabe dagegen ist auch
  -- ohne Projekt noch Arbeit, die getan werden muss.
  project_id UUID NOT NULL REFERENCES planung_projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at    TIMESTAMPTZ
);

-- Der einzige Zugriff: alle Meilensteine eines Projekts in ihrer Reihenfolge.
CREATE INDEX IF NOT EXISTS idx_meilensteine_projekt
  ON planung_meilensteine(project_id, sort_order);

ALTER TABLE planung_meilensteine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_planung_meilensteine ON planung_meilensteine;
CREATE POLICY own_planung_meilensteine ON planung_meilensteine
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT p.name, count(m.*) FILTER (WHERE m.done) AS erledigt, count(m.*)
--     FROM planung_projects p
--     LEFT JOIN planung_meilensteine m ON m.project_id = p.id
--    GROUP BY p.name;
--   -- Ein geloeschtes Projekt nimmt seine Meilensteine mit, aber KEINE
--   -- Aufgaben (die haengen an ON DELETE SET NULL, siehe 21_planung.sql).
-- ---------------------------------------------------------------------------
