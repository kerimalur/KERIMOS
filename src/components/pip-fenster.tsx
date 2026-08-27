"use client";
import {
  createContext, useCallback, useContext, useEffect, useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Ein Stück der Seite in ein schwebendes Fenster auslagern.
 *
 * Gebaut für den Backtest: das Eingabefeld soll über dem TradingView-Chart
 * liegen, nicht daneben. Ein zweites Browserfenster reicht dafür nicht — das
 * verschwindet hinter dem Chart, sobald man ihn anklickt. Diese Fenster hier
 * hält das Betriebssystem über allem anderen.
 *
 * Technisch: Document Picture-in-Picture. Kein Video, kein Screenshot,
 * sondern echtes DOM — die Eingabe funktioniert dort mit Tastatur,
 * Serveraufrufen und allem, was sie in der Seite auch kann, weil sie im
 * selben JavaScript-Kontext bleibt.
 *
 * Zwei Grenzen, die man kennen muss:
 *
 * 1. **Nur Chromium** (Chrome, Edge, Brave, Opera ab Version 116) und nur am
 *    Desktop. In Firefox und Safari fehlt die Schnittstelle; dort erscheint
 *    der Knopf gar nicht erst.
 * 2. **Beim Öffnen und Schliessen beginnt die Eingabe von vorn.** React baut
 *    den Teilbaum im neuen Dokument neu auf; ein halb ausgefüllter Trade ist
 *    dann weg. Also erst das Fenster öffnen, dann erfassen.
 */

interface PipOptionen {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface PipApi {
  requestWindow(optionen?: PipOptionen): Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window { documentPictureInPicture?: PipApi }
}

/**
 * Das Dokument, in dem der Teilbaum gerade hängt.
 *
 * Wichtig für alles, was Tastatur abhört oder `document.activeElement` liest:
 * im Schwebefenster ist das globale `document` das der Hauptseite und damit
 * das falsche. Komponenten, die darauf angewiesen sind, holen es hier.
 */
const DokumentKontext = createContext<Document | null>(null);

export function useFensterDokument(): Document | null {
  const aus = useContext(DokumentKontext);
  if (aus) return aus;
  return typeof document === "undefined" ? null : document;
}

/**
 * Stylesheets ins neue Fenster kopieren.
 *
 * Ein PiP-Fenster startet als leeres Dokument — ohne das hier stünde die
 * Eingabe dort als unformatierte HTML-Liste. Gleiche Herkunft heisst, die
 * Regeln lassen sich auslesen und als <style> einsetzen; nur bei fremden
 * Stylesheets (CDN) fällt es auf einen <link> zurück.
 */
function uebernehmeStile(w: Window) {
  const quelle = document;
  w.document.documentElement.className = quelle.documentElement.className;
  w.document.body.className = quelle.body.className;

  for (const bogen of Array.from(quelle.styleSheets)) {
    try {
      const css = Array.from(bogen.cssRules).map((r) => r.cssText).join("\n");
      const s = w.document.createElement("style");
      s.textContent = css;
      w.document.head.appendChild(s);
    } catch {
      if (!bogen.href) continue;
      const l = w.document.createElement("link");
      l.rel = "stylesheet";
      l.href = bogen.href;
      if (bogen.media?.mediaText) l.media = bogen.media.mediaText;
      w.document.head.appendChild(l);
    }
  }

  // Das Fenster ist klein; der Seitenrahmen der App gehört hier nicht hin.
  w.document.body.style.margin = "0";
  w.document.body.style.minHeight = "auto";
  w.document.body.style.overflowX = "hidden";
}

export function PipFenster({
  titel, breite = 480, hoehe = 640, knopfText = "Schwebefenster", children,
}: {
  titel: string;
  breite?: number;
  hoehe?: number;
  knopfText?: string;
  children: React.ReactNode;
}) {
  const [pip, setPip] = useState<Window | null>(null);
  const [moeglich, setMoeglich] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Erst nach dem Mounten prüfen, sonst weicht der Server-HTML vom Client ab.
  useEffect(() => {
    setMoeglich(typeof window !== "undefined" && "documentPictureInPicture" in window);
  }, []);

  const oeffne = useCallback(async () => {
    const api = window.documentPictureInPicture;
    if (!api) return;
    setFehler(null);
    try {
      const w = await api.requestWindow({ width: breite, height: hoehe });
      uebernehmeStile(w);
      w.document.title = titel;
      w.addEventListener("pagehide", () => setPip(null), { once: true });
      setPip(w);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das Fenster liess sich nicht öffnen.");
    }
  }, [breite, hoehe, titel]);

  // Wird die Seite verlassen oder gewechselt, soll kein Fenster übrig bleiben.
  useEffect(() => () => { try { pip?.close(); } catch { /* schon zu */ } }, [pip]);

  if (pip) {
    return (
      <>
        <div className="rounded-xl border border-dashed border-line bg-sand/40 px-4 py-10 text-center">
          <p className="text-sm text-ink-soft">Die Eingabe läuft im Schwebefenster.</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-faint">
            Schieb es über deinen Chart — es bleibt über allen anderen Fenstern liegen.
          </p>
          <button type="button" onClick={() => { try { pip.close(); } catch { /* egal */ } }}
            className="mt-3 rounded-xl border border-line bg-field px-3 py-1.5 text-xs
                       text-ink-muted transition hover:border-line-strong hover:text-ink">
            zurück in die Seite holen
          </button>
        </div>
        {createPortal(
          <DokumentKontext.Provider value={pip.document}>
            <div className="kt-content px-4 py-4">{children}</div>
          </DokumentKontext.Provider>,
          pip.document.body,
        )}
      </>
    );
  }

  return (
    <>
      {moeglich && (
        <div className="mb-3 flex items-center gap-2">
          <button type="button" onClick={oeffne}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-field
                       px-2.5 py-1.5 text-xs text-ink-muted transition duration-150 ease-tactile
                       hover:border-line-strong hover:text-ink active:scale-[0.97]">
            <span aria-hidden className="text-[13px] leading-none">⧉</span>
            {knopfText}
          </button>
          <span className="text-[11px] text-ink-faint">
            schwebt über TradingView — bleibt oben, auch wenn du im Chart klickst
          </span>
        </div>
      )}
      {fehler && <p className="mb-2 text-xs text-bad">{fehler}</p>}
      {children}
    </>
  );
}
