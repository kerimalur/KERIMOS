-- ============================================================================
-- 30_makro_reihen_stand.sql        26.09.2026
--
-- Projekt „Kompass". Die jüngsten ZWEI Werte je Währung und Feld — genau
-- das, was die Übersicht braucht (Stand + Vorwert für den Trendpfeil).
--
-- Warum eine View: `makro_reihen` hält seit diesem Tag bis zu 60 Werte je
-- Reihe (für die Verlaufsseite je Währung), zusammen einige tausend Zeilen.
-- Supabase liefert pro Abfrage höchstens 1000 — die Übersicht hätte bei
-- alten Reihen (Frühindikator CHF von 2022) schlicht nichts mehr gesehen.
-- ============================================================================
create or replace view makro_reihen_stand with (security_invoker = on) as
select ccy, feld, datum, wert, serie
from (
  select ccy, feld, datum, wert, serie,
         row_number() over (partition by ccy, feld order by datum desc) as rn
  from makro_reihen
) x
where rn <= 2;
grant select on makro_reihen_stand to authenticated;
