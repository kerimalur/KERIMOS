# kerimos:// Protokoll-Handler

Lässt Ordner-Kacheln in KerimOS den Windows-Explorer direkt öffnen,
statt nur den Pfad zu kopieren.

## Installation (einmalig, kein Admin nötig)

1. Doppelklick auf `kerimos-handler.reg` → Nachfrage mit **Ja** bestätigen.
2. Fertig. Im Browser beim ersten Klick auf eine Ordner-Kachel einmal
   "KerimOS Protokoll öffnen" erlauben (Häkchen "immer erlauben" setzen).

## Wie es funktioniert

- Klick auf eine Ordner-Kachel ruft `kerimos://open?path=C:\...` auf.
- Windows startet darauf `kerimos-open.ps1`, das den Pfad dekodiert, prüft
  ob er existiert, und den Explorer öffnet.
- Der Pfad landet weiterhin in der Zwischenablage — auf Geräten ohne
  Handler (z.B. Handy) funktioniert die Kachel also wie bisher.

## Deinstallation

`reg delete "HKCU\Software\Classes\kerimos" /f`

**Hinweis:** Wird der Kompass-Ordner verschoben, muss der Pfad zur
`.ps1` in `kerimos-handler.reg` angepasst und die Datei neu ausgeführt werden.
