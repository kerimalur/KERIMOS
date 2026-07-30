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

`06_shifts.sql` ist die erste Migration, die auch im Repository liegt. Sie
einmalig im SQL-Editor des Projekts `fhgrjqvunxbfhujoxmcn` ausführen; danach
funktioniert `/schichten`.

## Migration in einem anderen Projekt

| Migration | Projekt | Inhalt |
|---|---|---|
| `09_gym_settings` | **Gym** (`kvpexrorkqmxnzqvexga`) | Wochenziel, damit `/gym/einstellungen` speichern kann |

`09_gym_settings.sql` gehört **nicht** ins Kompass-Projekt. Das Wochenziel lag
bisher nur im localStorage der Gym-App und war damit an ein Gerät gebunden —
KerimOS konnte es weder lesen noch setzen. Bis die Migration läuft, zeigt
KerimOS den Standardwert 4 an; Speichern schlägt fehl.

## Gym-Modul

Der komplette Gym-Bereich läuft seit Juli 2026 in KerimOS — Trainingstage,
Planung, das laufende Training samt Satz-Erfassung, Verlauf, Muskelbalance
und Fortschritt je Übung. Die alte Gym-App (`Gymapp-vereinfacht/`) wird nicht
mehr gebraucht.

Die Tabellen bleiben unverändert, wo sie sind: `training_days`, `exercises`,
`workout_sessions`, `exercise_logs`, `cardio_logs`, `recovery_status`. KerimOS
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
