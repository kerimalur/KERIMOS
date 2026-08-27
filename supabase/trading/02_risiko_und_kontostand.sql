-- ============================================================================
-- risiko-und-kontostand.sql        27.08.2026
--
-- ACHTUNG: gehört in die TRADING-Datenbank (dort, wo `trades`,
-- `trading_watchlist` und `cot_reports` liegen) — nicht in KerimOS und nicht
-- ins Gym-Projekt.
--
-- Zwei Spalten, beide für dieselbe Frage: was hat der Trade wirklich riskiert?
--
--   risk_amount      Was das Setup verloren hätte, wären alle Stops getroffen
--                    worden — in Kontowährung. Die MT5-Brücke rechnet das seit
--                    jeher aus Stopabstand mal Punktwert und hat es bisher
--                    weggeworfen. Daraus folgt das R: Gewinn geteilt durch
--                    Risiko. NULL heisst „nicht messbar" (kein Stop gesetzt)
--                    und ist ehrlicher als eine geschätzte Zahl.
--
--   account_balance  Kontostand, als der Trade geschrieben wurde. Damit lässt
--                    sich das Ergebnis in Prozent vom Konto ausdrücken — die
--                    Zahl, die über die Zeit vergleichbar bleibt. „Prozent vom
--                    Risiko" wäre dagegen nur R mal hundert, also dieselbe
--                    Zahl anders geschrieben.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos.
--
-- Bis die Migration läuft, fällt `fetchTrades` auf den alten Spaltensatz
-- zurück (siehe lib/trading/journal.ts). Das Journal bleibt also benutzbar,
-- nur ohne diese zwei Zahlen.
-- ============================================================================

alter table trades
  add column if not exists risk_amount numeric;

alter table trades
  add column if not exists account_balance numeric;

comment on column trades.risk_amount is
  'Risiko in Kontowaehrung. NULL = nicht messbar (kein Stop gesehen).';
comment on column trades.account_balance is
  'Kontostand beim Schreiben des Trades. Basis fuer den Prozentwert.';
