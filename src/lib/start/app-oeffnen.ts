/**
 * Eine lokal installierte Anwendung über ihr Protokoll öffnen
 * (tradingview://, obsidian://).
 *
 * Ob die App wirklich da ist, kann eine Webseite nicht abfragen — es gibt
 * keine Schnittstelle dafür, und das ist Absicht. Also: Protokoll aufrufen
 * und schauen, ob der Browser den Fokus verliert. Bleibt die Seite nach
 * 1.2 Sekunden im Vordergrund, war nichts da, und `ersatz` (die
 * Webfassung) öffnet in einem neuen Tab. Ohne `ersatz` passiert dann nichts.
 *
 * Läuft unabhängig vom Bauteil, das es aufruft: die Backtest-Kachel
 * navigiert gleich danach weiter, und die Prüfung muss das überleben.
 */
export function appOeffnen(ziel: string, ersatz?: string, fertig?: () => void) {
  let weg = false;
  const merken = () => { if (document.hidden || !document.hasFocus()) weg = true; };
  document.addEventListener("visibilitychange", merken);
  window.addEventListener("blur", merken);

  window.location.href = ziel;

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", merken);
    window.removeEventListener("blur", merken);
    if (!weg && !document.hidden && ersatz) {
      window.open(ersatz, "_blank", "noopener,noreferrer");
    }
    fertig?.();
  }, 1200);
}
