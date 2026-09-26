"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OECD_SETS, oecdUrl, oecdZuordnung, weltbankZuordnung, type OecdSet } from "@/lib/makro/katalog";
import { parseOecdCsv } from "@/lib/makro/perioden";
import { makroAusBrowser } from "@/lib/makro-actions";

/**
 * Holt OECD- und Weltbank-Reihen im Browser und gibt sie dem Server zum Speichern.
 *
 * IMF und Weltbank blocken das Vercel-Rechenzentrum, nicht aber den Browser
 * (siehe makroAusBrowser); die OECD tat es zeitweise auch. Läuft von selbst, sobald die Seite offen ist — höchstens
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
    setText("Hole OECD- und Weltbank-Daten im Browser …");
    try {
      const abJahr = new Date().getUTCFullYear() - 5;
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

      // Weltbank: je Indikator EINE Abfrage für alle Länder. Jährlich, nur
      // Messwerte — die Weltbank führt keine Prognosen.
      const wb = new Map<string, Map<string, { datum: string; wert: number }[]>>();
      const indikatoren = [...new Set(weltbankZuordnung().map((z) => z.indikator))];
      await Promise.all(indikatoren.map(async (ind) => {
        try {
          const laender = [...new Set(weltbankZuordnung().filter((z) => z.indikator === ind).map((z) => z.land))];
          const bis = new Date().getUTCFullYear();
          const r = await fetch(`https://api.worldbank.org/v2/country/${laender.join(";")}/indicator/${ind}`
            + `?format=json&per_page=500&date=${bis - 10}:${bis}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = await r.json() as [unknown, { countryiso3code: string; date: string; value: number | null }[] | null];
          const je = new Map<string, { datum: string; wert: number }[]>();
          for (const x of j?.[1] ?? []) {
            if (x.value === null) continue;
            const l = je.get(x.countryiso3code) ?? [];
            l.push({ datum: `${x.date}-01-01`, wert: Number(x.value) });
            je.set(x.countryiso3code, l);
          }
          for (const [k, v] of je) je.set(k, v.sort((a, b) => a.datum.localeCompare(b.datum)));
          wb.set(ind, je);
        } catch (e) {
          fehler.push(`Weltbank ${ind}: ${e instanceof Error ? e.message : "?"}`);
        }
      }));

      const wbReihen = weltbankZuordnung().map((z) => ({
        ccy: z.ccy, feld: z.feld,
        serie: `Weltbank · ${z.indikator} · ${z.land}`,
        werte: wb.get(z.indikator)?.get(z.land) ?? [],
      }));

      const reihen = oecdZuordnung()
        .map((z) => ({
          ccy: z.ccy, feld: z.feld,
          serie: `${OECD_SETS[z.set].name} · ${z.land}`,
          werte: daten.get(z.set)?.get(z.land) ?? [],
        }))
        .concat(wbReihen)
        .filter((r) => r.werte.length > 0);

      const antwort = await makroAusBrowser(reihen);
      if ("fehler" in antwort) {
        setText(`Speichern fehlgeschlagen: ${antwort.fehler}`);
      } else {
        try { localStorage.setItem(SCHLUESSEL, String(Date.now())); } catch { /* egal */ }
        setText(`Im Browser: ${reihen.length} Reihen geholt, ${antwort.gespeichert} davon neuer als der Stand`
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
        {laeuft ? "lädt …" : "OECD- und Weltbank-Daten jetzt im Browser holen"}
      </button>
      {text && <span>{text}</span>}
    </div>
  );
}
