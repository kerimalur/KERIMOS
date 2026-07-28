-- ============================================================================
-- 08_transfer_rules.sql
--
-- Umbuchungs-Regeln: Text im Buchungstext -> Zielkonto.
--
-- Hintergrund: alles läuft über das Privatkonto. Geht Geld aufs Sparkonto,
-- ins Fonddepot oder aufs Trading-Konto, ist das keine Ausgabe, sondern eine
-- Verschiebung innerhalb des eigenen Vermögens. Der Auszug des Privatkontos
-- zeigt aber nur die eine Seite.
--
-- Greift beim Import eine Regel, legt KerimOS die Gegenbuchung auf dem
-- Zielkonto an (gleicher Tag, gleicher Betrag mit umgekehrtem Vorzeichen,
-- beide als is_transfer markiert). Damit stimmen alle Konten aus einem
-- einzigen Auszug.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS transfer_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Textstück, das im Buchungstext vorkommen muss (ohne Gross-/Kleinschreibung).
  pattern           TEXT NOT NULL,
  -- Konto, auf dem die Gegenbuchung entsteht.
  target_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_rules_user ON transfer_rules(user_id);

ALTER TABLE transfer_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_transfer_rules ON transfer_rules;
CREATE POLICY own_transfer_rules ON transfer_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT policyname FROM pg_policies WHERE tablename = 'transfer_rules';
--   -- erwartet: own_transfer_rules
-- ---------------------------------------------------------------------------
