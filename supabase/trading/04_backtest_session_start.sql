-- ============================================================================
-- backtest-session-start.sql        27.08.2026
--
-- ACHTUNG: gehört in die TRADING-Datenbank (dort, wo `backtest_trades` und
-- `backtest_journal_sessions` liegen) — nicht in KerimOS und nicht ins
-- Gym-Projekt.
--
--   start_date   Ab welchem Datum diese Session durchgearbeitet wird.
--
-- Klingt nach Verwaltung, spart aber echte Zeit: das Trade-Formular macht
-- beim Datum des zuletzt erfassten Trades auf, und für den allerersten Trade
-- einer Session gab es bisher nichts, worauf es aufmachen könnte — also
-- stand dort der heutige Tag, und der ist beim Backtesten von 2021 der
-- denkbar falscheste Startpunkt.
--
-- Nullable, weil die bestehenden Sessions kein Startdatum haben. Für die
-- fällt das Formular auf den letzten Trade und erst danach auf heute zurück.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos.
--
-- Bis die Migration läuft, fallen Lesen und Schreiben auf den alten
-- Spaltensatz zurück (siehe lib/supabase/backtest.ts und lib/backtest-
-- actions.ts) — Sessions lassen sich also weiterhin anlegen, nur ohne
-- Startdatum.
-- ============================================================================

alter table backtest_journal_sessions
  add column if not exists start_date date;

comment on column backtest_journal_sessions.start_date is
  'Erster Handelstag, ab dem diese Session durchgearbeitet wird. Vorgabe fürs Trade-Formular.';
