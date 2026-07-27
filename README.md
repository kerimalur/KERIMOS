# KerimOS

Startpunkt für alles: ein Navigator, von dem aus du deine Projekte,
Werkzeuge und Ordner erreichst — plus zwei eigene Bereiche für Geld und Zeit.

Die Startseite ist ein durchsuchbares Kachelraster. Tippen filtert, Enter
öffnet, Pfeiltasten wählen. Interne Bereiche springen direkt, Webadressen
öffnen in einem neuen Tab, lokale Ordner landen als Pfad in der Zwischenablage
— mehr darf ein Browser dort nicht.

**Stand:** Geld-Modul, Runway-Simulator und Zeit-Modul mit Wochen-Auswertung
sind gebaut. Die Ziel-Ampel ist im Datenmodell angelegt.

---

## Was drin ist

| Bereich | Funktion |
|---|---|
| **Cockpit** | Runway ohne Einkommen, Liquidität, Monatssaldo, Cashflow-Chart, letzte Buchungen |
| **Runway** | Szenario-Simulator mit Reglern für Pensum, Ausgaben und Einmalkosten + Vermögensverlauf |
| **Transaktionen** | Erfassen, kategorisieren, löschen — Kategorie direkt in der Liste änderbar |
| **Konten** | Mehrere Konten, Runway-Zugehörigkeit pro Konto, Saldo-Korrektur per Stichtag |
| **Fixkosten** | Wiederkehrende Posten in fünf Rhythmen, automatisch auf Monatswerte umgerechnet |
| **Kategorien** | Fix vs. variabel, Monatsbudget, Farbe |
| **Import** | CSV-Bankauszug mit Spalten-Zuordnung, Dublettenschutz, Auto-Kategorisierung per Regeln |
| **Zeit** | Tages-Check-in in ~30 Sekunden, 24-Stunden-Balken, unerfasste Zeit als eigene Kennzahl |
| **Woche** | Verteilung nach Lebensbereich, Vergleich zur Vorwoche, grösste Posten, Stundenwert-Matrix |
| **Aktivitäten** | Zuordnung zu Lebensbereich, Stundenlohn, Ziel-Flag, Schlaf-Kennzeichen |
| **Navigator** | Startseite als Kachelraster mit Suche, Tastatursteuerung und „zuletzt benutzt“ |

---

## Einrichtung

```bash
npm install
cp .env.local.example .env.local   # Werte sind bereits eingetragen
npm run dev
```

Läuft auf http://localhost:3000.

### Einmalig im Supabase-Dashboard

Projekt **Kompass** (`fhgrjqvunxbfhujoxmcn`), Authentication → Sign In / Providers:

- **Confirm email** ausschalten, wenn du dich ohne Bestätigungsmail anmelden willst.
  Für eine App, die nur du nutzt, ist das der bequemere Weg.

Danach auf `/login` ein Konto anlegen. Beim ersten Start fragt KerimOS nach
zwei Zahlen (Liquidität und Fixkosten) und legt Konto, Kategorien und
Fixkostenposten selbst an.

### Deployment auf Vercel

Damit der Navigator seinen Zweck erfüllt, muss er erreichbar sein, ohne dass
du vorher etwas startest. Einmalig:

```bash
cd "C:\\Projekte\\Claude Cowork\\KerimOS"
git init
git add .
git commit -m "KerimOS: Navigator, Geld- und Zeit-Modul"
git remote add origin https://github.com/kerimalur/KERIMOS.git
git push -u origin main
```

Das Repository liegt unter <https://github.com/kerimalur/KERIMOS>.

Danach auf vercel.com das Repository importieren. Unter **Settings →
Environment Variables** die beiden Werte aus `.env.local` eintragen:

| Name | Wert |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fhgrjqvunxbfhujoxmcn.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | siehe `.env.local` |

Beide sind öffentliche Schlüssel — der Schutz kommt aus Row Level Security,
nicht aus der Geheimhaltung des Keys. Sonst ist nichts nötig: kein
Build-Kommando, keine serverseitigen Secrets.

`.env.local` steht in `.gitignore` und landet nicht im Repository.

---

## Das Zeit-Modul

### Die Leitfrage

Nicht „wie viel habe ich gearbeitet", sondern **wo ist die Zeit geblieben, von der
ich es selbst nicht mehr weiss**. Deshalb rechnet KerimOS nicht von unten nach oben
(Summe der Einträge), sondern von oben nach unten:

```
Wachzeit    = 24 h − Schlaf (aus dem Check-in, sonst Profil-Standardwert)
Unerfasst   = Wachzeit − Summe der erfassten Blöcke
```

Die unerfasste Zeit ist eine eigene, sichtbare Kennzahl — im Tagesbalken als
graues Segment, in der Wochenansicht als eigener Posten neben den Lebensbereichen.
Sie schrumpft nur, wenn du sie zuordnest.

### Sieben Lebensbereiche

| Bereich | Bedeutung |
|---|---|
| **Ziele** | Zahlt auf deine Ziele ein: Trading, Coding, Lernen, Sport |
| **Arbeit** | Lohnarbeit |
| **Pflicht** | Muss sein, bringt aber nichts voran: Haushalt, Admin, Weg |
| **Regeneration** | Bewusste Erholung |
| **Soziales** | Zeit mit Menschen |
| **Spass** | Bewusst genossene Freizeit |
| **Leerlauf** | Verbrannt, ohne Gegenwert |

Der Unterschied zwischen *Spass* und *Leerlauf* ist der Punkt: eine Serie, die du
bewusst schaust, ist etwas anderes als eine Stunde, die dir das Handy genommen hat.

### Erfassen in 30 Sekunden

Auf `/zeit` wählst du oben eine Schrittweite (15 min bis 8 h) und klickst dann die
Aktivitäten an. Jeder Klick addiert, Rechtsklick zieht wieder ab. Mehrere Klicks auf
dieselbe Aktivität summieren sich in einem Eintrag — die Tagesliste bleibt kurz.

Schlafdauer und Energie trägst du im Check-in ein. Die Schlafdauer ist nicht Kosmetik:
sie bestimmt die Wachzeit und damit, wie gross die Lücke wirklich ist.

### Stundenwert-Matrix

Auf `/woche` steht, was eine Stunde je Aktivität eingebracht hat:

```
Ertrag           = Summe der Buchungen, die dieser Aktivität zugeordnet sind
CHF pro Stunde   = Ertrag ÷ erfasste Stunden
Ansatz           = hinterlegter Stundenlohn (optional, für bezahlte Tätigkeiten)
```

Buchungen ordnest du auf `/transaktionen` über das Aktivitäts-Feld zu — Lohn zum
Koch-Job, realisierte Gewinne zum Trading. Bei Projekten steht am Anfang eine Null.
Das ist der Ausgangspunkt, nicht das Urteil.

---

## Wie der Runway gerechnet wird

```
Liquidität   = Summe aller Konten mit "im Runway berücksichtigen"
             − einmalige Zusatzkosten des Szenarios

Einkommen    = Ø Einnahmen der letzten 3 vollen Monate × Pensum-Faktor
Ausgaben     = Ø Ausgaben der letzten 3 vollen Monate + Ausgaben-Delta

Saldo        = Einkommen − Ausgaben
Runway       = Saldo ≥ 0  →  unbegrenzt
               Saldo < 0  →  Liquidität ÷ |Saldo|   (in Monaten)
```

**Solange noch keine Transaktionsdaten vorliegen**, greift KerimOS auf die
hinterlegten Fixkosten zurück, damit die Zahl vom ersten Tag an stimmt.
Das Cockpit weist ausdrücklich darauf hin, wenn das der Fall ist.

Die Fortschreibung ist bewusst linear — ohne Zinsen, ohne Teuerung, ohne
Rendite-Annahmen. Lieber eine konservative Zahl, der du glaubst, als eine
optimistische, der du nicht traust.

### Kontostände

Jedes Konto hat eine **Basis** (Betrag + Stichtag). Der Saldo ist
`Basis + alle Transaktionen nach dem Stichtag`. Über „Kontostand korrigieren"
setzt du eine neue Basis — praktisch, wenn du nicht jede Buchung erfasst:
einmal im Monat den echten Stand eintragen, und alles stimmt wieder.

---

## Datenmodell

Bereits angelegt, auch für die noch nicht gebauten Etappen:

**Geld** — `accounts`, `account_snapshots`, `categories`, `transactions`,
`recurring_items`, `import_rules`, `scenarios`

**Zeit** — `activities` (mit `bucket`, `hourly_rate`, `calendar_patterns`),
`time_entries` (mit optionaler `start_minute`), `day_checkins`

**Ziele** — `goals`, `goal_milestones`, `weekly_reviews`

**Navigator** — `links` (Bereich, Webadresse oder lokaler Pfad) mit
Nutzungszähler über `register_link_open()`

**Views** — `v_account_balances`, `v_monthly_cashflow`, `v_category_monthly`,
`v_daily_time` (Tag inkl. unerfasster Zeit), `v_weekly_buckets`,
`v_weekly_activities`, `v_activity_value` (Stundenwert-Matrix)

**Funktion** — `runway_inputs(months_lookback)`

Alle Tabellen haben Row Level Security; jede Zeile gehört genau einem
`auth.users`-Eintrag. Views laufen mit `security_invoker`, erben also die
Policies der zugrunde liegenden Tabellen.

Die Migrationen liegen im Supabase-Projekt. In den Repo holst du sie mit:

```bash
npx supabase link --project-ref fhgrjqvunxbfhujoxmcn
npx supabase db pull
```

---

## Was als Nächstes kommt

**Google-Calendar-Import**
Das Feld `activities.calendar_patterns` ist vorbereitet: Titel-Muster, über die
Kalendereinträge automatisch einer Aktivität zugeordnet werden. Nötig dafür ist ein
eigener Google-OAuth-Client.

**Ziel-Ampel**
`goals` und `goal_milestones` stehen in der DB. Jedes Ziel bekommt ein Zeit- und ein
Geldbudget mit Deadline und zeigt grün/gelb/rot, ob du im Plan bist.

**Wochen-Review am Sonntag**
`weekly_reviews` friert die Kennzahlen einer Woche ein, dazu drei Fragen: was lief,
was nicht, worauf nächste Woche. Damit wird der Verlauf über Monate lesbar.

---

## Projektstruktur

```
src/
  app/
    page.tsx              Cockpit
    zeit/                 Tages-Check-in
    woche/                Wochen-Auswertung + Stundenwert-Matrix
    runway/               Szenario-Simulator
    transaktionen/  konten/  fixkosten/  kategorien/  aktivitaeten/  import/
    login/  auth/signout/
  components/
    day-checkin.tsx       Schnellerfassung, Tagesbalken, Check-in
    day-bar.tsx           24-Stunden-Balken mit Legende
    runway-simulator.tsx  Regler, Presets, Verlaufschart
    csv-import.tsx        Datei, Spalten-Mapping, Vorschau
    week-nav.tsx  cashflow-chart.tsx  setup-wizard.tsx  nav.tsx  ui.tsx
  lib/
    runway.ts             Runway-Mathematik
    time.ts               Wochenlogik, Tageszerlegung, Lückenberechnung
    csv.ts                Parser für Schweizer Datums- und Betragsformate
    actions.ts            Server Actions
    money.ts  format.ts  types.ts
    supabase/             Browser-, Server- und Middleware-Client
```

`runway.ts`, `time.ts` und `csv.ts` sind absichtlich frei von Framework- und
DB-Abhängigkeiten — alle drei sind mit reinem Node testbar.


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
