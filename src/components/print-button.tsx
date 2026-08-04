"use client";
import { Button } from "@/components/ui";

/**
 * Druckt die Seite - und damit auch "Als PDF speichern".
 *
 * Bewusst kein PDF-Generator im Code: Jeder Browser bringt den Weg über
 * den Druckdialog mit, auf dem Handy heisst er Teilen → Drucken → Als PDF.
 * Eine eigene Bibliothek wäre ein Megabyte mehr im Bundle für dasselbe
 * Ergebnis, und das Layout müsste doppelt gepflegt werden.
 *
 * Was gedruckt wird, steuert das Print-CSS in globals.css: alles mit
 * `no-print` fällt weg, der Rest wird schwarz auf weiss gesetzt.
 */
export function PrintButton({ label = "Als PDF" }: { label?: string }) {
  return (
    <Button variant="ghost" onClick={() => window.print()} className="no-print">
      {label}
    </Button>
  );
}
