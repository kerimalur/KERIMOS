"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OECD_SETS, oecdUrl, oecdZuordnung, type OecdSet } from "@/lib/makro/katalog";
import { parseOecdCsv } from "@/lib/makro/perioden";
import { makroAusBrowser } from "@/lib/makro-actions";

/**
 * Holt die OECD-Reihen im Browser und gibt sie dem Server zum Speichern.
 *
 * Die OECD blockt das Vercel-Rechenzentrum, nicht aber den Browser (siehe
 * makroAusBrowser). Läuft von selbst, sobald die Seite offen ist — höchstens
 * alle 12 Stunden, gemerkt im localStorage — und auf Knopfdruck jederzeit.
 * Drei Abfragen (eine je Dataset), weit unter dem Limit der OECD.
 */

const SCHLUESSEL = "makro-oecd-browser";
const PAUSE_MS = 12 * 3600_000;

export function BrowserNachladen() {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const gestartet = useRef(false);

  const laden = useCallback(async () => {
    setLaeuft(true);
    setText("Hole OECD-Daten im Browser …");
    try {
      const abJahr = new Date().getUTCFullYear() - 3;
      const sets = [...new Set(oecdZuordnung().map((z) => z.set))] as OecdSet[];
      const daten = new Map<OecdSet, Map<string, { datum: string; wert: number }[]>>();
      const fehler: string[] = [];

      await Promise.all(sets.map(async (s) => {
        try {
          const r = await fetch(oecdUrl(s, abJahr));
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          daten.set(s, parseOecdCsv(await r.text()));
        } catch (e) {
          fehler.push(`${OECD_SETS[s].name}: ${e instanceof Error ? e.message : "?"}`);
        }
      }));

      const reihen = oecdZuordnung()
        .map((z) => ({
          ccy: z.ccy, feld: z.feld,
          serie: `${OECD_SETS[z.set].name} · ${z.land}`,
          werte: daten.get(z.set)?.get(z.land) ?? [],
        }))
        .filter((r) => r.werte.length > 0);

      const antwort = await makroAusBrowser(reihen);
      if ("fehler" in antwort) {
        setText(`Speichern fehlgeschlagen: ${antwort.fehler}`);
      } else {
        try { localStorage.setItem(SCHLUESSEL, String(Date.now())); } catch { /* egal */ }
        setText(`OECD im Browser: ${reihen.length} Reihen geholt, ${antwort.gespeichert} davon neuer als der Stand`
          + (fehler.length ? ` · Probleme: ${fehler.join(" · ")}` : ""));
        if (antwort.gespeichert > 0) router.refresh();
      }
    } catch (e) {
      setText(`Fehlgeschlagen: ${e instanceof Error ? e.message : "unbekannt"}`);
    } finally {
      setLaeuft(false);
    }
  }, [router]);

  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    let zuletzt = 0;
    try { zuletzt = Number(localStorage.getItem(SCHLUESSEL) ?? 0); } catch { /* privat */ }
    if (Date.now() - zuletzt > PAUSE_MS) void laden();
  }, [laden]);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
      <button type="button" onClick={() => void laden()} disabled={laeuft}
        className="rounded-lg border border-line bg-sand px-2 py-1 text-ink-soft transition
                   hover:text-ink disabled:opacity-50">
        {laeuft ? "lädt …" : "OECD-Daten jetzt im Browser holen"}
      </button>
      {text && <span>{text}</span>}
    </div>
  );
}
