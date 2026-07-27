# Datenbank

Die Migrationen sind im Supabase-Projekt `fhgrjqvunxbfhujoxmcn` angewandt:

| Migration | Inhalt |
|---|---|
| `01_foundation_and_money` | Profile, Konten, Kategorien, Transaktionen, Fixkosten, Import-Regeln |
| `02_time_goals_scenarios` | Aktivitäten, Zeiterfassung, Ziele, Szenarien, Wochen-Review |
| `03_rls_views_functions`  | RLS-Policies, Views, `runway_inputs()` |
| `04_security_hardening`   | `search_path` fixiert, Signup-Trigger nicht über REST aufrufbar |
| `05_time_buckets_and_gaps` | Lebensbereiche, unerfasste Zeit, Wochen-Views, Stundenwert-Matrix |

Lokal materialisieren:

```bash
npx supabase link --project-ref fhgrjqvunxbfhujoxmcn
npx supabase db pull
```
