-- ============================================================================
-- 18_display_mode.sql
--
-- Gehört in die KerimOS-Hauptdatenbank (Supabase-Projekt "Kompass",
-- fhgrjqvunxbfhujoxmcn).
--
-- Zweck: Abend-/Schlafmodus. Die Startseite soll die Farbdarstellung des
-- ganzen Windows-PCs umschalten können. Eine HTTPS-Seite darf am PC nichts
-- ändern - also wird die Richtung umgedreht: Die Web-App schreibt nur einen
-- Wunsch in diese Zeile, ein lokaler Helper auf dem PC hört per Realtime
-- darauf und schaltet um. Damit geht es auch vom Handy aus.
--
-- Eine Zeile pro Nutzer und Gerät. Vier Zeitstempel-/Textfelder tragen den
-- Rückkanal: der Helper meldet, ob er lebt, ob er den Wunsch umgesetzt hat
-- und woran es sonst gescheitert ist.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS display_mode (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Für später: ein zweiter PC bekommt einfach eine zweite Zeile.
  device           TEXT NOT NULL DEFAULT 'desktop',

  mode             TEXT NOT NULL DEFAULT 'normal'
                     CHECK (mode IN ('normal', 'grayscale', 'red')),

  -- Wann das Frontend den Wunsch gesetzt hat.
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Wann der Helper ihn tatsächlich umgesetzt hat. Solange applied_at älter
  -- als requested_at ist (oder fehlt), zeigt der Schalter "wird übernommen".
  applied_at       TIMESTAMPTZ,

  -- Herzschlag des Helpers, alle 30 Sekunden. Älter als 90 Sekunden heisst
  -- für die Web-App: PC-Helper offline, Schalter ausgrauen.
  helper_last_seen TIMESTAMPTZ,

  -- Letzte Fehlermeldung des Helpers, im Klartext. NULL heisst: alles gut.
  last_error       TEXT,

  UNIQUE (user_id, device)
);

ALTER TABLE display_mode ENABLE ROW LEVEL SECURITY;

-- Der Helper meldet sich als normaler Benutzer an (kein service_role) und
-- unterliegt denselben Regeln wie der Browser: nur die eigene Zeile.
DROP POLICY IF EXISTS display_mode_select ON display_mode;
CREATE POLICY display_mode_select ON display_mode
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS display_mode_insert ON display_mode;
CREATE POLICY display_mode_insert ON display_mode
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS display_mode_update ON display_mode;
CREATE POLICY display_mode_update ON display_mode
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Ohne diese beiden Schritte kommen im Browser und im Helper keine
-- postgres_changes-Ereignisse an:
--   1. REPLICA IDENTITY FULL, damit das UPDATE-Ereignis die vollständige
--      Zeile trägt und die RLS-Prüfung von Realtime greifen kann.
--   2. Die Tabelle muss in der Publikation supabase_realtime stehen.
-- ---------------------------------------------------------------------------
ALTER TABLE display_mode REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'display_mode'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE display_mode;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT policyname FROM pg_policies WHERE tablename = 'display_mode';
--   -- erwartet: display_mode_select, display_mode_insert, display_mode_update
--
--   SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND tablename = 'display_mode';
--   -- erwartet: eine Zeile
--
--   SELECT relreplident FROM pg_class WHERE relname = 'display_mode';
--   -- erwartet: f
-- ---------------------------------------------------------------------------
