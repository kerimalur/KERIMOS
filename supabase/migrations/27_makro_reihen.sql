-- 27_makro_reihen.sql — die automatisch geholten Makro-Reihen (26.09.2026)
--
-- Kerims Ansage: „ich möchte eine software bei der ich nichts manuell
-- importieren muss". Vier der acht Zahlen aus `makro_werte` gibt es bei FRED
-- kostenlos mit Schlüssel — OECD-Frühindikator (als Teilersatz für den PMI,
-- den es nirgends gratis als Schnittstelle gibt), BIP zum Vorjahr,
-- Arbeitslosenquote und die 10-Jahres-Rendite. Die holt `/api/makro-sync`
-- und legt sie hier ab.
--
-- Warum eine EIGENE Tabelle und nicht `makro_werte`:
--   1. Hier liegt die ganze Reihe, nicht nur „Wert und Vorwert". Damit lässt
--      sich später ein Verlauf zeichnen, ohne die Quelle zu wechseln.
--   2. Getrennte Tabellen heissen getrennte Hoheit. `laden.ts` liest ZUERST
--      hier und DANACH `makro_werte` — eine Zahl, die Kerim von Hand
--      eingetragen hat, gewinnt damit immer. Die OECD-Reihen hinken zwei bis
--      sechs Wochen hinterher, und wer den frischen Wert kennt, soll ihn
--      setzen können, ohne dass der nächste Cron-Lauf ihn überschreibt.
--   3. Kein user_id. Der Frühindikator der USA ist für alle derselbe, und
--      der Cron läuft mit dem Service-Role-Schlüssel ohne Sitzung — eine
--      Zeile pro Benutzer wäre dieselbe Zahl mehrfach und RLS über eine
--      Spalte, die der Schreiber nicht kennt.

create table if not exists makro_reihen (
  ccy       text not null,
  feld      text not null,
  datum     date not null,
  wert      numeric not null,
  -- Welche FRED-Serie den Wert geliefert hat. Steht in der Anzeige als
  -- Quelle und sagt beim Nachschauen sofort, wo man nachschlägt.
  serie     text not null,
  geholt_am timestamptz not null default now(),
  primary key (ccy, feld, datum)
);

create index if not exists idx_makro_reihen_feld
  on makro_reihen(ccy, feld, datum desc);

alter table makro_reihen enable row level security;

-- Lesen für jeden angemeldeten Benutzer, Schreiben nur über den
-- Service-Role-Schlüssel (der RLS ohnehin umgeht). Kein `for all`: die
-- Reihen sollen aus genau einer Quelle kommen, sonst weiss nach dem ersten
-- Handeingriff niemand mehr, welcher Wert woher stammt — dafür gibt es
-- `makro_werte`.
drop policy if exists lesen_makro_reihen on makro_reihen;
create policy lesen_makro_reihen on makro_reihen for select
  using (auth.role() = 'authenticated');

-- Eine einzige Zeile mit dem Bericht des letzten Laufs. Ohne sie sieht ein
-- leeres Feld auf der Währungen-Seite gleich aus, egal ob die Reihe fehlt
-- oder der Cron nie gelaufen ist — und genau das war beim COT-Import schon
-- einmal ein halber Tag Suche.
create table if not exists makro_sync (
  id       int primary key default 1 check (id = 1),
  gelaufen timestamptz,
  bericht  jsonb
);

alter table makro_sync enable row level security;
drop policy if exists lesen_makro_sync on makro_sync;
create policy lesen_makro_sync on makro_sync for select
  using (auth.role() = 'authenticated');
