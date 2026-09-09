-- ============================================================================
-- 23_planung_ansicht.sql
--
-- Baut auf 21_planung.sql auf — das muss vorher gelaufen sein.
-- Gehoert in die KerimOS-Hauptdatenbank (fhgrjqvunxbfhujoxmcn).
--
-- Zwei Schalter fuer den Kalender, beide aus derselben Beobachtung: er zeigt
-- inzwischen dreierlei am selben Tag — offene Aufgaben, erledigte Aufgaben und
-- die Eintraege des Gewohnheiten-Trackers. Fuer den einen ist das der
-- vollstaendige Tag, fuer den anderen ein zugestellter Kalender.
--
-- Bewusst zwei benannte Spalten und keine Tabelle mit beliebigen
-- Schluessel-Wert-Paaren: benannte Spalten sind typisiert, tauchen in den
-- generierten Typen auf, und man sieht beim Lesen des Schemas, was es gibt.
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

ALTER TABLE user_settings
  -- Erledigte Aufgaben durchgestrichen stehen lassen, oder ausblenden.
  -- Standard ist zeigen: "was war" ist die haeufigere Frage an einen
  -- vergangenen Tag.
  ADD COLUMN IF NOT EXISTS planung_erledigte BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE user_settings
  -- Die Haken aus dem Gewohnheiten-Tracker im selben Kalender.
  ADD COLUMN IF NOT EXISTS planung_gewohnheiten BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT akzent, ambient, planung_erledigte, planung_gewohnheiten
--     FROM user_settings;
-- ---------------------------------------------------------------------------
