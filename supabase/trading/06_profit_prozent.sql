-- ============================================================================
-- 06_profit_prozent.sql        26.09.2026
--
-- ACHTUNG: gehört in die TRADING-Datenbank (dort, wo `trades` liegt).
--
-- Eine Spalte, damit der Gewinn auch in Prozent erfasst werden kann. Der
-- Betrag wird dann aus dem Kontostand VOR dem Trade gerechnet
-- (lib/trading/konto-verlauf.ts) und nicht gespeichert — sonst stünde nach
-- der Korrektur eines älteren Trades ein Betrag da, der nicht mehr zum
-- Kontostand passt.
--
-- `risk_percent` gibt es bereits; sie wird ab jetzt genauso verwendet.
--
-- Idempotent. Bis die Migration läuft, funktioniert alles wie vorher, nur
-- ohne die Prozent-Eingabe beim Gewinn.
-- ============================================================================

alter table trades
  add column if not exists profit_percent numeric;
