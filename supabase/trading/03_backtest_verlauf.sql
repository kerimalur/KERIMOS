-- ============================================================================
-- backtest-verlauf.sql        27.08.2026
--
-- ACHTUNG: gehört in die TRADING-Datenbank (dort, wo `backtest_trades`,
-- `trades` und `cot_reports` liegen) — nicht in KerimOS und nicht ins
-- Gym-Projekt.
--
-- Zwei Spalten für die eine Frage, die das Journal bisher nicht stellen
-- konnte: WIE KNAPP war es?
--
--   gegenlauf   Nur bei gewonnenen Trades sinnvoll: wie weit lief der Kurs
--               gegen die Position, bevor er ins Ziel drehte. Beantwortet
--               „hätte ein engerer Stop diesen Gewinn gekostet" — und damit
--               als Einziges die Frage, ob der Stopabstand richtig sitzt.
--               Bei einem Stopout ist die Antwort definitionsgemäss 1 R,
--               deshalb steht dort NULL.
--
--   vorlauf     Nur bei Stopouts und Breakeven sinnvoll: wie weit lief der
--               Kurs für die Position, bevor er drehte. Beantwortet „war ein
--               Teil-TP drin" — ein Stop, der vorher über 1 R im Plus stand,
--               ist ein Ausstiegsproblem und kein Einstiegsproblem, und das
--               sieht man an keiner anderen Zahl im Journal.
--
-- Bewusst Klassen statt Zahlen. Ein exakter MAE/MFE-Wert bräuchte Entry-,
-- Stop- und Zielpreis; Kerim backtestet ohne Preise, nur mit RR. Vier Klassen
-- sind ein Klick im Formular und tragen den grössten Teil der Aussage — eine
-- erfundene Nachkommastelle wäre schlechter als eine ehrliche Spanne.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos.
--
-- Bis die Migration läuft, fallen Lesen und Schreiben auf den alten
-- Spaltensatz zurück (siehe lib/supabase/backtest.ts und lib/backtest-
-- actions.ts). Das Backtest-Journal bleibt also benutzbar, nur ohne diese
-- zwei Angaben.
-- ============================================================================

alter table backtest_trades
  add column if not exists gegenlauf text,
  add column if not exists vorlauf   text;

-- Die erlaubten Werte stehen in der Datenbank und nicht nur im TypeScript:
-- ein Tippfehler in einer künftigen Migration soll auffallen, nicht still
-- eine fünfte Klasse anlegen, die keine Auswertung kennt.
alter table backtest_trades
  drop constraint if exists backtest_trades_gegenlauf_check;
alter table backtest_trades
  add constraint backtest_trades_gegenlauf_check
  check (gegenlauf is null or gegenlauf in ('bis_025', 'bis_05', 'bis_075', 'knapp'));

alter table backtest_trades
  drop constraint if exists backtest_trades_vorlauf_check;
alter table backtest_trades
  add constraint backtest_trades_vorlauf_check
  check (vorlauf is null or vorlauf in ('kein', 'bis_05', 'bis_1', 'ueber_1'));

comment on column backtest_trades.gegenlauf is
  'Maximale Gegenbewegung vor dem Ziel, als Klasse. Nur bei Gewinnern gesetzt.';
comment on column backtest_trades.vorlauf is
  'Maximale Bewegung zugunsten der Position vor dem Stop, als Klasse. Nur bei Stopout/Breakeven gesetzt.';
