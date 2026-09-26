-- ============================================================================
-- 29_makro_fruehindikator_hand.sql        26.09.2026
--
-- Projekt „Kompass". Der Frühindikator steht im Formular der Währungsseite,
-- fehlte aber in der Liste erlaubter Felder — eine Eingabe von Hand wäre am
-- Check gescheitert. Nötig vor allem für CHF und NZD, für die die OECD
-- keinen CLI mehr veröffentlicht.
-- ============================================================================
alter table makro_werte drop constraint if exists makro_werte_feld_check;
alter table makro_werte add constraint makro_werte_feld_check check (feld in (
  'fruehindikator','pmi_industrie','pmi_dienste','bip_yoy','arbeitslos',
  'handelsbilanz','rendite_10j','anleihe_nachfrage','staatsschulden'
));
