-- ============================================================================
-- 05_journal_und_hit_meldung.sql        22.09.2026
--
-- ACHTUNG: gehört in die TRADING-Datenbank (dort, wo `trades`, `signals`,
-- `trading_watchlist` und `alarm_log` liegen) — nicht in KerimOS und nicht
-- ins Gym-Projekt. Ausführen im SQL-Editor dieses Projekts.
--
-- Drei Dinge:
--
--   signal_meldungen            Welche GVA-Hits schon als Push gemeldet
--                               wurden. Ohne diese Tabelle würde jeder
--                               Cron-Lauf (alle 5 Minuten) denselben Hit neu
--                               melden. Solange sie fehlt, schickt der Cron
--                               für Hits bewusst NICHTS — lieber still als
--                               eine Flut.
--
--   trades.journal_fragen       Antworten auf die Journal-Fragen (Plan,
--                               Einstieg, Ausstieg, Zustand, Verlauf …) plus
--                               das Learning als Freitext. JSON, weil sich die
--                               Fragen noch ändern werden.
--
--   trades.fundamental_snapshot Die Fundamentallage (Ranking, COT, Saison),
--                               eingefroren zum Zeitpunkt des Trades, damit das
--                               Journal sie nicht jedes Mal neu rechnet — und
--                               damit sie nicht plötzlich die Lage von heute
--                               zeigt.
--
-- Idempotent: mehrfaches Ausführen ist folgenlos. Bis die Migration läuft,
-- fallen Journal und Cron auf den alten Stand zurück; nichts geht kaputt.
-- ============================================================================

create table if not exists signal_meldungen (
  signal_id   text primary key,
  gemeldet_at timestamptz not null default now()
);

alter table trades
  add column if not exists journal_fragen       jsonb,
  add column if not exists fundamental_snapshot jsonb;
