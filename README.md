# KerimOS

Zwei Bereiche: **Trading** und **Essen**. Die Startseite besteht aus zwei
Kacheln, und das ist die ganze Navigation.

---

## Der Radikalschnitt vom 09.09.2026

KerimOS war zuletzt ein Dashboard aus Gewohnheiten, Aufgaben, Kalender,
Projekten, Gym, Garmin-Import und einer Einstellungsseite mit fünf Reitern.
Alles davon ist an einem Tag entfernt worden — auf Kerims ausdrückliche
Entscheidung und im Wissen, dass es radikal ist.

Der Grund ist nicht, dass etwas davon schlecht gebaut war. Es war, dass eine
App, die alles kann, jeden Morgen eine Entscheidung verlangt, wo man hinsieht
— und die beiden Bereiche, die tatsächlich täglich benutzt werden, dabei
untergingen.

**Nichts ist verloren.** Der vollständige Stand steht unter dem Tag
`vollstand-2026-09-09` und im Branch `backup/vollstand-2026-09-09`, dazu
liegt ein Bundle mit der kompletten Historie unter
`~/kerimos-vollstand-2026-09-09.bundle`.

```bash
# Ansehen, wie es war
git checkout vollstand-2026-09-09

# Eine einzelne Datei zurückholen
git checkout vollstand-2026-09-09 -- src/lib/gewohnheiten.ts

# Aus dem Bundle wiederherstellen, falls das Repository je verloren geht
git clone ~/kerimos-vollstand-2026-09-09.bundle wiederhergestellt
```

**Die Datenbank ist unangetastet.** Kein `DROP TABLE`, keine gelöschte Zeile.
`habits`, `habit_entries`, `planung_*`, `user_settings` und alle Tabellen des
früheren Zeit- und Geld-Moduls stehen weiterhin in Supabase. Wer eines der
Module zurückholt, findet seine Daten vor.

Entfernt wurden: der Gym-Bereich samt Garmin-Import und dessen Cron-Job, der
Habit-Tracker, die Planung (Projekte, Aufgaben, Meilensteine, Kalender), die
Einstellungsseite, der Navigator mit seinen Modi und der Kachelverwaltung, das
Zurücksetzen, sowie auf der Startseite Tagessatz, Wetter, Suche, Kennzahlen
und die Karte der aktiven Trades.

---

## Was drin ist

| Bereich | Funktion |
|---|---|
| **Startseite** | Zwei Kacheln. Sonst nichts. |
| **Trading** | Übersicht (aktive Trades), Cockpit, Confluence-Ranking, Journal, Backtest, Einstellungen mit Alarmen |
| **Essen** | Plan, Rezepte, Lebensmittel, Einkauf, Kochen, Nährwerte |

---

## Einrichtung

```bash
npm install
cp .env.local.example .env.local   # Werte sind bereits eingetragen
npm run dev
```

Läuft auf http://localhost:3000.

### Eine Falle bei den Umgebungsvariablen

**`GYM_SUPABASE_URL` und `GYM_SUPABASE_SERVICE_ROLE_KEY` versorgen den
Essens-Bereich**, nicht das Gym — das gibt es nicht mehr. Die Menü-Tabellen
liegen im selben Supabase-Projekt wie die frühere Gym-App, und
`lib/supabase/menu.ts` fällt ohne eigene `MENU_`-Werte auf sie zurück.

Der Name ist irreführend und bleibt trotzdem: umbenennen hiesse, ihn
gleichzeitig in `menu.ts`, `.env.local`, `.env.local.example` und den
Vercel-Einstellungen zu ändern — für einen schöneren Namen das Risiko, dass
der Essensplan ausfällt, sobald eine Stelle vergessen geht.

| Name | Wofür |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Hauptdatenbank (Kompass) — Anmeldung, Kachelbilder |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dieselbe, öffentlicher Schlüssel |
| `GYM_SUPABASE_URL` | **Essen** — Menüplan, Rezepte, Einkauf |
| `GYM_SUPABASE_SERVICE_ROLE_KEY` | dessen `service_role`-Schlüssel |
| `TRADING_SUPABASE_URL` | Trading — Watchlist, Journal, Backtest |
| `TRADING_SUPABASE_SERVICE_ROLE_KEY` | dessen `service_role`-Schlüssel |
| `GVA_API_URL` | Screener-Backend für Live-Preise und GVA-Erkennung |

Die beiden `NEXT_PUBLIC_`-Werte sind öffentlich — der Schutz kommt aus Row
Level Security. Alle anderen tragen bewusst kein `NEXT_PUBLIC_`: ein
`service_role`-Schlüssel umgeht sämtliche Zugriffsregeln und darf den Browser
nie erreichen. Die Zugangsmodule tragen deshalb `import "server-only"` — ein
versehentlicher Client-Import lässt den Build abbrechen, statt den Schlüssel
auszuliefern.

`.env.local` steht in `.gitignore` und landet nicht im Repository.

---

## Die Startseite

Zwei Kacheln, fest im Code. Bei zwei Stück wäre eine Verwaltungsseite mit
Gruppen, Reihenfolge und Symbolen mehr Maschinerie als Inhalt.

Die **Bilder** kommen weiterhin aus der `links`-Tabelle — das ist alles, was
von ihr noch gebraucht wird. Kerim hat sie selbst gesetzt, und sie sind das
Einzige, was diese Seite ansehnlich macht. Fehlt eine Zeile oder ein Bild,
greift die Farbe darunter. Ändern lässt sich ein Bild nur noch direkt in der
Datenbank:

```sql
update links set image_url = '…' where target = '/trading';
```

---

## Trading

Unverändert. Übersicht mit den aktiven Trades, Cockpit mit dem
28-Paare-Raster, Confluence-Ranking samt Monty, Journal, Backtest und die
Einstellungen mit Alarmen und Kategorien.

`/api/gva-alarm` prüft die selbst gezeichneten GVA-Linien gegen die
Live-Preise des Screeners und schickt Push- bzw. Telegram-Meldungen. Der
Endpunkt schützt sich über `CRON_SECRET` und ist in `middleware.ts` von der
Anmelde-Weiterleitung ausgenommen — sonst bekäme der Aufruf HTML statt JSON
und der Alarm feuerte lautlos nie.

**Das Screener-Backend muss bestehen bleiben.** Zwei Cron-Läufe dort füllen
täglich Zinsen, Inflation, COT und die Kurse für das Risiko-Regime; das
Render-Backend liefert GVA-Erkennung und Live-Preise. Ohne sie friert dieser
Bereich still auf dem letzten Stand ein.

Die Rechenlogik hängt an Prüfskripten — `npm run check:` und dann etwa
`auswertung`, `verlauf`, `cot`, `kalibrierung`, `konfluenzen`, `duplikat`.

---

## Essen

Unverändert. Wochenplan, Rezepte mit Zutaten, Lebensmittel mit Nährwerten,
Einkaufsliste, Kochliste und die Nährwertringe.

```bash
npm run check:meal-swap      # Tausch von Mahlzeiten, Trainingstage
npm run check:essen-bonus    # Bonus-Kalorien nach Aktivität
npm run check:naehrwerte     # Rechnung je Portion
```

---

## Projektstruktur

```
src/
  app/
    page.tsx              Zwei Kacheln
    trading/              Übersicht, cockpit/, ranking/, journal/, backtest/,
                          alarme/, einstellungen/
    m/Essen/              Plan, Rezepte, Lebensmittel, Einkauf, Kochen
    login/  auth/signout/
    api/gva-alarm/        Alarme auf die GVA-Linien
  components/
    trading/  confluence/  alarm/    Trading-Bausteine
    essen/                           Essen-Bausteine
    nav.tsx                          Kopfzeile, nur im Trading-Bereich
    ui.tsx                           Card, Button, Badge, Stat, Bar
  lib/
    trading/  confluence/  alarm/    Trading-Logik
    supabase/                        Server-, Menu- und Trading-Client
    actions.ts                       Server Actions des Essens-Bereichs
tools/checks/                        Kontrollskripte, mit reinem Node ausführbar
```

---

## Warum lokale Ordner nur kopiert werden

Browser blockieren `file://`-Links aus einer http- oder https-Seite heraus.
Das ist keine Einstellung, sondern fest eingebaut — ein Klick auf so einen
Link tut schlicht nichts.

Der Launcher, der Pfade in die Zwischenablage legte, ist mit dem Navigator
entfallen. Der Hinweis bleibt hier stehen, falls die Kacheln je zurückkommen:
die Behandlung von `kind = 'folder'` steht im Tag `vollstand-2026-09-09` in
`src/components/launcher.tsx`.
