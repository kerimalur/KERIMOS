# Prompt für Claude Design — KerimOS Redesign

> Alles ab hier kopieren und einfügen.

---

Entwirf drei **eigenständige Design-Varianten** für KerimOS, mein persönliches
Cockpit. Ich nutze es täglich, meist am Handy, oft einhändig und zwischendurch.
Das aktuelle Design funktioniert, ist aber langweilig: flache Karten, kaum
Hierarchie, keine Bewegung, alles sieht gleich wichtig aus.

## Was die App ist

Ein Single-User-Cockpit, kein Produkt für Kunden. Next.js (App Router) mit
Tailwind, überwiegend Server Components. Sechs Bereiche:

| Bereich | Inhalt |
|---|---|
| **Heute / Navigator** | Startseite, Einstieg in alles andere |
| **Geld** | Konten, Buchungen, Runway, Analyse, Fixkosten, Kategorien |
| **Zeit** | Kalender, Wochenauswertung, Ziele, Rückblick, Fokus, Schichten |
| **Gym** | Workout, Übungen, Verlauf, Fortschritt, Muskelbalance, Trainingstage |
| **Essen** | Tagesplan, Meal Prep, Einkaufsliste, Rezepte, Lebensmittel |
| **Trading** | GVA-Board, Backtest-Fortschritt, Wirtschaftskalender |

Die Seiten sind **datendicht**: viele Zahlen, Prozentwerte, kleine Badges,
Listenzeilen, Fortschrittsanzeigen. Das muss lesbar bleiben — Schönheit darf
die Ablesbarkeit nicht kosten.

## Was heute da ist

Warme Papier-Optik, nichts ist reines Weiss oder Schwarz:

```
paper #FAF8F3   card #FFFDF9   sand #F1EDE2
line  #E8E3D8   line-strong #D8D0C0
ink   #3A362E / soft #5C5648 / muted #8A8478 / faint #ABA294
accent #5B8C7B / soft #4A7566 / tint #E6EFEA
good #4E8A6E   warn #A87C3C   bad #A65F52   (+ zugehörige tints)
```

Systemschrift, `font-variant-numeric: tabular-nums` für alle Zahlen.
Bausteine: `Card`, `CardTitle`, `Stat`, `Badge`, `Empty`, `Input`, `Select`,
`Button`, `Label`.

**Die Palette ist nicht gesetzt.** Jede Variante soll eine eigene mitbringen.

## Was ich will

Drei Varianten, die sich **wirklich unterscheiden** — nicht dieselbe Idee in
drei Farben. Als Ausgangspunkt, gerne geschärft oder ersetzt:

1. **Editorial** — wie ein gut gesetztes Magazin. Grosse Typo, harte Hierarchie,
   viel Luft, Zahlen als Schlagzeile. Ruhig, aber nie fad.
2. **Instrument** — dunkles Messgerät. Präzise, technisch, Monospace-Zahlen,
   leuchtende Akzente, Diagramme im Vordergrund. Cockpit im Wortsinn.
3. **Tactile** — hell, geschichtet, weiche Tiefe. Karten, die sich anfassbar
   anfühlen, Farbe als Orientierung, verspielte Mikro-Interaktionen.

Jede Variante braucht **Bewegung und Spezialeffekte**, aber mit Sinn:
gestaffelte Einblendungen, hochzählende Zahlen, animierte Fortschrittsbögen,
Übergänge zwischen Zuständen, Hover- und Tap-Feedback, lebendige Diagramme.
Effekte sollen etwas erklären — Veränderung, Richtung, Wichtigkeit — nicht
dekorieren.

## Grenzen

- **Strukturiert, nicht chaotisch.** Ein klares Raster, konsequente Abstände,
  vorhersehbare Anordnung. Ich muss die App blind bedienen können.
- **Handy zuerst.** Einhändig, Daumenreichweite. Eingabefelder mindestens 16 px,
  sonst zoomt iOS Safari beim Antippen.
- **Kontrast ernst nehmen.** Badges und Kleintext müssen auch auf farbigen
  Flächen lesbar sein — daran ist das aktuelle Design schon gescheitert.
- **`prefers-reduced-motion` respektieren.** Ohne Ausnahme.
- **Kein Layout-Sprung.** Animationen nur auf `transform` und `opacity`.
- Animationen bevorzugt in reinem CSS. Wo eine Bibliothek nötig ist, benenne
  sie und sag dazu, welche Komponenten dadurch clientseitig werden.

## Was ich zurückbekommen will

Pro Variante:

1. **Name und ein Satz Haltung** — wofür steht sie, wann trägt sie.
2. **Palette** mit Hex-Werten und Rolle je Farbe, inklusive Zuständen
   (gut / Warnung / schlecht) und der Zuordnung zu den heutigen Tokens.
3. **Typografie** — Schriften, Grössenskala, Zahlenbehandlung.
4. **Form** — Radien, Abstandsskala, Ebenen und Schatten, Rasterregeln.
5. **Komponenten** — `Card`, `Stat`, `Badge`, `Button`, `Input`, Listenzeile,
   Navigation. Jeweils alle Zustände.
6. **Bewegungskonzept** — was wann wie animiert, mit Dauer und Kurve, plus
   der Rückfall bei reduzierter Bewegung.
7. **Ein vollständiger Screen** als Mockup: die Gym-Startseite mit
   Wochenziel, Muskelbalance, Gewichtsverlauf und Trainingskalender.
   Datendicht — daran zeigt sich, ob die Variante trägt.
8. **Tailwind-Config-Ausschnitt** mit den Farb- und Fonttokens.

Am Schluss eine kurze Gegenüberstellung: Wofür taugt welche Variante, wo
liegen die Schwächen, und welche würdest du für ein Werkzeug empfehlen, das
täglich mehrfach für wenige Sekunden geöffnet wird.

Sag mir bei jeder Variante ehrlich, was sie kostet — an Umbauarbeit, an
Ladezeit, an Komplexität.
