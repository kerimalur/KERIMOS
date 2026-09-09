-- ============================================================================
-- 20_habits_varianten.sql
--
-- Baut auf 19_habits.sql auf — das muss vorher gelaufen sein.
-- Gehoert in die KerimOS-Hauptdatenbank (fhgrjqvunxbfhujoxmcn).
--
-- Drei Erweiterungen, alle aus derselben Beobachtung: „war ich da" ist bei
-- manchen Gewohnheiten zu grob.
--
-- 1. VARIANTEN. Beim Gym ist Push nicht Pull und Ausdauer keins von beidem.
--    Drei getrennte Gewohnheiten waeren die Alternative gewesen — dann haette
--    aber jede ihre eigene Serie und ihr eigenes Wochenziel, und die Frage
--    „wie oft war ich diese Woche" muesste man aus dreien zusammenzaehlen.
--    Eine Gewohnheit mit Varianten haelt die Zaehlung zusammen und zeigt die
--    Aufteilung trotzdem.
--
-- 2. MIT_DATUM. Der Haken gilt normalerweise fuer heute — ein Druck, fertig.
--    Bei Trainings stimmt das nicht: man traegt sie abends nach, manchmal
--    erst uebermorgen. Solche Gewohnheiten fragen deshalb erst nach dem Tag
--    (und der Variante), statt still heute zu nehmen und falsch zu zaehlen.
--
-- 3. MEHRERE EINTRAEGE PRO TAG. Kraft am Morgen und Ausdauer am Abend sind
--    zwei Einheiten. Der bisherige Primaerschluessel (habit_id, entry_date)
--    liess nur eine zu. Neu ist der Schluessel eine eigene Id, und eindeutig
--    ist die Kombination aus Tag UND Variante: derselbe Push zweimal am
--    selben Tag bleibt ein Versehen und wird abgewiesen.
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

/* ------------------------------------------------------ Varianten und Datum */

ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS mit_datum BOOLEAN NOT NULL DEFAULT false;

-- Leere Liste heisst: keine Unterteilung, der Haken steht fuer sich.
ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS varianten TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE habit_entries
  ADD COLUMN IF NOT EXISTS variante TEXT;

/* ------------------------------------------- Mehrere Eintraege je Tag */
-- Der Umbau des Primaerschluessels laeuft in einem Block, damit die Tabelle
-- nie ohne Schluessel dasteht. Bestehende Zeilen bekommen ihre Id per
-- Vorgabewert und bleiben unangetastet.

ALTER TABLE habit_entries
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

DO $$
BEGIN
  -- Alter Schluessel (habit_id, entry_date) — nur weg, wenn er noch steht.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'habit_entries_pkey'
       AND conrelid = 'habit_entries'::regclass
       AND array_length(conkey, 1) = 2
  ) THEN
    ALTER TABLE habit_entries DROP CONSTRAINT habit_entries_pkey;
    ALTER TABLE habit_entries ADD CONSTRAINT habit_entries_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Eindeutig ist Tag + Variante. `coalesce` statt der Spalte direkt, weil in
-- Postgres zwei NULL nicht als gleich gelten — ohne das liesse sich derselbe
-- variantenlose Tag beliebig oft eintragen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_entries_eindeutig
  ON habit_entries (habit_id, entry_date, COALESCE(variante, ''));

/* --------------------------------------------------------- Gym einrichten */
-- Die Gewohnheit aus 19_habits.sql bekommt ihre drei Varianten und die
-- Datumsabfrage. Nur, solange Kerim sie nicht selbst schon geaendert hat:
-- `varianten = '{}'` ist die Bedingung, damit ein zweiter Lauf eine eigene
-- Einteilung nicht ueberschreibt.

UPDATE habits
   SET varianten = ARRAY['Push', 'Pull', 'Ausdauer'],
       mit_datum = true
 WHERE bereich = 'gym'
   AND varianten = '{}';

-- ---------------------------------------------------------------------------
-- Verifikation
--   SELECT name, mit_datum, varianten FROM habits ORDER BY sort_order;
--   -- erwartet: Gym | t | {Push,Pull,Ausdauer}
--   SELECT indexname FROM pg_indexes WHERE tablename = 'habit_entries';
--   -- erwartet u.a. idx_habit_entries_eindeutig
-- ---------------------------------------------------------------------------
