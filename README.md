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
Erinnerungs-Endpunkte dazu. Das Gym ist auf Eintragen, Verlauf und
Garmin-Import zusammengestrichen. Neu ist der Habit-Tracker unter
`/gewohnheiten` — mit Varianten, Datumsabfrage und Monatsverlauf. Die
Startseite führt mit ihm auf; die Karte „Diese Woche" ist weg, ihre
Backtest-Zahl hängt jetzt als gezählte Zeile unten an den Gewohnheiten und
die Schrittzahl ganz, weil Kerim sie ohnehin erreicht.

---

## Was drin ist

| Bereich | Funktion |
|---|---|
| **Startseite** | Gewohnheiten zuoberst (samt automatisch gezählter Backtest-Zeile), darunter Tagessatz mit Wetter, Suche, aktive Trades, Modi-Kacheln |
| **Gewohnheiten** | Eintragen je Gewohnheit — mit Varianten (Push / Pull / Ausdauer) und Datum, Zählung nach Woche / 30 Tagen / gesamt, Serie, Monatsraster zum Nachtragen |
| **Trading** | Übersicht (aktive Trades), Cockpit, Confluence-Ranking, Journal, Backtest, Alarme |
| **Gym** | Was war (Push / Pull / Ausdauer eintragen, auch nachträglich), Verlauf der Einheiten, Garmin-Import samt Prüfschritt, Körpergewicht |
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
`supabase/migrations/` der Reihe nach im SQL-Editor ausführen — zuletzt
`19_habits.sql` und `20_habits_varianten.sql`. Fehlt eine davon, bleibt
`/gewohnheiten` leer und zeigt stattdessen das nötige SQL an.

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

Alles, was angezeigt wird — Serie, Wochenzahl, Aufteilung nach Variante — ist
daraus gerechnet und nirgends gespeichert. Es gibt also keinen zweiten Stand,
der veralten könnte. Die Rechnung liegt DB-frei in
`src/lib/gewohnheiten-zaehlung.ts` und hängt an `npm run check:gewohnheiten`.

Eingetragen wird dort, wo man ohnehin hinschaut: auf der Startseite und im
Gym-Bereich. `/gewohnheiten` ist für den Verlauf und die Verwaltung da — dort
blättert man mit ‹ und › beliebig weit durch die Monate zurück.

### Vier Eigenschaften je Gewohnheit

**`bereich`** entscheidet, wo sie steht: `gym` im Gym-Bereich, alles andere auf
der Startseite.

**`varianten`** unterteilen sie — beim Gym Push, Pull, Ausdauer. Eine
Gewohnheit statt drei, damit die Zählung zusammenbleibt („viermal diese
Woche") und die Aufteilung trotzdem sichtbar ist („2× Push · 1× Ausdauer").
Mehrere Varianten am selben Tag sind erlaubt: Kraft am Morgen und Ausdauer am
Abend sind zwei Einheiten.

**`mit_datum`** heisst: beim Eintragen fragt erst ein Dialog nach dem Tag. Ein
Training hakt man nicht ab, während man es macht — man trägt es abends nach,
manchmal übermorgen. Wer jeden Eintrag still auf heute bucht, hat nach zwei
Wochen eine Zahl, der er nicht mehr glaubt. Ohne `mit_datum` genügt ein Druck
und der Tag ist heute.

**`ziel_pro_woche`** ist optional. Ohne Ziel wird nur gezählt — ein Ziel zu
erfinden, damit die Anzeige vollständig aussieht, macht aus einer Beobachtung
eine Bewertung.

### Serie und Wochenzahl zählen Verschiedenes

Die **Serie** zählt Tage: wer morgens Kraft und abends Ausdauer macht, hat
einen Tag hinter sich, keine zwei. Sie fällt nicht auf null, nur weil heute
noch nichts steht — erst ein ausgelassenes Gestern beendet sie, sonst stünde
sie bis zum Abend jeden Tag auf null.

Die **Wochenzahl** zählt Einheiten: derselbe Tag mit Kraft und Ausdauer ist
zweimal. „Viermal diese Woche" meint viermal trainiert.

---

## Das Gym

Erfasst wird auf der Uhr. Der Garmin-Import holt die Einheiten ab, ein
Prüfschritt (`/gym/garmin`) ordnet die Übungen zu, und danach stehen sie mit
Sätzen und Gewichten im Verlauf (`/gym/verlauf`). Der Eintrag auf der
Übersicht zählt daneben nur, wie oft du da warst und was es war — Push, Pull
oder Ausdauer. Er ersetzt nicht, was die Uhr aufzeichnet, und vergangene
Einheiten trägt man dort über den Tag nach, auch Wochen später.

Muskelbalance, Fortschritt je Übung, Trainingstage, Kalenderplanung und das
manuelle Erfassen sind am 09.09.2026 entfallen. Sie setzten alle eine Eingabe
voraus, die seit der Uhr niemand mehr macht, und die Zahlen daraus haben nie
eine Entscheidung verändert. Die Daten in der Gym-Datenbank bleiben
unangetastet.

---

## Datenmodell

**Gewohnheiten** — `habits` (mit `varianten`, `mit_datum`, `ziel_pro_woche`)
und `habit_entries` (ein Tag, optional eine Variante). Siehe
`supabase/migrations/19_habits.sql` und `20_habits_varianten.sql`. Eindeutig
ist Tag + Variante, nicht der Tag allein — sonst liesse sich Kraft und
Ausdauer am selben Tag nicht beides eintragen.

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
    gewohnheiten-karte.tsx    Die Zeilen — Startseite und Gym
    gewohnheiten-dialog.tsx   „Wann war das?" — Tag und Variante wählen
    gewohnheiten-raster.tsx   Ein Monat als klickbares Raster, mit Blättern
    klapp-karte.tsx           Karte zum Zuklappen, Zustand im localStorage
    gva-linien-karte.tsx      Aktive Trades auf der Startseite
    trading/  essen/  gym/    Bereichs-Bausteine
    ui.tsx                    Card, Button, Badge, Stat, Bar
  lib/
    gewohnheiten.ts           Laden und Zusammensetzen
    gewohnheiten-zaehlung.ts  Serie, Wochenzahl, Monatsraster (DB-frei)
    gewohnheiten-actions.ts   Eintragen, anlegen, ändern, archivieren
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
