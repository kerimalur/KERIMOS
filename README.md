# KerimOS

Startpunkt für alles: eine Startseite, von der aus du deine Bereiche,
Werkzeuge und Ordner erreichst — plus die Bereiche, die vollständig hier
laufen: Trading, Gym, Essen und die Gewohnheiten.

Die Startseite beantwortet drei Fragen und sonst nichts: Was ist heute anders
(ein Satz, das Wetter). Was ist heute schon getan (die Gewohnheiten, die
aktiven Trades). Wo arbeitest du jetzt (die Modi als Kacheln). Steht nichts
an, ist die Seite fast leer. Das ist das Ziel, kein Mangel.

**Stand (09.09.2026):** Der Zeit-Bereich ist entfallen — Termine, Aufgaben,
Tages- und Wochenrückblick, Wochenziele, Schichten, Zen und die drei
Erinnerungs-Endpunkte dazu. Das Gym ist auf Haken, Verlauf und Garmin-Import
zusammengestrichen. Neu ist der Habit-Tracker unter `/gewohnheiten`.

---

## Was drin ist

| Bereich | Funktion |
|---|---|
| **Startseite** | Tagessatz mit Wetter, Suche über alle Kacheln, Gewohnheiten, aktive Trades, Modi-Kacheln mit ihren Kennzahlen |
| **Gewohnheiten** | Ein Haken pro Tag je Gewohnheit, Zählung nach Woche / 30 Tagen / gesamt, Serie, Raster über vier Wochen zum Nachtragen |
| **Trading** | Übersicht (aktive Trades), Cockpit, Confluence-Ranking, Journal, Backtest, Alarme |
| **Gym** | War ich da (Haken), Verlauf der Einheiten, Garmin-Import samt Prüfschritt, Körpergewicht |
| **Essen** | Plan, Rezepte, Lebensmittel, Einkauf, Meal Prep, Nährwerte |
| **Kacheln** | `/links` — was auf der Startseite und in den Modi steht |

---

## Einrichtung

```bash
npm install
cp .env.local.example .env.local   # Werte sind bereits eingetragen
npm run dev
```

Läuft auf http://localhost:3000.

### Einmalig im Supabase-Dashboard

Projekt **Kompass** (`fhgrjqvunxbfhujoxmcn`), Authentication → Sign In /
Providers:

- **Confirm email** ausschalten, wenn du dich ohne Bestätigungsmail anmelden
  willst. Für eine App, die nur du nutzt, ist das der bequemere Weg.

Danach auf `/login` ein Konto anlegen und die Migrationen unter
`supabase/migrations/` im SQL-Editor ausführen — zuletzt `19_habits.sql`,
sonst bleibt `/gewohnheiten` leer und zeigt stattdessen das nötige SQL an.

### Deployment auf Vercel

Das Repository liegt unter <https://github.com/kerimalur/KERIMOS> und ist auf
vercel.com importiert. Unter **Settings → Environment Variables** stehen die
Werte aus `.env.local`:

| Name | Wofür |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Hauptdatenbank (Kompass) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dieselbe, öffentlicher Schlüssel |
| `GYM_SUPABASE_URL` | Gym-Projekt, eigene Datenbank |
| `GYM_SUPABASE_SERVICE_ROLE_KEY` | dessen `service_role`-Schlüssel |

Die beiden `NEXT_PUBLIC_`-Werte sind öffentlich — der Schutz kommt aus Row
Level Security, nicht aus der Geheimhaltung des Keys. Die beiden Gym-Werte
tragen bewusst kein `NEXT_PUBLIC_`: der `service_role`-Schlüssel umgeht
sämtliche Zugriffsregeln und darf den Browser nie erreichen.

`.env.local` steht in `.gitignore` und landet nicht im Repository.

---

## Die Gewohnheiten

Der Tracker kennt zwei Dinge: eine Gewohnheit und die Tage, an denen sie getan
wurde. Eine Zeile in `habit_entries` heisst „an diesem Tag getan" — es gibt
kein `done`-Flag, der fehlende Eintrag ist das Nein. Sonst hätte jeder Tag
seit Beginn eine Zeile, und die Zählung müsste zwischen „nicht getan" und
„nie gefragt" unterscheiden.

Alles, was angezeigt wird — Serie, Wochenzahl, Gesamtzahl — ist aus diesen
Tagen gerechnet und nirgends gespeichert. Es gibt also keinen zweiten Stand,
der veralten könnte.

Abgehakt wird dort, wo man ohnehin hinschaut: auf der Startseite und im
Gym-Bereich. `/gewohnheiten` ist für den Verlauf und die Verwaltung da. Im
Raster lässt sich ein vergangener Tag nachtragen — man merkt am Mittwoch, dass
Montag fehlt, und ohne diesen Weg stimmt die Zahl ab da nie wieder.

`bereich` entscheidet, wo eine Gewohnheit steht: `gym` im Gym-Bereich, alles
andere auf der Startseite.

---

## Das Gym

Erfasst wird auf der Uhr. Der Garmin-Import holt die Einheiten ab, ein
Prüfschritt (`/gym/garmin`) ordnet die Übungen zu, und danach stehen sie mit
Sätzen und Gewichten im Verlauf (`/gym/verlauf`). Der Haken auf der Übersicht
zählt daneben nur, wie oft du da warst — er ersetzt nicht, was die Uhr
aufzeichnet.

Muskelbalance, Fortschritt je Übung, Trainingstage, Kalenderplanung und das
manuelle Erfassen sind am 09.09.2026 entfallen. Sie setzten alle eine Eingabe
voraus, die seit der Uhr niemand mehr macht, und die Zahlen daraus haben nie
eine Entscheidung verändert. Die Daten in der Gym-Datenbank bleiben
unangetastet.

---

## Datenmodell

**Gewohnheiten** — `habits`, `habit_entries` (siehe
`supabase/migrations/19_habits.sql`)

**Navigator** — `links` (Bereich, Webadresse oder lokaler Pfad) mit
Nutzungszähler über `register_link_open()`

**Gym** (eigenes Supabase-Projekt) — `training_days`, `exercises`,
`workout_sessions`, `exercise_logs`, `cardio_logs`, `body_weight_entries`,
`garmin_import_sessions`, `garmin_daily`

**Essen** (eigenes Projekt) — Rezepte, Plan, Lebensmittel, Einkaufsliste

**Trading** — Watchlist, Kategorien, Alarme, Journal, Backtest; Details in
`supabase/trading/` und `TRADING-UMBAU.md`

Aus dem Geld-Bereich stehen `accounts`, `transactions` und die zugehörigen
Views noch in der Datenbank. Der Bereich ist seit dem 21.08.2026
ausgeblendet (`MODE_AUS` in `src/lib/modes.ts`); gelöscht wurde nichts.
Dasselbe gilt seit dem 09.09.2026 für die Tabellen des Zeit-Bereichs.

Alle Tabellen haben Row Level Security; jede Zeile gehört genau einem
`auth.users`-Eintrag. Views laufen mit `security_invoker`, erben also die
Policies der zugrunde liegenden Tabellen. Die Gym-Datenbank hat eine eigene
Anmeldung — dort greift KerimOS serverseitig mit dem `service_role`-Schlüssel
zu, weil ein KerimOS-Nutzer dort nicht existiert.

---

## Projektstruktur

```
src/
  app/
    page.tsx              Startseite
    gewohnheiten/         Habit-Tracker: Verlauf und Verwaltung
    gym/                  Übersicht, verlauf/, garmin/
    trading/              Übersicht, cockpit/, ranking/, journal/, backtest/, …
    m/[gruppe]/           Arbeitsplatz eines Modus
    m/Essen/              Plan, Rezepte, Lebensmittel, Einkauf, Prep
    links/  login/  auth/signout/  zuruecksetzen/
    api/gva-alarm/        Alarme auf die GVA-Linien (Vercel-Cron)
  components/
    gewohnheiten-karte.tsx    Die Haken — Startseite und Gym
    gewohnheiten-raster.tsx   Vier Wochen als klickbares Raster
    klapp-karte.tsx           Karte zum Zuklappen, Zustand im localStorage
    gva-linien-karte.tsx      Aktive Trades auf der Startseite
    trading/  essen/  gym/    Bereichs-Bausteine
    ui.tsx                    Card, Button, Badge, Stat, Bar
  lib/
    gewohnheiten.ts           Laden und Zählen
    gewohnheiten-actions.ts   Abhaken, anlegen, ändern, archivieren
    actions.ts                Server Actions (Essen, Gym-Verlauf, Kacheln)
    supabase/                 Browser-, Server-, Gym-, Menu- und Trading-Client
tools/checks/                 Kontrollskripte, mit reinem Node ausführbar
```

Die Dateien unter `lib/` sind, wo es geht, frei von Framework- und
DB-Abhängigkeiten — dann sind sie über `npm run check:*` prüfbar.

---

## Warum lokale Ordner nur kopiert werden

Browser blockieren `file://`-Links aus einer http- oder https-Seite heraus.
Das ist keine Einstellung, sondern fest eingebaut — ein Klick auf so einen Link
tut schlicht nichts. Deshalb legt KerimOS den Pfad in die Zwischenablage:
Win+E öffnet den Explorer, Strg+V in die Adresszeile, Enter.

Wer das ohne Zwischenschritt will, braucht einen eigenen Protokoll-Handler
(einmaliger Registry-Eintrag plus kleines Skript) oder einen lokal laufenden
Helfer. Beides ist nachrüstbar, ohne dass sich am Datenmodell etwas ändert —
nur die Behandlung von `kind = 'folder'` in `src/components/launcher.tsx`.
