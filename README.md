# KerimOS

Startpunkt für alles: ein Dashboard, von dem aus du deine Bereiche, Werkzeuge
und Ordner erreichst — plus die Bereiche, die vollständig hier laufen:
Trading, Gym, Essen, die Gewohnheiten und die Planung.

Die Startseite beantwortet vier Fragen und sonst nichts. Was ist heute anders
(ein Satz, das Wetter). Was will heute getan werden (die Gewohnheiten). Was
steht an (die Aufgaben von heute, überfällige, terminlose). Wo arbeitest du
jetzt (die Modi als Kacheln). Die Reihenfolge ist die Reihenfolge des Tages:
erst was man tut, dann was man erledigt, dann wo man hingeht.

Steht nichts an, ist die Seite fast leer. Das ist das Ziel, kein Mangel.

**Stand (09.09.2026):** Der alte Zeit-Bereich ist entfallen — Termine,
Tages- und Wochenrückblick, Wochenziele, Schichten, Zen und die drei
Erinnerungs-Endpunkte dazu. Das Gym ist auf Eintragen, Verlauf und
Garmin-Import zusammengestrichen. Dafür sind drei Dinge dazugekommen: der
Habit-Tracker unter `/gewohnheiten` (mit Varianten, Datumsabfrage und
Monatsverlauf), die Planung unter `/planung` (Projekte, Aufgaben, Kalender
mit Ziehen) und `/einstellungen` als einziger Ort für alles Einmalige.

---

## Was drin ist

| Bereich | Funktion |
|---|---|
| **Startseite** | Das Dashboard: Gewohnheiten, aktive Trades, dann die ganze Planung (Kalender, Aufgaben, Projekte), unten die Modi-Kacheln |
| **Planung** | Kalender oben, Aufgabenliste in der Mitte, Projekt-Kacheln unten — vollständig auf der Startseite, `/planung` zeigt dasselbe ohne Drumherum |
| **Einstellungen** | Ein Ort für alles Einmalige: Design, Planung, Gewohnheiten, Trading, Kacheln, Daten |
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
`19_habits.sql`, `20_habits_varianten.sql`, `21_planung.sql`,
`22_planung_kategorie.sql`, `23_planung_ansicht.sql` und
`24_meilensteine.sql`. Fehlt eine davon,
sagt die betroffene Karte das auf der Startseite und zeigt das nötige SQL zum
Kopieren.

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

Der Fortschritt steht als **sieben Wochenpunkte** neben jeder Zeile, Montag
bis Sonntag: gefüllt = getan, umrandet = heute, hohl = steht noch aus. „3 von
4" sagt nicht, WELCHE Tage fehlen — wer sieht, dass Montag und Dienstag leer
sind und Freitag noch aussteht, weiss, ob die Woche zu retten ist.

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

## Die Planung

Bildet nach, was vorher in Notion lief: zwei verknüpfte Tabellen, mehr nicht.
Ein **Projekt** hat einen Namen. Eine **Aufgabe** hat einen Namen, einen
Haken, optional ein Datum und optional ein Projekt.

Die Schmalheit ist der Punkt. Der Vorgänger im Zeit-Bereich hatte Priorität,
Lebensbereich, Unteraufgaben und Sortierung — und wurde genau deshalb nicht
gepflegt: jede Aufgabe kostete sechs Entscheidungen, von denen fünf niemanden
interessierten. Was hier fehlt, fehlt mit Absicht.

**Die Reihenfolge — Kalender, Aufgaben, Projekte — ist nicht verhandelt.**
Sie bildet das Notion-Dashboard ab, das dieser Bereich ersetzt: oben wann, in
der Mitte was, unten wozu. Bei einem Werkzeug, das man täglich aufmacht, ist
Wiedererkennung mehr wert als jede Verbesserung, die man erst lernen muss.

**Der Kalender steht standardmässig auf Woche**, sieben breite Spalten, in
denen ein Eintrag lesbar dasteht statt als Farbstreifen. Die Woche beantwortet
„was ist jetzt dran" — die Frage, mit der man morgens auf die Seite schaut.
Der Monat beantwortet „wann habe ich Zeit" und liegt hinter dem Umschalter
rechts in der Kopfzeile. Beides läuft über die Adresse (`?ansicht=`, `?von=`),
damit ein Zeitraum verlinkbar bleibt und der Zurück-Knopf tut, was er soll.

Er zeigt jeden Eintrag mit Datum an seinem Tag, mit Checkbox in der Kachel. Ziehen legt ihn auf einen anderen Tag — `due_date` wird sofort in
der Datenbank geschrieben, das ist keine Ansichtssache. In die gestrichelte
Ablage darunter gezogen verliert ein Eintrag seinen Termin, ohne gelöscht zu
werden; von dort zieht man ihn auch wieder auf einen Tag. Umgesetzt mit den
`draggable`-Ereignissen des Browsers, ohne Kalenderbibliothek.

**Habits sind Aufgaben.** `category` unterscheidet „Aufgabe" von „Habit" und
tut sonst nichts: dieselbe Tabelle, derselbe Kalender, dieselbe Checkbox,
dieselbe Liste — nur ein ↻ davor. Ein eigenes Modell hätte einen zweiten
Kalender, eine zweite Checkbox-Logik und eine zweite Liste bedeutet, für einen
Unterschied, der in Wahrheit ein Etikett ist.

Der Preis dieser Entscheidung, damit ihn niemand später neu entdeckt: ein
Habit als Task-Zeile kennt keine Serie, keine Wochenquote und keine Varianten.
Es ist ein Haken an einem Tag.

### Der Fortschritt eines Projekts misst Meilensteine

Nicht die Aufgaben. „5 von 8 Aufgaben erledigt" wäre eine Aussage über
Betriebsamkeit: wer während eines Umzugs zwanzig Kleinigkeiten einträgt, fällt
im Balken zurück, obwohl er vorangekommen ist. Und ein Projekt ohne Ende
(„Haushalt") hätte einen Balken, der nie voll wird und deshalb nichts sagt.

Ein **Meilenstein** ist eine selbst benannte Etappe (`planung_meilensteine`).
Wer keine setzt, bekommt keinen Balken — das ist die Vorgabe, kein fehlendes
Feature. Etappen lassen sich jederzeit nachtragen, abhaken, umbenennen und
löschen: ein Projekt ändert unterwegs seine Etappen, und ein Modell, das nur
beim Anlegen zuhört, wäre nach zwei Wochen falsch.

Anders als Aufgaben hängen Meilensteine per `ON DELETE CASCADE` am Projekt —
sie ergeben ohne es keinen Sinn. Eine Aufgabe dagegen ist auch ohne Projekt
noch Arbeit, die getan werden muss.

### Zwei Arten, dasselbe zu notieren

Genau deshalb steht der **Gewohnheiten-Tracker** unverändert daneben, und die
Wahl zwischen beiden ist eine echte:

| | Aufgabe mit Art „Habit" | Gewohnheit im Tracker |
|---|---|---|
| Was es ist | eine Zeile mit Haken an einem Tag | etwas, das man zählt |
| Hat ein Ende | ja, mit dem Haken | nein |
| Serie, Wochenziel | — | ja |
| Varianten (Push/Pull) | — | ja |
| Nachtragen | Datum ändern | Monatsraster |

**Beide stehen im selben Kalender**, damit ein Tag eine Ansicht hat: oben die
Aufgaben (was zu tun ist), darunter abgesetzt die Haken des Trackers (was
getan wurde). Ein Druck auf so einen Haken nimmt ihn wieder weg; eingetragen
wird oben in der Gewohnheiten-Karte, wo auch Variante und Nachtrag hingehören.
Unter `/einstellungen/planung` lässt sich beides einzeln abschalten.

**Ein gelöschtes Projekt reisst keine Arbeit mit.** Dafür sorgt
`ON DELETE SET NULL` im Schema, nicht der Anwendungscode: die Aufgaben bleiben
stehen und stehen danach ohne Projekt da.

**Auf der Startseite** steht der Bereich vollständig, nicht als Vorschau.
Eine zusammengefasste Karte mit „alle 12 ↗" stand dort vorher und war der
falsche Kompromiss: man sah, DASS etwas ansteht, und musste für jede Handlung
doch weiterklicken.

**Angelegt wird über das + in der Kopfzeile der jeweiligen Box**, nicht in
einer zweiten Karte daneben. Ein dauerhaft sichtbares Formular ist öfter im
Bild als der Inhalt, um den es geht — und zwar auch dann, wenn man gar nichts
anlegen will, also fast immer. Gibt es noch kein Projekt, steht statt einer
Leermeldung eine gestrichelte Kachel „Neues Projekt": sie sagt dasselbe und
ist zugleich der Weg.

Gewohnheiten mit Serie und Varianten legt man dagegen ausschliesslich unter
`/einstellungen/gewohnheiten` an — sie sind Einrichtung, keine Tageseingabe.

---

## Die Einstellungen

Seit dem 09.09.2026 gibt es genau einen Ort für alles, was man einmal
einrichtet — aufgeteilt nach Abschnitt: Design, Gewohnheiten, Trading,
Kacheln, Daten.

Die Regel dahinter: **Wird etwas täglich angefasst, steht es auf der Seite
seines Bereichs. Wird es einmal eingerichtet, steht es hier.** Vorher lagen
die Einstellungen dort, wo sie benutzt wurden — die Alarme als sechster
Reiter mitten im Trading-Arbeitsweg, die Gewohnheiten aufklappbar zwischen
ihren eigenen Zahlen. Das las sich beim Bauen logisch und war beim Suchen
unmöglich.

`/trading/einstellungen` leitet auf `/einstellungen/trading` um und bleibt als
Weiterleitung stehen: die Adresse steht in Lesezeichen und in der
installierten App.

**Design** ändert die Hausfarbe und schaltet den Farbnebel ab. Acht geprüfte
Töne statt eines freien Farbwählers — der Akzent trägt dunklen Text, und ein
zu dunkler Ton macht Knopfbeschriftungen unlesbar, was einem erst zwei Seiten
später auffällt. Technisch setzt das Layout CSS-Variablen am `<html>`, auf die
Tailwind für `accent` zeigt; damit zieht jede Klasse im Projekt nach, ohne
dass irgendwo eine Farbe doppelt gepflegt wird.

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

**Planung** — `planung_projects`, `planung_tasks` (mit `category`
„Aufgabe"/„Habit") und `planung_meilensteine`; siehe
`supabase/migrations/21_planung.sql` bis `24_meilensteine.sql`. Bewusst neue Namen: die alte `tasks`-Tabelle
gehörte zum Zeit-Bereich und trug dessen Ballast; sie steht unberührt daneben.

**Oberfläche** — `user_settings` (Hausfarbe, Farbnebel), eine Zeile je Nutzer

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
    gewohnheiten/         Habit-Tracker: der Verlauf, Monat für Monat
    planung/              Projekte, Aufgaben, Kalender
    einstellungen/        Design, planung/, gewohnheiten/, trading/
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
    planung-bereich.tsx       Kalender + Aufgaben + Projekte, an zwei Orten
    planung-aufgaben.tsx      Die Liste, offen und erledigt getrennt
    planung-neu.tsx           Das + in der Kopfzeile und sein Dialog
    planung-projekt.tsx       Projektkachel mit Etappen und Balken
    planung-kalender.tsx      Monatsraster mit Ziehen und Fallenlassen
    einrichtung-hinweis.tsx   „Migration fehlt" statt stillem Ausblenden
    gva-linien-karte.tsx      Aktive Trades auf der Startseite
    trading/  essen/  gym/    Bereichs-Bausteine
    ui.tsx                    Card, Button, Badge, Stat, Bar
  lib/
    gewohnheiten.ts           Laden und Zusammensetzen
    gewohnheiten-zaehlung.ts  Serie, Wochenzahl, Monatsraster (DB-frei)
    gewohnheiten-actions.ts   Eintragen, anlegen, ändern, archivieren
    planung.ts                Projekte und Aufgaben laden
    oberflaeche-actions.ts    Design und Kalenderansicht speichern
    planung-kalender.ts       Monatsraster und Dringlichkeit (DB-frei)
    planung-typen.ts          Formen und Kategorien (DB-frei, für Clients)
    planung-actions.ts        Anlegen, abhaken, verschieben, löschen
    oberflaeche.ts            Hausfarbe als CSS-Variablen
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
