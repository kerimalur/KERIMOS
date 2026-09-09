# Datenbank

Die Migrationen sind im Supabase-Projekt `fhgrjqvunxbfhujoxmcn` angewandt:

| Migration | Inhalt |
|---|---|
| `01_foundation_and_money` | Profile, Konten, Kategorien, Transaktionen, Fixkosten, Import-Regeln |
| `02_time_goals_scenarios` | Aktivitäten, Zeiterfassung, Ziele, Szenarien, Wochen-Review |
| `03_rls_views_functions`  | RLS-Policies, Views, `runway_inputs()` |
| `04_security_hardening`   | `search_path` fixiert, Signup-Trigger nicht über REST aufrufbar |
| `05_time_buckets_and_gaps` | Lebensbereiche, unerfasste Zeit, Wochen-Views, Stundenwert-Matrix |
| `06_shifts` | Schichten mit Blöcken und Arbeitsweg — **liegt als Datei unter `migrations/`** |
| … | die Dateien 06–18 unter `migrations/`, jede einmalig im SQL-Editor |
| `19_habits` | Gewohnheiten und ihre eingetragenen Tage — Grundlage von `/gewohnheiten` |
| `20_habits_varianten` | Varianten (Push/Pull/Ausdauer), Datumsabfrage, mehrere Einheiten pro Tag |
| `21_planung` | Projekte, Aufgaben und die Oberflächen-Einstellungen |

`06_shifts.sql` ist die erste Migration, die auch im Repository liegt; ab dort
gilt: Datei im SQL-Editor des Projekts `fhgrjqvunxbfhujoxmcn` ausführen.

**Ohne Wirkung, aber bewusst stehengelassen:** Die Migrationen 02, 05, 06, 07,
10 und 17 gehören zum Zeit-Bereich (Aktivitäten, Zeiterfassung, Ziele,
Schichten, Termine, Aufgaben, Tagesrückblick), der am 09.09.2026 aus der App
entfernt wurde. Ihre Tabellen bleiben in der Datenbank: gelöscht wäre
unumkehrbar, und die Zeilen kosten nichts. Neue Migrationen dürfen sich nur
nicht mehr darauf beziehen.

## Migration in einem anderen Projekt

| Migration | Projekt | Inhalt |
|---|---|---|
| `09_gym_settings` | **Gym** (`kvpexrorkqmxnzqvexga`) | Wochenziel — seit dem 09.09.2026 ohne Wirkung |
| `15_garmin_import_vorschau` | **Gym** | Prüfschritt für importierte Einheiten |

`09_gym_settings.sql` gehört **nicht** ins Kompass-Projekt. Das Wochenziel
zählte Kraft- und Ausdauereinheiten pro Woche; diese Auswertung ist entfallen,
wie oft Kerim da war zählt jetzt der Habit-Tracker. Die Tabelle bleibt stehen,
gelesen wird sie nicht mehr.

## Gym-Modul

Seit dem 09.09.2026 besteht der Gym-Bereich in KerimOS aus drei Dingen: dem
Haken „war ich da" (der im Habit-Tracker liegt, nicht hier), dem Verlauf der
Einheiten und dem Garmin-Import samt Prüfschritt. Planung, Satz-Erfassung von
Hand, Muskelbalance und Fortschritt je Übung sind aus der App entfernt —
erfasst wird auf der Uhr.

Die Tabellen bleiben unverändert, wo sie sind: `training_days`, `exercises`,
`workout_sessions`, `exercise_logs`, `cardio_logs`, `recovery_status`. Gelesen
werden davon noch die Einheiten samt Sätzen (Verlauf), die Übungen (für die
Garmin-Zuordnung), `body_weight_entries` und `garmin_daily`. KerimOS
greift serverseitig mit dem `service_role`-Schlüssel darauf zu, weil die
Gym-Datenbank eine eigene Anmeldung hat, in der ein KerimOS-Nutzer nicht
existiert. Der Besitzer neuer Zeilen kommt aus `GYM_USER_ID`, ersatzweise aus
der ersten vorhandenen Zeile.

Die Migrationen 01–05 existieren bislang nur in Supabase. Sie hierher zu holen
ist der einzige Weg, das Schema reproduzierbar und gesichert zu haben:

```bash
npx supabase link --project-ref fhgrjqvunxbfhujoxmcn
npx supabase db pull      # legt supabase/migrations/<zeitstempel>_remote_schema.sql an
```

Das Ergebnis committen. Ohne diesen Schritt bedeutet ein verlorenes
Supabase-Projekt den Totalverlust der Struktur — die Daten selbst sichert das
ebenfalls nicht, dafür braucht es einen Dump.
